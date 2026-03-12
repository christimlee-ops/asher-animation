// ─── Video Export via MediaRecorder with audio mixing ────────────
import * as fabric from 'fabric';
import type { AnimationState, Scene } from './animationState';
import { interpolateAtFrame } from './animationState';

export interface ExportOptions {
  canvas: fabric.Canvas;
  animState: AnimationState;
  width: number;
  height: number;
  onProgress?: (msg: string) => void;
}

export interface MultiSceneExportOptions {
  canvas: fabric.Canvas;
  scenes: Scene[];
  activeSceneIndex: number;
  currentCanvasJSON: object;
  currentAnimState: AnimationState;
  width: number;
  height: number;
  onProgress?: (msg: string) => void;
}

function getLastKeyframeFrame(animState: AnimationState): number {
  return animState.timelines.reduce((max, tl) => {
    if (tl.keyframes.length === 0) return max;
    return Math.max(max, tl.keyframes[tl.keyframes.length - 1].frame);
  }, 0);
}

function applyAnimToObjects(objs: fabric.FabricObject[], frame: number, timelines: AnimationState['timelines']) {
  for (const obj of objs) {
    if ((obj as any).excludeFromExport || (obj as any)._isBoundary) continue;
    const id = (obj as any)._animId;
    if (id) {
      const tl = timelines.find((t) => t.objectId === id);
      if (tl && tl.keyframes.length > 0) {
        const kf = interpolateAtFrame(tl, frame);
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
      applyAnimToObjects((obj as fabric.Group).getObjects(), frame, timelines);
      obj.dirty = true;
      obj.setCoords();
    }
  }
}

export async function exportMultiScene({
  canvas,
  scenes,
  activeSceneIndex,
  currentCanvasJSON,
  currentAnimState,
  width,
  height,
  onProgress,
}: MultiSceneExportOptions): Promise<Blob> {
  const log = onProgress || (() => {});

  // Build the full scene list with current scene's live state
  const allScenes = scenes.map((s, i) =>
    i === activeSceneIndex
      ? { ...s, canvasJSON: currentCanvasJSON, animState: currentAnimState }
      : s
  );

  // Create an offscreen canvas for recording
  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext('2d')!;

  const videoStream = offscreen.captureStream(0);

  // Collect all audio tracks across all scenes with their global time offsets
  const audioCtx = new AudioContext();
  const destination = audioCtx.createMediaStreamDestination();
  const audioSources: { source: AudioBufferSourceNode; startTimeSec: number }[] = [];

  let globalFrameOffset = 0;
  const sceneFrameCounts: number[] = [];

  // Calculate frame counts per scene and prepare audio
  for (let si = 0; si < allScenes.length; si++) {
    const scene = allScenes[si];
    const anim = scene.animState;
    const lastKf = getLastKeyframeFrame(anim);
    // At least 1 frame per scene, use last keyframe as the scene duration
    const sceneFrames = Math.max(1, lastKf);
    sceneFrameCounts.push(sceneFrames);

    // Prepare audio for this scene
    const tracks = anim.audioTracks || [];
    for (const track of tracks) {
      try {
        const res = await fetch(track.dataUrl);
        const arrayBuf = await res.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = track.volume;
        source.connect(gainNode);
        gainNode.connect(destination);
        const globalStartSec = (globalFrameOffset + track.startFrame) / anim.fps;
        audioSources.push({ source, startTimeSec: globalStartSec });
      } catch (err) {
        console.warn(`Failed to decode audio track "${track.name}":`, err);
      }
    }

    globalFrameOffset += sceneFrames;
  }

  const totalFrames = sceneFrameCounts.reduce((a, b) => a + b, 0);

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

  // Save original canvas state to restore later
  const originalViewport = canvas.viewportTransform ? [...canvas.viewportTransform] : null;
  const originalWidth = canvas.getWidth();
  const originalHeight = canvas.getHeight();
  const originalCanvasJSON = JSON.stringify(canvas.toObject(['_animId', 'customName', '_locked']));

  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  canvas.setDimensions({ width, height });

  log('Recording frames...');
  recorder.start();

  // Start all audio sources
  const recordingStartTime = audioCtx.currentTime;
  for (const { source, startTimeSec } of audioSources) {
    source.start(recordingStartTime + startTimeSec);
  }

  let globalFrame = 0;

  for (let si = 0; si < allScenes.length; si++) {
    const scene = allScenes[si];
    const sceneFrames = sceneFrameCounts[si];
    const fps = scene.animState.fps;
    const frameDuration = 1000 / fps;

    log(`Scene ${si + 1}/${allScenes.length}: "${scene.name}"`);

    // Load this scene's canvas
    if (scene.canvasJSON) {
      await canvas.loadFromJSON(scene.canvasJSON);
      canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      canvas.setDimensions({ width, height });
    }

    for (let frame = 0; frame <= sceneFrames; frame++) {
      applyAnimToObjects(canvas.getObjects(), frame, scene.animState.timelines);
      canvas.discardActiveObject();
      canvas.renderAll();

      const srcCanvas = canvas.getElement();
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(srcCanvas, 0, 0, width, height);

      const videoTrack = videoStream.getVideoTracks()[0];
      if (videoTrack && 'requestFrame' in videoTrack) {
        (videoTrack as any).requestFrame();
      }

      await new Promise((r) => setTimeout(r, frameDuration));

      globalFrame++;
      if (globalFrame % fps === 0) {
        log(`Recording frame ${globalFrame}/${totalFrames}`);
      }
    }
  }

  recorder.stop();
  await recorderReady;

  for (const { source } of audioSources) {
    try { source.stop(); } catch (_) { /* already stopped */ }
  }
  await audioCtx.close();

  // Restore original canvas state (reload the scene that was active)
  await canvas.loadFromJSON(JSON.parse(originalCanvasJSON));
  if (originalViewport) {
    canvas.setViewportTransform(originalViewport as fabric.TMat2D);
  }
  canvas.setDimensions({ width: originalWidth, height: originalHeight });
  canvas.renderAll();

  const blob = new Blob(chunks, { type: mimeType });
  log('Export complete!');
  return blob;
}

// Legacy single-scene export (kept for compatibility)
export async function exportToMp4(opts: ExportOptions): Promise<Blob> {
  return exportMultiScene({
    canvas: opts.canvas,
    scenes: [{
      id: 'single',
      name: 'Scene 1',
      canvasJSON: opts.canvas.toObject(['_animId', 'customName', '_locked']),
      animState: opts.animState,
    }],
    activeSceneIndex: 0,
    currentCanvasJSON: opts.canvas.toObject(['_animId', 'customName', '_locked']),
    currentAnimState: opts.animState,
    width: opts.width,
    height: opts.height,
    onProgress: opts.onProgress,
  });
}
