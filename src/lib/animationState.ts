// ─── Animation State Management ──────────────────────────────────

export interface Keyframe {
  frame: number;
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  opacity: number;
  originX?: string;
  originY?: string;
}

export interface ObjectTimeline {
  objectId: string; // matches (obj as any)._animId
  keyframes: Keyframe[];
}

export interface AnimationState {
  fps: number;
  totalFrames: number;
  timelines: ObjectTimeline[];
}

export function createDefaultState(): AnimationState {
  return {
    fps: 24,
    totalFrames: 24 * 10, // 10 seconds default
    timelines: [],
  };
}

export function getOrCreateTimeline(state: AnimationState, objectId: string): ObjectTimeline {
  let tl = state.timelines.find((t) => t.objectId === objectId);
  if (!tl) {
    tl = { objectId, keyframes: [] };
    state.timelines.push(tl);
  }
  return tl;
}

export function addKeyframe(timeline: ObjectTimeline, kf: Keyframe): void {
  // Replace existing keyframe at same frame, or insert sorted
  const idx = timeline.keyframes.findIndex((k) => k.frame === kf.frame);
  if (idx >= 0) {
    timeline.keyframes[idx] = kf;
  } else {
    timeline.keyframes.push(kf);
    timeline.keyframes.sort((a, b) => a.frame - b.frame);
  }
}

export function removeKeyframe(timeline: ObjectTimeline, frame: number): void {
  timeline.keyframes = timeline.keyframes.filter((k) => k.frame !== frame);
}

export function interpolateAtFrame(timeline: ObjectTimeline, frame: number): Keyframe | null {
  const kfs = timeline.keyframes;
  if (kfs.length === 0) return null;
  if (kfs.length === 1) return { ...kfs[0] };

  // Before first keyframe
  if (frame <= kfs[0].frame) return { ...kfs[0] };
  // After last keyframe
  if (frame >= kfs[kfs.length - 1].frame) return { ...kfs[kfs.length - 1] };

  // Find surrounding keyframes
  let prev = kfs[0];
  let next = kfs[1];
  for (let i = 0; i < kfs.length - 1; i++) {
    if (kfs[i].frame <= frame && kfs[i + 1].frame >= frame) {
      prev = kfs[i];
      next = kfs[i + 1];
      break;
    }
  }

  // Linear interpolation
  const range = next.frame - prev.frame;
  const t = range === 0 ? 0 : (frame - prev.frame) / range;

  return {
    frame,
    left: prev.left + (next.left - prev.left) * t,
    top: prev.top + (next.top - prev.top) * t,
    scaleX: prev.scaleX + (next.scaleX - prev.scaleX) * t,
    scaleY: prev.scaleY + (next.scaleY - prev.scaleY) * t,
    angle: prev.angle + (next.angle - prev.angle) * t,
    opacity: prev.opacity + (next.opacity - prev.opacity) * t,
  };
}

// Assign unique animation IDs to fabric objects that don't have one
let _nextId = 1;
export function ensureAnimId(obj: any): string {
  if (obj._animId) {
    // Keep the counter ahead of any existing IDs to avoid collisions
    const match = obj._animId.match(/^anim_(\d+)$/);
    if (match) {
      const existing = parseInt(match[1], 10);
      if (existing >= _nextId) _nextId = existing + 1;
    }
    return obj._animId;
  }
  obj._animId = `anim_${_nextId++}`;
  return obj._animId;
}
