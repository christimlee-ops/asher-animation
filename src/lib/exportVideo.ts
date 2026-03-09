// ─── MP4 Export via FFmpeg.wasm ──────────────────────────────────
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import * as fabric from 'fabric';
import type { AnimationState } from './animationState';
import { interpolateAtFrame } from './animationState';

let ffmpeg: FFmpeg | null = null;

async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;
  ffmpeg = new FFmpeg();
  if (onLog) {
    ffmpeg.on('log', ({ message }) => onLog(message));
  }
  ffmpeg.on('progress', ({ progress }) => {
    onLog?.(`Encoding: ${Math.round(progress * 100)}%`);
  });
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  // Use toBlobURL to avoid CORS issues with SharedArrayBuffer
  const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
  const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
  await ffmpeg.load({ coreURL, wasmURL });
  return ffmpeg;
}

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
  const log = onProgress || (() => {});

  log('Capturing frames...');

  // Create an offscreen canvas to render frames without affecting the visible canvas
  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext('2d')!;

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

  // Save viewport
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

  const frames: Uint8Array[] = [];

  // Temporarily set viewport for clean capture, but we'll restore between captures
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  canvas.setDimensions({ width, height });

  for (let frame = 0; frame < totalFrames; frame++) {
    applyAnimToObjects(canvas.getObjects(), frame);
    canvas.discardActiveObject();
    canvas.renderAll();

    // Draw the fabric canvas onto our offscreen canvas
    const srcCanvas = canvas.getElement();
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(srcCanvas, 0, 0, width, height);

    // Convert to PNG blob
    const blob = await new Promise<Blob>((resolve) => {
      offscreen.toBlob((b) => resolve(b!), 'image/png');
    });
    const buf = new Uint8Array(await blob.arrayBuffer());
    frames.push(buf);

    if (frame % fps === 0) {
      log(`Capturing frame ${frame + 1}/${totalFrames}`);
    }
  }

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

  log('Loading encoder...');
  const ff = await getFFmpeg(log);

  // Write frames to FFmpeg virtual filesystem
  for (let i = 0; i < frames.length; i++) {
    const name = `frame${String(i).padStart(6, '0')}.png`;
    await ff.writeFile(name, frames[i]);
  }

  log('Encoding video...');
  await ff.exec([
    '-framerate', String(fps),
    '-i', 'frame%06d.png',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'fast',
    '-crf', '23',
    '-y',
    'output.mp4',
  ]);

  const data = await ff.readFile('output.mp4');
  const blob = new Blob([data as BlobPart], { type: 'video/mp4' });

  // Cleanup virtual filesystem
  for (let i = 0; i < frames.length; i++) {
    const name = `frame${String(i).padStart(6, '0')}.png`;
    await ff.deleteFile(name);
  }
  await ff.deleteFile('output.mp4');

  log('Export complete!');
  return blob;
}
