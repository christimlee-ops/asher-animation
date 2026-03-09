import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { AnimationObject, Keyframe, EasingPreset } from '../../types/animation';
import {
  playAnimation,
  pauseAnimation,
  resumeAnimation,
  stopAnimation,
  seekToFrame,
  isPlaying,
  isPaused,
} from '../../lib/animationEngine';

// ─── Constants ────────────────────────────────────────────────────

const MIN_FRAME_WIDTH = 4;
const MAX_FRAME_WIDTH = 40;
const DEFAULT_FRAME_WIDTH = 14;
const RULER_HEIGHT = 28;
const LAYER_HEIGHT = 36;
const SCRUBBER_WIDTH = 2;
const MAX_DURATION_SECONDS = 600; // 10 minutes
const FPS_OPTIONS = [12, 24, 30] as const;

// ─── Styles ───────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
    borderTop: '3px solid #e94560',
    fontFamily: '"Comic Sans MS", "Bubblegum Sans", cursive, sans-serif',
    userSelect: 'none',
    height: '100%',
    minHeight: 180,
  },

  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    background: 'linear-gradient(90deg, #0f3460 0%, #16213e 100%)',
    borderBottom: '2px solid #e94560',
    flexShrink: 0,
    flexWrap: 'wrap',
  },

  btn: {
    border: 'none',
    borderRadius: 12,
    padding: '6px 16px',
    fontSize: 18,
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'transform 0.1s, box-shadow 0.1s',
    boxShadow: '0 3px 0 rgba(0,0,0,0.3)',
    color: '#fff',
  },

  playBtn: { background: 'linear-gradient(135deg, #00b894, #00cec9)' },
  pauseBtn: { background: 'linear-gradient(135deg, #fdcb6e, #e17055)' },
  stopBtn: { background: 'linear-gradient(135deg, #e94560, #c0392b)' },

  info: {
    color: '#dfe6e9',
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 0.5,
  },

  fpsSelect: {
    borderRadius: 8,
    border: '2px solid #6c5ce7',
    background: '#2d3436',
    color: '#dfe6e9',
    padding: '4px 8px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },

  zoomBtn: {
    border: '2px solid #6c5ce7',
    borderRadius: 8,
    background: '#2d3436',
    color: '#a29bfe',
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: 16,
    fontWeight: 'bold',
  },

  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },

  layerNames: {
    width: 140,
    flexShrink: 0,
    background: '#0f3460',
    borderRight: '2px solid #533483',
    overflowY: 'auto',
    overflowX: 'hidden',
  },

  layerNameCell: {
    height: LAYER_HEIGHT,
    display: 'flex',
    alignItems: 'center',
    padding: '0 10px',
    color: '#dfe6e9',
    fontSize: 12,
    fontWeight: 700,
    borderBottom: '1px solid #533483',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  timelineScroll: {
    flex: 1,
    overflowX: 'auto',
    overflowY: 'auto',
    position: 'relative',
  },

  rulerRow: {
    height: RULER_HEIGHT,
    position: 'sticky',
    top: 0,
    zIndex: 5,
    background: '#0a1931',
    borderBottom: '2px solid #533483',
  },

  layerRow: {
    height: LAYER_HEIGHT,
    position: 'relative',
    borderBottom: '1px solid rgba(83,52,131,0.4)',
  },

  keyframeDiamond: {
    position: 'absolute',
    top: '50%',
    transform: 'translate(-50%, -50%) rotate(45deg)',
    width: 12,
    height: 12,
    borderRadius: 2,
    cursor: 'grab',
    zIndex: 3,
    border: '2px solid rgba(255,255,255,0.6)',
    transition: 'box-shadow 0.15s',
  },

  scrubber: {
    position: 'absolute',
    top: 0,
    width: SCRUBBER_WIDTH,
    background: '#e94560',
    zIndex: 10,
    pointerEvents: 'none',
  },

  scrubberHead: {
    position: 'absolute',
    top: -2,
    left: -6,
    width: 14,
    height: 14,
    background: '#e94560',
    borderRadius: '50% 50% 50% 0',
    transform: 'rotate(-45deg)',
    border: '2px solid #fff',
    zIndex: 11,
    pointerEvents: 'auto',
    cursor: 'grab',
  },

  contextMenu: {
    position: 'fixed',
    zIndex: 100,
    background: '#1e272e',
    border: '2px solid #6c5ce7',
    borderRadius: 10,
    padding: 4,
    minWidth: 160,
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  },

  contextMenuItem: {
    padding: '6px 14px',
    color: '#dfe6e9',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    width: '100%',
    textAlign: 'left' as const,
  },
};

// ─── Color palette for keyframe diamonds ──────────────────────────

const LAYER_COLORS = [
  '#00b894', '#6c5ce7', '#e17055', '#fdcb6e', '#00cec9',
  '#e94560', '#a29bfe', '#55efc4', '#fab1a0', '#81ecec',
];

// ─── Component Props ──────────────────────────────────────────────

interface TimelineProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  canvas?: any;
  objects: AnimationObject[];
  fps: number;
  totalDurationSeconds: number;
  onFpsChange?: (fps: number) => void;
  onObjectsChange?: (objects: AnimationObject[]) => void;
  onFrameChange?: (frame: number) => void;
}

// ─── Component ────────────────────────────────────────────────────

const Timeline: React.FC<TimelineProps> = ({
  canvas,
  objects,
  fps,
  totalDurationSeconds,
  onFpsChange,
  onObjectsChange,
  onFrameChange,
}) => {
  const clampedDuration = Math.min(totalDurationSeconds, MAX_DURATION_SECONDS);
  const totalFrames = Math.ceil(clampedDuration * fps);

  const [currentFrame, setCurrentFrame] = useState(0);
  const [frameWidth, setFrameWidth] = useState(DEFAULT_FRAME_WIDTH);
  const [playing, setPlaying] = useState(false);
  const [_paused, setPaused] = useState(false);

  // Dragging state
  const [draggingKeyframe, setDraggingKeyframe] = useState<{
    objIndex: number;
    kfIndex: number;
  } | null>(null);

  // Scrubber dragging
  const [scrubbingActive, setScrubbingActive] = useState(false);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    objIndex: number;
    frame: number;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const layerNamesRef = useRef<HTMLDivElement>(null);

  const timelineWidth = totalFrames * frameWidth;

  // ── Sync layer name scroll with timeline scroll ──
  const handleScroll = useCallback(() => {
    if (scrollRef.current && layerNamesRef.current) {
      layerNamesRef.current.scrollTop = scrollRef.current.scrollTop;
    }
  }, []);

  // ── Frame <-> pixel ──
  const frameToX = useCallback(
    (frame: number) => frame * frameWidth,
    [frameWidth]
  );

  const xToFrame = useCallback(
    (x: number) => Math.max(0, Math.min(totalFrames - 1, Math.round(x / frameWidth))),
    [frameWidth, totalFrames]
  );

  // ── Navigate to frame ──
  const goToFrame = useCallback(
    (frame: number) => {
      const f = Math.max(0, Math.min(totalFrames - 1, frame));
      setCurrentFrame(f);
      onFrameChange?.(f);
      if (!isPlaying()) {
        seekToFrame(canvas, objects, f);
      }
    },
    [canvas, objects, totalFrames, onFrameChange]
  );

  // ── Playback controls ──
  const handlePlay = useCallback(() => {
    if (isPaused()) {
      resumeAnimation();
      setPaused(false);
      setPlaying(true);
      return;
    }
    setPlaying(true);
    setPaused(false);
    playAnimation(canvas, objects, fps, totalFrames, (frame) => {
      setCurrentFrame(frame);
      onFrameChange?.(frame);
      if (frame >= totalFrames) {
        setPlaying(false);
      }
    }, currentFrame);
  }, [canvas, objects, fps, totalFrames, currentFrame, onFrameChange]);

  const handlePause = useCallback(() => {
    pauseAnimation();
    setPaused(true);
    setPlaying(false);
  }, []);

  const handleStop = useCallback(() => {
    stopAnimation();
    setPlaying(false);
    setPaused(false);
    goToFrame(0);
  }, [goToFrame]);

  // ── Zoom ──
  const zoomIn = () =>
    setFrameWidth((w) => Math.min(MAX_FRAME_WIDTH, w + 3));
  const zoomOut = () =>
    setFrameWidth((w) => Math.max(MIN_FRAME_WIDTH, w - 3));

  // ── Click on ruler/track to scrub ──
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!scrollRef.current) return;
      const rect = scrollRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
      goToFrame(xToFrame(x));
    },
    [goToFrame, xToFrame]
  );

  // ── Scrubber drag ──
  const handleScrubberDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setScrubbingActive(true);
  }, []);

  useEffect(() => {
    if (!scrubbingActive) return;
    const onMove = (e: MouseEvent) => {
      if (!scrollRef.current) return;
      const rect = scrollRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
      goToFrame(xToFrame(x));
    };
    const onUp = () => setScrubbingActive(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [scrubbingActive, goToFrame, xToFrame]);

  // ── Keyframe dragging ──
  const handleKeyframeDown = useCallback(
    (e: React.MouseEvent, objIndex: number, kfIndex: number) => {
      e.preventDefault();
      e.stopPropagation();
      setDraggingKeyframe({ objIndex, kfIndex });
    },
    []
  );

  useEffect(() => {
    if (!draggingKeyframe) return;
    const onMove = (e: MouseEvent) => {
      if (!scrollRef.current) return;
      const rect = scrollRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
      const newFrame = xToFrame(x);

      const updated = [...objects];
      const obj = { ...updated[draggingKeyframe.objIndex] };
      const kfs = [...obj.keyframes];
      kfs[draggingKeyframe.kfIndex] = { ...kfs[draggingKeyframe.kfIndex], frame: newFrame };
      obj.keyframes = kfs;
      updated[draggingKeyframe.objIndex] = obj;
      onObjectsChange?.(updated);
    };
    const onUp = () => setDraggingKeyframe(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draggingKeyframe, objects, xToFrame, onObjectsChange]);

  // ── Context menu (right-click to add keyframe) ──
  const handleLayerContextMenu = useCallback(
    (e: React.MouseEvent, objIndex: number) => {
      e.preventDefault();
      if (!scrollRef.current) return;
      const rect = scrollRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
      const frame = xToFrame(x);
      setCtxMenu({ x: e.clientX, y: e.clientY, objIndex, frame });
    },
    [xToFrame]
  );

  const addKeyframeAt = useCallback(
    (objIndex: number, frame: number, easing: EasingPreset = 'Smooth') => {
      const updated = [...objects];
      const obj = { ...updated[objIndex] };
      const kfs = [...obj.keyframes];
      // Don't add duplicate at same frame
      if (kfs.some((k) => k.frame === frame)) {
        setCtxMenu(null);
        return;
      }
      const newKf: Keyframe = {
        frame,
        properties: { x: 0, y: 0, scaleX: 1, scaleY: 1, angle: 0, opacity: 1 },
        easing,
      };
      kfs.push(newKf);
      kfs.sort((a, b) => a.frame - b.frame);
      obj.keyframes = kfs;
      updated[objIndex] = obj;
      onObjectsChange?.(updated);
      setCtxMenu(null);
    },
    [objects, onObjectsChange]
  );

  const deleteKeyframeAt = useCallback(
    (objIndex: number, frame: number) => {
      const updated = [...objects];
      const obj = { ...updated[objIndex] };
      obj.keyframes = obj.keyframes.filter((k) => k.frame !== frame);
      updated[objIndex] = obj;
      onObjectsChange?.(updated);
      setCtxMenu(null);
    },
    [objects, onObjectsChange]
  );

  // Close context menu on click elsewhere
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [ctxMenu]);

  // ── Long press on mobile → same as right click ──
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTouchStart = useCallback(
    (e: React.TouchEvent, objIndex: number) => {
      if (!scrollRef.current) return;
      const touch = e.touches[0];
      const rect = scrollRef.current.getBoundingClientRect();
      const x = touch.clientX - rect.left + scrollRef.current.scrollLeft;
      const frame = xToFrame(x);
      longPressTimer.current = setTimeout(() => {
        setCtxMenu({ x: touch.clientX, y: touch.clientY, objIndex, frame });
      }, 500);
    },
    [xToFrame]
  );
  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // ── Render ruler tick marks ──
  const renderRuler = () => {
    const ticks: React.ReactNode[] = [];
    // Show label every N frames depending on zoom
    const interval = frameWidth < 8 ? 24 : frameWidth < 16 ? 12 : 6;
    for (let f = 0; f <= totalFrames; f += interval) {
      ticks.push(
        <div
          key={f}
          style={{
            position: 'absolute',
            left: frameToX(f),
            top: 0,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: 1,
              height: 10,
              background: '#a29bfe',
            }}
          />
          <span
            style={{
              fontSize: 9,
              color: '#a29bfe',
              whiteSpace: 'nowrap',
              marginTop: 1,
            }}
          >
            {f}
          </span>
        </div>
      );
    }
    return ticks;
  };

  // ── Format time display ──
  const formatTime = (frame: number) => {
    const secs = frame / fps;
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const f = frame % fps;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
  };

  // ── Layer row alternating colors ──
  const layerBg = (i: number) =>
    i % 2 === 0 ? 'rgba(15,52,96,0.5)' : 'rgba(22,33,62,0.5)';

  return (
    <div style={styles.container}>
      {/* ── Toolbar ── */}
      <div style={styles.toolbar}>
        {/* Play / Pause */}
        {playing ? (
          <button
            style={{ ...styles.btn, ...styles.pauseBtn }}
            onClick={handlePause}
            title="Pause"
          >
            ⏸
          </button>
        ) : (
          <button
            style={{ ...styles.btn, ...styles.playBtn }}
            onClick={handlePlay}
            title="Play"
          >
            ▶
          </button>
        )}

        {/* Stop */}
        <button
          style={{ ...styles.btn, ...styles.stopBtn }}
          onClick={handleStop}
          title="Stop"
        >
          ⏹
        </button>

        {/* Separator */}
        <div style={{ width: 1, height: 28, background: '#533483', margin: '0 4px' }} />

        {/* Frame info */}
        <span style={styles.info}>
          {formatTime(currentFrame)} &nbsp;|&nbsp; Frame {currentFrame} / {totalFrames}
        </span>

        <div style={{ width: 1, height: 28, background: '#533483', margin: '0 4px' }} />

        {/* FPS selector */}
        <span style={{ ...styles.info, fontSize: 11 }}>FPS</span>
        <select
          style={styles.fpsSelect}
          value={fps}
          onChange={(e) => onFpsChange?.(Number(e.target.value))}
        >
          {FPS_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <div style={{ flex: 1 }} />

        {/* Zoom controls */}
        <button style={styles.zoomBtn} onClick={zoomOut} title="Zoom out">
          −
        </button>
        <button style={styles.zoomBtn} onClick={zoomIn} title="Zoom in">
          +
        </button>
      </div>

      {/* ── Body: layer names + timeline ── */}
      <div style={styles.body}>
        {/* Layer names panel */}
        <div ref={layerNamesRef} style={styles.layerNames}>
          {/* Spacer for ruler */}
          <div
            style={{
              height: RULER_HEIGHT,
              background: '#0a1931',
              borderBottom: '2px solid #533483',
              display: 'flex',
              alignItems: 'center',
              padding: '0 10px',
              color: '#6c5ce7',
              fontSize: 10,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Layers
          </div>
          {objects.map((obj, i) => (
            <div
              key={obj.id}
              style={{
                ...styles.layerNameCell,
                background: layerBg(i),
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: LAYER_COLORS[i % LAYER_COLORS.length],
                  marginRight: 8,
                  flexShrink: 0,
                  transform: 'rotate(45deg)',
                }}
              />
              {obj.name || `Object ${i + 1}`}
            </div>
          ))}
        </div>

        {/* Timeline tracks */}
        <div
          ref={scrollRef}
          style={styles.timelineScroll}
          onScroll={handleScroll}
          onClick={handleTimelineClick}
        >
          <div style={{ width: timelineWidth, position: 'relative' }}>
            {/* Ruler */}
            <div style={{ ...styles.rulerRow, width: timelineWidth, position: 'relative' }}>
              {renderRuler()}
            </div>

            {/* Layer rows */}
            {objects.map((obj, objIdx) => (
              <div
                key={obj.id}
                style={{
                  ...styles.layerRow,
                  width: timelineWidth,
                  background: layerBg(objIdx),
                }}
                onContextMenu={(e) => handleLayerContextMenu(e, objIdx)}
                onTouchStart={(e) => handleTouchStart(e, objIdx)}
                onTouchEnd={handleTouchEnd}
              >
                {/* Keyframe diamonds */}
                {obj.keyframes.map((kf, kfIdx) => (
                  <div
                    key={`${kf.frame}-${kfIdx}`}
                    style={{
                      ...styles.keyframeDiamond,
                      left: frameToX(kf.frame),
                      background: LAYER_COLORS[objIdx % LAYER_COLORS.length],
                      boxShadow:
                        draggingKeyframe?.objIndex === objIdx &&
                        draggingKeyframe?.kfIndex === kfIdx
                          ? `0 0 10px ${LAYER_COLORS[objIdx % LAYER_COLORS.length]}`
                          : '0 1px 4px rgba(0,0,0,0.4)',
                    }}
                    onMouseDown={(e) => handleKeyframeDown(e, objIdx, kfIdx)}
                    title={`Frame ${kf.frame} (${kf.easing})`}
                  />
                ))}
              </div>
            ))}

            {/* Scrubber / playhead */}
            <div
              style={{
                ...styles.scrubber,
                left: frameToX(currentFrame),
                height: RULER_HEIGHT + objects.length * LAYER_HEIGHT,
              }}
            >
              <div
                style={styles.scrubberHead}
                onMouseDown={handleScrubberDown}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Context menu ── */}
      {ctxMenu && (
        <div
          style={{ ...styles.contextMenu, left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '4px 14px', color: '#a29bfe', fontSize: 11, fontWeight: 700 }}>
            Frame {ctxMenu.frame} - {objects[ctxMenu.objIndex]?.name}
          </div>
          <button
            style={styles.contextMenuItem}
            onMouseEnter={(e) => ((e.target as HTMLElement).style.background = '#6c5ce7')}
            onMouseLeave={(e) => ((e.target as HTMLElement).style.background = 'transparent')}
            onClick={() => addKeyframeAt(ctxMenu.objIndex, ctxMenu.frame)}
          >
            + Add Keyframe (Smooth)
          </button>
          <button
            style={styles.contextMenuItem}
            onMouseEnter={(e) => ((e.target as HTMLElement).style.background = '#6c5ce7')}
            onMouseLeave={(e) => ((e.target as HTMLElement).style.background = 'transparent')}
            onClick={() => addKeyframeAt(ctxMenu.objIndex, ctxMenu.frame, 'Bounce')}
          >
            + Add Keyframe (Bounce)
          </button>
          <button
            style={styles.contextMenuItem}
            onMouseEnter={(e) => ((e.target as HTMLElement).style.background = '#6c5ce7')}
            onMouseLeave={(e) => ((e.target as HTMLElement).style.background = 'transparent')}
            onClick={() => addKeyframeAt(ctxMenu.objIndex, ctxMenu.frame, 'Elastic')}
          >
            + Add Keyframe (Elastic)
          </button>
          <button
            style={styles.contextMenuItem}
            onMouseEnter={(e) => ((e.target as HTMLElement).style.background = '#6c5ce7')}
            onMouseLeave={(e) => ((e.target as HTMLElement).style.background = 'transparent')}
            onClick={() => addKeyframeAt(ctxMenu.objIndex, ctxMenu.frame, 'Snap')}
          >
            + Add Keyframe (Snap)
          </button>
          {objects[ctxMenu.objIndex]?.keyframes.some(
            (k) => k.frame === ctxMenu.frame
          ) && (
            <button
              style={{
                ...styles.contextMenuItem,
                color: '#e94560',
              }}
              onMouseEnter={(e) => ((e.target as HTMLElement).style.background = '#e94560')}
              onMouseLeave={(e) => ((e.target as HTMLElement).style.background = 'transparent')}
              onClick={() => deleteKeyframeAt(ctxMenu.objIndex, ctxMenu.frame)}
            >
              Delete Keyframe
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default Timeline;
