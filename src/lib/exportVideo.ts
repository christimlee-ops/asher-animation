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

  // Set up audio context for mixing audio into the export
  const audioCtx = new AudioContext();
  const destination = audioCtx.createMediaStreamDestination();
  const allAudioSources: AudioBufferSourceNode[] = [];

  const sceneFrameCounts: number[] = [];
  // Pre-decode audio for each scene so we know durations for scene length calculation.
  // Store decoded buffers per scene so we can schedule playback later (just-in-time).
  const sceneAudioData: { buffer: AudioBuffer; startFrame: number; volume: number }[][] = [];

  for (let si = 0; si < allScenes.length; si++) {
    const scene = allScenes[si];
    const anim = scene.animState;
    const fps = anim.fps;
    const lastKf = getLastKeyframeFrame(anim);
    let lastAudioEndFrame = 0;

    const decodedTracks: { buffer: AudioBuffer; startFrame: number; volume: number }[] = [];
    const tracks = anim.audioTracks || [];
    for (const track of tracks) {
      try {
        const res = await fetch(track.dataUrl);
        const arrayBuf = await res.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
        decodedTracks.push({ buffer: audioBuffer, startFrame: track.startFrame, volume: track.volume });
        const audioEndFrame = track.startFrame + Math.ceil(audioBuffer.duration * fps);
        lastAudioEndFrame = Math.max(lastAudioEndFrame, audioEndFrame);
      } catch (err) {
        console.warn(`Failed to decode audio track "${track.name}":`, err);
      }
    }
    sceneAudioData.push(decodedTracks);

    // Scene duration = last content point (last keyframe or end of audio)
    const sceneFrames = Math.max(1, lastKf, lastAudioEndFrame);
    sceneFrameCounts.push(sceneFrames);
  }

  const totalFrames = sceneFrameCounts.reduce((a, b) => a + b + 1, 0);

  // Combine video + audio streams
  const combinedStream = new MediaStream();
  for (const vt of videoStream.getVideoTracks()) {
    combinedStream.addTrack(vt);
  }
  if (sceneAudioData.some(tracks => tracks.length > 0)) {
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

    // Schedule this scene's audio NOW, right before rendering begins.
    // This ensures loadFromJSON delays don't cause audio to drift ahead.
    const sceneStartTime = audioCtx.currentTime;
    for (const { buffer, startFrame, volume } of sceneAudioData[si]) {
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = volume;
      source.connect(gainNode);
      gainNode.connect(destination);
      source.start(sceneStartTime + startFrame / fps);
      allAudioSources.push(source);
    }

    for (let frame = 0; frame <= sceneFrames; frame++) {
      const frameStart = performance.now();

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

      // Wait only the remaining time so each frame takes ~frameDuration in wall-clock time.
      const elapsed = performance.now() - frameStart;
      const waitTime = Math.max(0, frameDuration - elapsed);
      await new Promise((r) => setTimeout(r, waitTime));

      globalFrame++;
      if (globalFrame % fps === 0) {
        log(`Recording frame ${globalFrame}/${totalFrames}`);
      }
    }
  }

  recorder.stop();
  await recorderReady;

  for (const source of allAudioSources) {
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
