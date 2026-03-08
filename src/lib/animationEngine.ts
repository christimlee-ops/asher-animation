import gsap from 'gsap';
import type {
  Keyframe,
  KeyframeProperties,
  EasingPreset,
  AnimationObject,
  FrameCallback,
} from '../types/animation';

// ─── Easing map ───────────────────────────────────────────────────

const EASING_MAP: Record<EasingPreset, string> = {
  Smooth: 'power2.inOut',
  Bounce: 'bounce.out',
  Snap: 'steps(1)',
  Elastic: 'elastic.out(1,0.3)',
  Linear: 'none',
};

export function getGSAPEasing(preset: EasingPreset): string {
  return EASING_MAP[preset] ?? 'none';
}

// ─── Interpolation ────────────────────────────────────────────────

/**
 * Given a sorted array of keyframes and a current frame number,
 * return the interpolated property values.
 */
export function interpolateFrame(
  keyframes: Keyframe[],
  currentFrame: number
): KeyframeProperties {
  if (keyframes.length === 0) return {};

  // Sort ascending by frame (should already be, but be safe)
  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);

  // Before the first keyframe – clamp to first
  if (currentFrame <= sorted[0].frame) {
    return { ...sorted[0].properties };
  }

  // After the last keyframe – clamp to last
  if (currentFrame >= sorted[sorted.length - 1].frame) {
    return { ...sorted[sorted.length - 1].properties };
  }

  // Find surrounding keyframes
  let prevKf = sorted[0];
  let nextKf = sorted[1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].frame <= currentFrame && sorted[i + 1].frame >= currentFrame) {
      prevKf = sorted[i];
      nextKf = sorted[i + 1];
      break;
    }
  }

  const range = nextKf.frame - prevKf.frame;
  const rawT = range === 0 ? 1 : (currentFrame - prevKf.frame) / range;

  // Apply easing via GSAP parseEase
  const easeFn = gsap.parseEase(getGSAPEasing(nextKf.easing));
  const t = easeFn ? easeFn(rawT) : rawT;

  const result: KeyframeProperties = {};

  const numericKeys: (keyof KeyframeProperties)[] = [
    'x',
    'y',
    'scaleX',
    'scaleY',
    'angle',
    'opacity',
  ];

  for (const key of numericKeys) {
    const a = prevKf.properties[key] as number | undefined;
    const b = nextKf.properties[key] as number | undefined;
    if (a !== undefined && b !== undefined) {
      (result as Record<string, number>)[key] = a + (b - a) * t;
    } else if (a !== undefined) {
      (result as Record<string, number>)[key] = a;
    } else if (b !== undefined) {
      (result as Record<string, number>)[key] = b;
    }
  }

  // Color: simple crossfade via hex lerp
  if (prevKf.properties.fill && nextKf.properties.fill) {
    result.fill = lerpColor(prevKf.properties.fill, nextKf.properties.fill, t);
  } else {
    result.fill = nextKf.properties.fill ?? prevKf.properties.fill;
  }

  return result;
}

// ─── Color lerp helper ────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => {
        const clamped = Math.max(0, Math.min(255, Math.round(v)));
        return clamped.toString(16).padStart(2, '0');
      })
      .join('')
  );
}

function lerpColor(colorA: string, colorB: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(colorA);
  const [r2, g2, b2] = hexToRgb(colorB);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

// ─── Playback engine ──────────────────────────────────────────────

let _playing = false;
let _paused = false;
let _currentFrame = 0;
let _tickerCb: (() => void) | null = null;
let _startTime = 0;
let _pausedAt = 0;

export function isPlaying(): boolean {
  return _playing && !_paused;
}

export function isPaused(): boolean {
  return _paused;
}

export function getCurrentFrame(): number {
  return _currentFrame;
}

/**
 * Apply interpolated keyframe properties to a Fabric.js canvas object.
 */
function applyPropertiesToObject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  canvas: any,
  objectId: string,
  props: KeyframeProperties
) {
  if (!canvas) return;
  const objects = canvas.getObjects ? canvas.getObjects() : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = objects.find((o: any) => o.id === objectId || o.name === objectId);
  if (!target) return;

  if (props.x !== undefined) target.set('left', props.x);
  if (props.y !== undefined) target.set('top', props.y);
  if (props.scaleX !== undefined) target.set('scaleX', props.scaleX);
  if (props.scaleY !== undefined) target.set('scaleY', props.scaleY);
  if (props.angle !== undefined) target.set('angle', props.angle);
  if (props.opacity !== undefined) target.set('opacity', props.opacity);
  if (props.fill !== undefined) target.set('fill', props.fill);

  target.setCoords?.();
}

/**
 * Play animation from the beginning (or from a specific frame).
 */
export function playAnimation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  canvas: any,
  animationObjects: AnimationObject[],
  fps: number,
  totalFrames: number,
  onFrame?: FrameCallback,
  startFrame = 0
): void {
  stopAnimation();

  _playing = true;
  _paused = false;
  _currentFrame = startFrame;
  _startTime = performance.now() - (startFrame / fps) * 1000;

  _tickerCb = () => {
    if (!_playing || _paused) return;

    const elapsed = (performance.now() - _startTime) / 1000;
    _currentFrame = Math.floor(elapsed * fps);

    if (_currentFrame >= totalFrames) {
      stopAnimation();
      onFrame?.(totalFrames);
      return;
    }

    // Interpolate every object
    for (const obj of animationObjects) {
      const props = interpolateFrame(obj.keyframes, _currentFrame);
      applyPropertiesToObject(canvas, obj.id, props);
    }

    canvas?.requestRenderAll?.();
    onFrame?.(_currentFrame);
  };

  gsap.ticker.add(_tickerCb);
}

export function pauseAnimation(): void {
  if (!_playing) return;
  _paused = true;
  _pausedAt = performance.now();
}

export function resumeAnimation(): void {
  if (!_playing || !_paused) return;
  _paused = false;
  // Adjust start time to account for paused duration
  _startTime += performance.now() - _pausedAt;
}

export function stopAnimation(): void {
  if (_tickerCb) {
    gsap.ticker.remove(_tickerCb);
    _tickerCb = null;
  }
  _playing = false;
  _paused = false;
  _currentFrame = 0;
}

export function seekToFrame(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  canvas: any,
  animationObjects: AnimationObject[],
  frame: number
): void {
  _currentFrame = frame;
  for (const obj of animationObjects) {
    const props = interpolateFrame(obj.keyframes, frame);
    applyPropertiesToObject(canvas, obj.id, props);
  }
  canvas?.requestRenderAll?.();
}

// ─── Render frames for export ─────────────────────────────────────

/**
 * Render every frame to canvas and capture as data URL.
 * Returns array of data-URL strings (PNG).
 */
export async function renderFrames(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  canvas: any,
  animationObjects: AnimationObject[],
  fps: number,
  totalFrames: number,
  onProgress?: (frame: number, total: number) => void
): Promise<string[]> {
  const frames: string[] = [];

  for (let f = 0; f < totalFrames; f++) {
    for (const obj of animationObjects) {
      const props = interpolateFrame(obj.keyframes, f);
      applyPropertiesToObject(canvas, obj.id, props);
    }
    canvas?.requestRenderAll?.();
    // Small delay to let canvas render
    await new Promise((r) => setTimeout(r, 1000 / fps / 2));

    const dataUrl: string = canvas?.toDataURL?.({ format: 'png' }) ?? '';
    frames.push(dataUrl);
    onProgress?.(f + 1, totalFrames);
  }

  return frames;
}
