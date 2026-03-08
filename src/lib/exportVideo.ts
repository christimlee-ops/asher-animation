// ─── MP4 Export via FFmpeg.wasm ──────────────────────────────────
import { FFmpeg } from '@ffmpeg/ffmpeg';
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
  await ffmpeg.load({
    coreURL: `${baseURL}/ffmpeg-core.js`,
    wasmURL: `${baseURL}/ffmpeg-core.wasm`,
  });
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

  // Save current canvas state
  const originalViewport = canvas.viewportTransform ? [...canvas.viewportTransform] : null;

  // Reset viewport for clean capture
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);

  const frames: Uint8Array[] = [];

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
        (obj as any)._calcBounds();
      }
    }
  };

  for (let frame = 0; frame < totalFrames; frame++) {
    applyAnimToObjects(canvas.getObjects(), frame);
    canvas.discardActiveObject();
    canvas.renderAll();

    // Capture frame as PNG
    const dataUrl = canvas.toDataURL({
      format: 'png',
      multiplier: 1,
      left: 0,
      top: 0,
      width,
      height,
    });

    const res = await fetch(dataUrl);
    const buf = new Uint8Array(await res.arrayBuffer());
    frames.push(buf);

    if (frame % fps === 0) {
      log(`Capturing frame ${frame + 1}/${totalFrames}`);
    }
  }

  // Restore viewport
  if (originalViewport) {
    canvas.setViewportTransform(originalViewport as fabric.TMat2D);
  }
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
