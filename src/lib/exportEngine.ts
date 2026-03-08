import type { ProgressCallback } from '../types/animation';

// Lazy-loaded FFmpeg instance
let ffmpegInstance: import('@ffmpeg/ffmpeg').FFmpeg | null = null;
let ffmpegLoaded = false;

/**
 * Lazily load and initialise FFmpeg.wasm.
 */
async function getFFmpeg(onProgress?: ProgressCallback): Promise<import('@ffmpeg/ffmpeg').FFmpeg> {
  if (ffmpegInstance && ffmpegLoaded) return ffmpegInstance;

  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  ffmpegInstance = new FFmpeg();

  ffmpegInstance.on('progress', ({ progress }) => {
    onProgress?.(Math.min(progress, 1));
  });

  await ffmpegInstance.load();
  ffmpegLoaded = true;
  return ffmpegInstance;
}

// ─── MP4 export ───────────────────────────────────────────────────

/**
 * Convert an array of data-URL PNG frames into an MP4 video blob.
 */
export async function exportToMP4(
  frames: string[],
  fps: number,
  resolution: '720p' | '1080p' = '1080p',
  onProgress?: ProgressCallback
): Promise<Blob> {
  const { fetchFile } = await import('@ffmpeg/util');
  const ffmpeg = await getFFmpeg(onProgress);

  // Write each frame as a numbered PNG
  for (let i = 0; i < frames.length; i++) {
    const data = await fetchFile(frames[i]);
    const filename = `frame${String(i).padStart(6, '0')}.png`;
    await ffmpeg.writeFile(filename, data);
    onProgress?.((i + 1) / (frames.length + 10)); // rough progress
  }

  const scale = resolution === '720p' ? '1280:720' : '1920:1080';

  await ffmpeg.exec([
    '-framerate',
    String(fps),
    '-i',
    'frame%06d.png',
    '-vf',
    `scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2:color=white`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'fast',
    'output.mp4',
  ]);

  const mp4Data = await ffmpeg.readFile('output.mp4');

  // Clean up written files
  for (let i = 0; i < frames.length; i++) {
    const filename = `frame${String(i).padStart(6, '0')}.png`;
    await ffmpeg.deleteFile(filename).catch(() => {});
  }
  await ffmpeg.deleteFile('output.mp4').catch(() => {});

  onProgress?.(1);

  const uint8 = mp4Data instanceof Uint8Array ? mp4Data : new TextEncoder().encode(mp4Data as string);
  return new Blob([uint8.buffer as ArrayBuffer], { type: 'video/mp4' });
}

// ─── PNG single-frame export ─────────────────────────────────────

/**
 * Export the current canvas state as a PNG file and trigger download.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function exportToPNG(canvas: any, filename = 'frame.png'): void {
  const dataUrl: string = canvas?.toDataURL?.({ format: 'png' }) ?? '';
  if (!dataUrl) return;

  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ─── Export all frames as individual PNGs (zip-less) ──────────────

/**
 * Download every frame as an individual PNG.
 * If JSZip is available we bundle into a zip; otherwise sequential downloads.
 */
export async function exportAllFrames(
  frames: string[],
  onProgress?: ProgressCallback
): Promise<void> {
  // Try to create a zip using dynamic import of JSZip
  try {
    // @ts-ignore - jszip is optional
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    for (let i = 0; i < frames.length; i++) {
      const base64 = frames[i].split(',')[1];
      zip.file(`frame_${String(i).padStart(5, '0')}.png`, base64, { base64: true });
      onProgress?.((i + 1) / frames.length);
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.download = 'animation_frames.zip';
    link.href = URL.createObjectURL(blob);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  } catch {
    // Fallback: download each frame individually
    for (let i = 0; i < frames.length; i++) {
      const link = document.createElement('a');
      link.download = `frame_${String(i).padStart(5, '0')}.png`;
      link.href = frames[i];
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      onProgress?.((i + 1) / frames.length);
      // Small delay so browser doesn't choke on rapid downloads
      await new Promise((r) => setTimeout(r, 80));
    }
  }
}
