// ─── Keyframe & Animation Types ───────────────────────────────────

/** Animatable properties for a canvas object at a given frame. */
export interface KeyframeProperties {
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  opacity?: number;
  fill?: string;
}

/** A single keyframe: a snapshot of properties at a specific frame number. */
export interface Keyframe {
  frame: number;
  properties: KeyframeProperties;
  easing: EasingPreset;
}

/** Easing presets the engine supports. */
export type EasingPreset = 'Smooth' | 'Bounce' | 'Snap' | 'Elastic' | 'Linear';

/** One animatable object on the canvas with its keyframe track. */
export interface AnimationObject {
  id: string;
  name: string;
  keyframes: Keyframe[];
}

// ─── Scene & Project Types ────────────────────────────────────────

export type SceneTransition = 'none' | 'fade' | 'slide' | 'wipe';

export interface Scene {
  id: string;
  name: string;
  objects: AnimationObject[];
  /** Duration in seconds. */
  duration: number;
  transition: SceneTransition;
}

export interface Project {
  id: string;
  name: string;
  scenes: Scene[];
  canvasSize: { width: number; height: number };
  fps: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Export Types ─────────────────────────────────────────────────

export type ExportResolution = '720p' | '1080p';
export type ExportFormat = 'mp4' | 'png' | 'frames';

export interface ExportSettings {
  format: ExportFormat;
  resolution: ExportResolution;
  fps: number;
  quality: number; // 0-1
  includeAudio: boolean;
}

// ─── Callback helpers ─────────────────────────────────────────────

export type ProgressCallback = (progress: number) => void;
export type FrameCallback = (frame: number) => void;
