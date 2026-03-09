// ─── Video Export via MediaRecorder with audio mixing ────────────
import * as fabric from 'fabric';
import type { AnimationState } from './animationState';
import { interpolateAtFrame } from './animationState';

export interface ExportOptions {
  canvas: fabric.Canvas;
  animState: AnimationState;
  width: number;
  height: number;
  onProgress?: (msg: string) => void;
}

export async function exportToMp4({
  canvas,
  animState,
  width,
  height,
  onProgress,
}: ExportOptions): Promise<Blob> {
  const { fps, totalFrames, timelines } = animState;
  const audioTracks = animState.audioTracks || [];
  const log = onProgress || (() => {});

  // Create an offscreen canvas for recording
  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext('2d')!;

  // Set up combined stream: video from canvas + audio from tracks
  const videoStream = offscreen.captureStream(0); // manual frame control

  // Mix audio tracks into an AudioContext and capture its output
  const audioCtx = new AudioContext();
  const destination = audioCtx.createMediaStreamDestination();
  const audioSources: { source: AudioBufferSourceNode; startTimeSec: number }[] = [];

  // Decode all audio tracks
  if (audioTracks.length > 0) {
    log('Loading audio...');
    for (const track of audioTracks) {
      try {
        const res = await fetch(track.dataUrl);
        const arrayBuf = await res.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        // Apply volume
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = track.volume;
        source.connect(gainNode);
        gainNode.connect(destination);
        audioSources.push({ source, startTimeSec: track.startFrame / fps });
      } catch (err) {
        console.warn(`Failed to decode audio track "${track.name}":`, err);
      }
    }
  }

  // Combine video + audio streams
  const combinedStream = new MediaStream();
  for (const vt of videoStream.getVideoTracks()) {
    combinedStream.addTrack(vt);
  }
  if (audioSources.length > 0) {
    for (const at of destination.stream.getAudioTracks()) {
      combinedStream.addTrack(at);
    }
  }

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
  const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 5_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const recorderReady = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  // Save original object states so we can restore them
  const originalStates: Map<string, Record<string, any>> = new Map();
  const saveOriginalStates = (objs: fabric.FabricObject[]) => {
    for (const obj of objs) {
      const id = (obj as any)._animId;
      if (id) {
        originalStates.set(id, {
          left: obj.left, top: obj.top, scaleX: obj.scaleX, scaleY: obj.scaleY,
          angle: obj.angle, opacity: obj.opacity, originX: obj.originX, originY: obj.originY,
        });
      }
      if (obj instanceof fabric.Group) {
        saveOriginalStates((obj as fabric.Group).getObjects());
      }
    }
  };
  saveOriginalStates(canvas.getObjects());

  // Save viewport and dimensions
  const originalViewport = canvas.viewportTransform ? [...canvas.viewportTransform] : null;
  const originalWidth = canvas.getWidth();
  const originalHeight = canvas.getHeight();

  const applyAnimToObjects = (objs: fabric.FabricObject[], f: number) => {
    for (const obj of objs) {
      if ((obj as any).excludeFromExport || (obj as any)._isBoundary) continue;
      const id = (obj as any)._animId;
      if (id) {
        const tl = timelines.find((t) => t.objectId === id);
        if (tl && tl.keyframes.length > 0) {
          const kf = interpolateAtFrame(tl, f);
          if (kf) {
            obj.set({
              left: kf.left, top: kf.top, scaleX: kf.scaleX, scaleY: kf.scaleY, angle: kf.angle, opacity: kf.opacity,
              ...(kf.originX ? { originX: kf.originX } : {}),
              ...(kf.originY ? { originY: kf.originY } : {}),
            });
            obj.dirty = true;
            obj.setCoords();
          }
        }
      }
      if (obj instanceof fabric.Group) {
        applyAnimToObjects((obj as fabric.Group).getObjects(), f);
        obj.dirty = true;
        obj.setCoords();
        if (typeof (obj as any)._calcBounds === 'function') {
          (obj as any)._calcBounds();
        }
      }
    }
  };

  // Set viewport for clean capture
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  canvas.setDimensions({ width, height });

  log('Recording frames...');
  recorder.start();

  // Start all audio sources at their scheduled times
  const recordingStartTime = audioCtx.currentTime;
  for (const { source, startTimeSec } of audioSources) {
    source.start(recordingStartTime + startTimeSec);
  }

  const frameDuration = 1000 / fps;

  for (let frame = 0; frame < totalFrames; frame++) {
    applyAnimToObjects(canvas.getObjects(), frame);
    canvas.discardActiveObject();
    canvas.renderAll();

    // Draw the fabric canvas onto the recording canvas
    const srcCanvas = canvas.getElement();
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(srcCanvas, 0, 0, width, height);

    // Request a frame from the stream at the right timing
    const videoTrack = videoStream.getVideoTracks()[0];
    if (videoTrack && 'requestFrame' in videoTrack) {
      (videoTrack as any).requestFrame();
    }

    // Wait for frame duration to maintain correct timing
    await new Promise((r) => setTimeout(r, frameDuration));

    if (frame % fps === 0) {
      log(`Recording frame ${frame + 1}/${totalFrames}`);
    }
  }

  recorder.stop();
  await recorderReady;

  // Stop audio sources
  for (const { source } of audioSources) {
    try { source.stop(); } catch (_) { /* already stopped */ }
  }
  await audioCtx.close();

  // Restore original object states
  const restoreStates = (objs: fabric.FabricObject[]) => {
    for (const obj of objs) {
      const id = (obj as any)._animId;
      if (id && originalStates.has(id)) {
        obj.set(originalStates.get(id)!);
        obj.dirty = true;
        obj.setCoords();
      }
      if (obj instanceof fabric.Group) {
        restoreStates((obj as fabric.Group).getObjects());
        obj.dirty = true;
        obj.setCoords();
        if (typeof (obj as any)._calcBounds === 'function') {
          (obj as any)._calcBounds();
        }
      }
    }
  };
  restoreStates(canvas.getObjects());

  // Restore viewport and dimensions
  if (originalViewport) {
    canvas.setViewportTransform(originalViewport as fabric.TMat2D);
  }
  canvas.setDimensions({ width: originalWidth, height: originalHeight });
  canvas.renderAll();

  const blob = new Blob(chunks, { type: mimeType });
  log('Export complete!');
  return blob;
}
