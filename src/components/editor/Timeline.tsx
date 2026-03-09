import { useState, useRef, useCallback, useEffect } from 'react';
import * as fabric from 'fabric';
import type { AnimationState } from '../../lib/animationState';
import {
  ensureAnimId,
  getOrCreateTimeline,
  addKeyframe,
  removeKeyframe,
  interpolateAtFrame,
  type Keyframe,
} from '../../lib/animationState';

interface TimelineProps {
  canvas: fabric.Canvas | null;
  animState: AnimationState;
  onAnimStateChange: (state: AnimationState) => void;
  darkMode: boolean;
}

function getLabel(obj: fabric.FabricObject): string {
  if ((obj as any).customName) return (obj as any).customName;
  switch (obj.type) {
    case 'rect': return 'Rect';
    case 'circle': return 'Circle';
    case 'triangle': return 'Tri';
    case 'polygon': return 'Star';
    case 'line': return 'Line';
    case 'path': return 'Draw';
    case 'i-text': case 'text': return 'Text';
    case 'image': return 'Img';
    case 'group': return 'Group';
    default: return obj.type || 'Obj';
  }
}

// Collect all animatable objects, including children inside groups
// Returns {obj, depth, parentGroup} for indentation and context
interface TimelineRow {
  obj: fabric.FabricObject;
  depth: number;
  parentGroup: fabric.Group | null;
}

function collectRows(objs: fabric.FabricObject[], depth: number, parent: fabric.Group | null): TimelineRow[] {
  const result: TimelineRow[] = [];
  for (const o of objs) {
    if ((o as any).excludeFromExport || (o as any)._isBoundary) continue;
    result.push({ obj: o, depth, parentGroup: parent });
    if (o instanceof fabric.Group && !(o instanceof fabric.ActiveSelection)) {
      result.push(...collectRows((o as fabric.Group).getObjects(), depth + 1, o as fabric.Group));
    }
  }
  return result;
}

export default function TimelinePanel({ canvas, animState, onAnimStateChange, darkMode }: TimelineProps) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  // Dragging a keyframe diamond
  const [draggingKf, setDraggingKf] = useState<{ objectId: string; fromFrame: number; toFrame: number } | null>(null);
  // selectedAnimId: the object selected for keyframing (may be a group child)
  const [selectedAnimId, setSelectedAnimId] = useState<string | null>(null);
  // Track which group is in "edit children" mode
  const [editingGroup, setEditingGroup] = useState<fabric.Group | null>(null);
  const playRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const frameAreaRef = useRef<HTMLDivElement | null>(null);
  const labelColRef = useRef<HTMLDivElement | null>(null);
  const scrollBodyRef = useRef<HTMLDivElement | null>(null);

  const { fps, totalFrames } = animState;
  const FRAME_W = 8;
  const ROW_H = 26;
  const LABEL_W = 100;
  const totalW = totalFrames * FRAME_W;

  // Build timeline rows (groups + their children, flat list with depth)
  const rows: TimelineRow[] = canvas ? collectRows(canvas.getObjects(), 0, null) : [];

  // Ensure all objects have anim IDs and disable caching on animated objects
  rows.forEach((r) => {
    ensureAnimId(r.obj);
    const id = (r.obj as any)._animId;
    const hasTl = id && animState.timelines.some((t) => t.objectId === id && t.keyframes.length > 0);
    if (hasTl) {
      r.obj.objectCaching = false;
    }
  });

  // Find object by animId (searching recursively)
  const findObjByAnimId = useCallback((id: string): fabric.FabricObject | null => {
    if (!canvas) return null;
    const search = (objs: fabric.FabricObject[]): fabric.FabricObject | null => {
      for (const o of objs) {
        if ((o as any)._animId === id) return o;
        if (o instanceof fabric.Group && !(o instanceof fabric.ActiveSelection)) {
          const found = search((o as fabric.Group).getObjects());
          if (found) return found;
        }
      }
      return null;
    };
    return search(canvas.getObjects());
  }, [canvas]);

  // Force re-render when canvas objects change (names, add/remove, etc.)
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!canvas) return;
    const onSelect = () => {
      const active = canvas.getActiveObject();
      if (active && !(active instanceof fabric.ActiveSelection)) {
        const id = (active as any)._animId;
        if (id) {
          setSelectedAnimId(id);
          // Auto-scroll timeline to show the selected row and its first keyframe
          requestAnimationFrame(() => {
            const labelEl = labelColRef.current;
            const frameEl = scrollBodyRef.current;
            const rowEl = document.querySelector(`[data-timeline-id="${id}"]`) as HTMLElement;
            if (rowEl && labelEl) {
              // Vertical: center the row
              const rowTop = rowEl.offsetTop;
              const scrollTarget = rowTop - labelEl.clientHeight / 2 + ROW_H / 2;
              labelEl.scrollTop = scrollTarget;
              if (frameEl) frameEl.scrollTop = scrollTarget;
            }
            // Horizontal: scroll to the first keyframe of this object
            if (frameEl) {
              const tl = animState.timelines.find((t) => t.objectId === id);
              if (tl && tl.keyframes.length > 0) {
                const firstKfX = tl.keyframes[0].frame * FRAME_W;
                const viewW = frameEl.clientWidth;
                frameEl.scrollLeft = Math.max(0, firstKfX - viewW / 4);
              }
            }
          });
        }
        // Exit group edit mode when selecting via canvas (not timeline)
        // unless the selected object is a child of the editing group
        setEditingGroup((prev) => {
          if (!prev) return null;
          // Check if active is a child of the editing group
          if (prev.getObjects().includes(active)) return prev;
          // Otherwise exit group edit
          prev.interactive = false;
          return null;
        });
      }
    };
    const onClear = () => {
      setSelectedAnimId(null);
      // Exit group edit on deselect
      setEditingGroup((prev) => {
        if (prev) prev.interactive = false;
        return null;
      });
    };
    const refresh = () => forceUpdate((n) => n + 1);

    canvas.on('selection:created', onSelect);
    canvas.on('selection:updated', onSelect);
    canvas.on('selection:cleared', onClear);
    canvas.on('object:modified', refresh);
    canvas.on('object:added', refresh);
    canvas.on('object:removed', refresh);
    return () => {
      canvas.off('selection:created', onSelect);
      canvas.off('selection:updated', onSelect);
      canvas.off('selection:cleared', onClear);
      canvas.off('object:modified', refresh);
      canvas.off('object:added', refresh);
      canvas.off('object:removed', refresh);
    };
  }, [canvas]);

  // ─── Compute last keyframe across all timelines ───────────────
  const lastKeyframeFrame = animState.timelines.reduce((max, tl) => {
    if (tl.keyframes.length === 0) return max;
    const last = tl.keyframes[tl.keyframes.length - 1].frame;
    return Math.max(max, last);
  }, 0);

  // ─── Capture keyframe at current frame for selected object ─────
  // Uses selectedAnimId so it works for group children too
  const captureKeyframe = useCallback(() => {
    if (!canvas || !selectedAnimId) return;
    const obj = findObjByAnimId(selectedAnimId);
    if (!obj) return;

    const newState = { ...animState, timelines: animState.timelines.map((t) => ({ ...t, keyframes: [...t.keyframes] })) };
    const tl = getOrCreateTimeline(newState, selectedAnimId);
    const kf: Keyframe = {
      frame: currentFrame,
      left: obj.left || 0,
      top: obj.top || 0,
      scaleX: obj.scaleX || 1,
      scaleY: obj.scaleY || 1,
      angle: obj.angle || 0,
      opacity: obj.opacity ?? 1,
      originX: String(obj.originX || 'center'),
      originY: String(obj.originY || 'center'),
    };
    addKeyframe(tl, kf);
    onAnimStateChange(newState);
  }, [canvas, animState, currentFrame, onAnimStateChange, selectedAnimId, findObjByAnimId]);

  // ─── Delete keyframe ───────────────────────────────────────────
  const deleteKeyframe = useCallback((objectId: string, frame: number) => {
    const newState = { ...animState, timelines: animState.timelines.map((tl) => ({ ...tl, keyframes: [...tl.keyframes] })) };
    const tl = newState.timelines.find((t) => t.objectId === objectId);
    if (tl) {
      removeKeyframe(tl, frame);
      onAnimStateChange(newState);
    }
  }, [animState, onAnimStateChange]);

  // ─── Apply frame to canvas ─────────────────────────────────────
  const applyFrame = useCallback((frame: number) => {
    if (!canvas) return;

    // Helper: check if any child inside a group has animated keyframes
    const hasAnimatedChildren = (group: fabric.Group): boolean => {
      for (const child of group.getObjects()) {
        const cid = (child as any)._animId;
        if (cid) {
          const ctl = animState.timelines.find((t) => t.objectId === cid);
          if (ctl && ctl.keyframes.length > 0) return true;
        }
        if (child instanceof fabric.Group) {
          if (hasAnimatedChildren(child)) return true;
        }
      }
      return false;
    };

    const applyToObjects = (objs: fabric.FabricObject[]) => {
      for (const obj of objs) {
        if ((obj as any).excludeFromExport || (obj as any)._isBoundary) continue;

        // Recurse into group children first
        if (obj instanceof fabric.Group && !(obj instanceof fabric.ActiveSelection)) {
          applyToObjects((obj as fabric.Group).getObjects());
          // Only recalculate bounds if children were individually animated
          if (hasAnimatedChildren(obj as fabric.Group)) {
            try { (obj as any)._calcBounds(); } catch (_) { /* ignore if not available */ }
          }
          obj.dirty = true;
          obj.setCoords();
        }

        // Apply this object's own keyframe animation
        const id = (obj as any)._animId;
        if (id) {
          const tl = animState.timelines.find((t) => t.objectId === id);
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
      }
    };
    applyToObjects(canvas.getObjects());
    canvas.discardActiveObject();
    canvas.renderAll();
  }, [canvas, animState]);

  // ─── Playback loop (stops at last keyframe) ───────────────────
  useEffect(() => {
    if (!isPlaying) {
      if (playRef.current) cancelAnimationFrame(playRef.current);
      return;
    }
    // Exit group edit mode during playback
    if (editingGroup) {
      editingGroup.interactive = false;
      setEditingGroup(null);
    }
    if (lastKeyframeFrame === 0) {
      setIsPlaying(false);
      return;
    }
    lastTimeRef.current = performance.now();
    let frame = currentFrame;

    const tick = (now: number) => {
      const elapsed = now - lastTimeRef.current;
      const frameDuration = 1000 / fps;
      if (elapsed >= frameDuration) {
        frame++;
        if (frame > lastKeyframeFrame) {
          frame = lastKeyframeFrame;
          setCurrentFrame(lastKeyframeFrame);
          applyFrame(lastKeyframeFrame);
          setIsPlaying(false);
          return;
        }
        setCurrentFrame(frame);
        applyFrame(frame);
        lastTimeRef.current = now - (elapsed % frameDuration);
      }
      playRef.current = requestAnimationFrame(tick);
    };
    playRef.current = requestAnimationFrame(tick);

    return () => {
      if (playRef.current) cancelAnimationFrame(playRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, fps, lastKeyframeFrame]);

  // ─── Scrub to frame ────────────────────────────────────────────
  const scrubTo = useCallback((frame: number) => {
    const f = Math.max(0, Math.min(totalFrames - 1, frame));
    setCurrentFrame(f);
    if (!isPlaying) applyFrame(f);
  }, [totalFrames, isPlaying, applyFrame]);

  // ─── Click-and-drag scrubbing ──────────────────────────────────
  const getFrameFromMouseEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    const area = frameAreaRef.current;
    if (!area) return 0;
    const rect = area.getBoundingClientRect();
    const x = e.clientX - rect.left + area.scrollLeft;
    return Math.round(x / FRAME_W);
  }, [FRAME_W]);

  const handleScrubMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || draggingKf) return;
    setIsScrubbing(true);
    scrubTo(getFrameFromMouseEvent(e));
  }, [scrubTo, getFrameFromMouseEvent, draggingKf]);

  useEffect(() => {
    if (!isScrubbing) return;
    const handleMove = (e: MouseEvent) => {
      scrubTo(getFrameFromMouseEvent(e));
    };
    const handleUp = () => {
      setIsScrubbing(false);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isScrubbing, scrubTo, getFrameFromMouseEvent]);

  // ─── Keyframe diamond drag ──────────────────────────────────────
  const handleKfDragStart = useCallback((e: React.MouseEvent, objectId: string, frame: number) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingKf({ objectId, fromFrame: frame, toFrame: frame });
  }, []);

  useEffect(() => {
    if (!draggingKf) return;
    const handleMove = (e: MouseEvent) => {
      const area = frameAreaRef.current;
      if (!area) return;
      const rect = area.getBoundingClientRect();
      const x = e.clientX - rect.left + area.scrollLeft;
      const newFrame = Math.max(0, Math.min(totalFrames - 1, Math.round(x / FRAME_W)));
      setDraggingKf((prev) => prev ? { ...prev, toFrame: newFrame } : null);
    };
    const handleUp = () => {
      if (draggingKf && draggingKf.fromFrame !== draggingKf.toFrame) {
        // Move keyframe: remove from old frame, add at new frame with same values
        const newState = { ...animState, timelines: animState.timelines.map((tl) => ({ ...tl, keyframes: [...tl.keyframes] })) };
        const tl = newState.timelines.find((t) => t.objectId === draggingKf.objectId);
        if (tl) {
          const kf = tl.keyframes.find((k) => k.frame === draggingKf.fromFrame);
          if (kf) {
            // Check if target frame already has a keyframe
            const existing = tl.keyframes.findIndex((k) => k.frame === draggingKf.toFrame);
            if (existing >= 0) {
              tl.keyframes.splice(existing, 1);
            }
            // Remove old
            removeKeyframe(tl, draggingKf.fromFrame);
            // Add at new position
            addKeyframe(tl, { ...kf, frame: draggingKf.toFrame });
            onAnimStateChange(newState);
          }
        }
      }
      setDraggingKf(null);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingKf, totalFrames, FRAME_W, animState, onAnimStateChange]);

  // ─── Drag-and-drop layers into/out of groups ───────────────────
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragSourceId = useRef<string | null>(null);

  const handleLayerDragStart = useCallback((e: React.DragEvent, row: TimelineRow) => {
    const id = (row.obj as any)._animId;
    dragSourceId.current = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleLayerDragOver = useCallback((e: React.DragEvent, row: TimelineRow) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const id = (row.obj as any)._animId;
    if (id !== dragSourceId.current) {
      setDragOverId(id);
    }
  }, []);

  const handleLayerDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleLayerDrop = useCallback((e: React.DragEvent, targetRow: TimelineRow) => {
    e.preventDefault();
    setDragOverId(null);
    if (!canvas) return;
    const sourceId = dragSourceId.current;
    dragSourceId.current = null;
    if (!sourceId) return;

    const targetId = (targetRow.obj as any)._animId;
    if (sourceId === targetId) return;

    // Find source object
    const findObj = (objs: fabric.FabricObject[], parent: fabric.Group | null): { obj: fabric.FabricObject; parent: fabric.Group | null } | null => {
      for (const o of objs) {
        if ((o as any)._animId === sourceId) return { obj: o, parent };
        if (o instanceof fabric.Group && !(o instanceof fabric.ActiveSelection)) {
          const found = findObj(o.getObjects(), o);
          if (found) return found;
        }
      }
      return null;
    };

    const source = findObj(canvas.getObjects(), null);
    if (!source) return;

    const isTargetGroup = targetRow.obj instanceof fabric.Group && !(targetRow.obj instanceof fabric.ActiveSelection);

    if (isTargetGroup && targetRow.obj !== source.parent) {
      // Drop onto a group — add source to that group
      const targetGroup = targetRow.obj as fabric.Group;

      // Get source's absolute position on canvas
      const srcAbsMatrix = source.obj.calcTransformMatrix();
      const srcCenter = new fabric.Point(srcAbsMatrix[4], srcAbsMatrix[5]);

      // Remove source from its current location
      if (source.parent) {
        source.parent.remove(source.obj);
        source.parent.dirty = true;
        source.parent.setCoords();
        try { (source.parent as any)._calcBounds(); } catch (_) {}
      } else {
        canvas.remove(source.obj);
      }

      // Convert absolute position to the target group's local space
      const groupMatrix = targetGroup.calcTransformMatrix();
      const invGroupMatrix = fabric.util.invertTransform(groupMatrix);
      const localPoint = fabric.util.transformPoint(srcCenter, invGroupMatrix);

      source.obj.left = localPoint.x;
      source.obj.top = localPoint.y;
      source.obj.setCoords();

      targetGroup.add(source.obj);
      targetGroup.dirty = true;
      targetGroup.setCoords();
      try { (targetGroup as any)._calcBounds(); } catch (_) {}

      canvas.discardActiveObject();
      canvas.renderAll();
      onAnimStateChange({ ...animState });
      forceUpdate((n) => n + 1);
    } else if (!isTargetGroup && source.parent) {
      // Drag out of a group to top level
      const srcAbsMatrix = source.obj.calcTransformMatrix();

      source.parent.remove(source.obj);
      source.parent.dirty = true;
      source.parent.setCoords();
      try { (source.parent as any)._calcBounds(); } catch (_) {}

      // Restore absolute position
      source.obj.left = srcAbsMatrix[4];
      source.obj.top = srcAbsMatrix[5];
      source.obj.setCoords();

      canvas.add(source.obj);
      canvas.discardActiveObject();
      canvas.renderAll();
      onAnimStateChange({ ...animState });
      forceUpdate((n) => n + 1);
    }
  }, [canvas, animState, onAnimStateChange]);

  // ─── Exit group edit mode ────────────────────────────────────────
  const exitGroupEdit = useCallback(() => {
    if (editingGroup) {
      editingGroup.interactive = false;
      setEditingGroup(null);
    }
  }, [editingGroup]);

  // ─── Select layer in timeline (works for group children) ───────
  const selectTimelineLayer = useCallback((row: TimelineRow) => {
    const id = (row.obj as any)._animId;
    setSelectedAnimId(id);
    if (!canvas) return;

    if (row.parentGroup) {
      // Child inside a group: enter group edit mode so the child
      // becomes directly selectable and movable on canvas
      if (editingGroup && editingGroup !== row.parentGroup) {
        // Exit previous group edit
        editingGroup.interactive = false;
      }
      row.parentGroup.interactive = true;
      setEditingGroup(row.parentGroup);

      // Now select the child directly
      canvas.setActiveObject(row.obj);
    } else {
      // Top-level object — exit any group edit mode
      exitGroupEdit();

      canvas.setActiveObject(row.obj);
    }
    canvas.renderAll();
  }, [canvas, editingGroup, exitGroupEdit]);

  // ─── FPS / Duration controls ───────────────────────────────────
  const setFps = (newFps: number) => {
    const duration = totalFrames / fps;
    onAnimStateChange({ ...animState, fps: newFps, totalFrames: Math.round(duration * newFps) });
  };

  const setDuration = (secs: number) => {
    onAnimStateChange({ ...animState, totalFrames: Math.round(secs * fps) });
  };

  // ─── Styles ────────────────────────────────────────────────────
  const bg = darkMode ? '#1a1a2e' : '#fff';
  const text = darkMode ? '#F5F6FA' : '#2D3436';
  const border = darkMode ? 'rgba(255,255,255,0.08)' : '#DFE6E9';
  const accent = '#4ECDC4';
  const kfColor = '#FF6B6B';
  const dimText = darkMode ? '#636E72' : '#B2BEC3';

  const btnBase: React.CSSProperties = {
    padding: '4px 8px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: darkMode ? 'rgba(255,255,255,0.1)' : '#F5F6FA',
    color: text,
    fontWeight: 700,
    fontSize: '13px',
    cursor: 'pointer',
    lineHeight: 1,
  };

  // Find the label for the currently selected anim target
  const selectedObj = selectedAnimId ? findObjByAnimId(selectedAnimId) : null;
  const selectedLabel = selectedObj ? getLabel(selectedObj) : null;

  // Check if there's a keyframe at the current frame for the selected object
  const selectedTl = selectedAnimId ? animState.timelines.find((t) => t.objectId === selectedAnimId) : null;
  const hasKfAtCurrentFrame = selectedTl ? selectedTl.keyframes.some((k) => k.frame === currentFrame) : false;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: bg,
      color: text,
      fontSize: '12px',
      overflow: 'hidden',
    }}>
      {/* Controls row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 8px',
        borderBottom: `1px solid ${border}`,
        flexShrink: 0,
      }}>
        <button onClick={() => { scrubTo(0); setIsPlaying(false); }} style={btnBase} title="Stop">⏹</button>
        <button
          onClick={() => {
            if (isPlaying) {
              setIsPlaying(false);
            } else {
              // If at or past the last keyframe, restart from beginning
              if (currentFrame >= lastKeyframeFrame && lastKeyframeFrame > 0) {
                scrubTo(0);
                // Small delay so scrubTo applies before play starts
                setTimeout(() => setIsPlaying(true), 0);
              } else {
                setIsPlaying(true);
              }
            }
          }}
          style={{ ...btnBase, backgroundColor: isPlaying ? kfColor : accent, color: '#fff' }}
          title={isPlaying ? 'Pause' : 'Play'}
        >{isPlaying ? '⏸' : '▶'}</button>
        <button
          onClick={captureKeyframe}
          disabled={!selectedAnimId}
          style={{
            ...btnBase,
            backgroundColor: selectedAnimId ? kfColor : dimText,
            color: '#fff',
            cursor: selectedAnimId ? 'pointer' : 'not-allowed',
          }}
          title={selectedAnimId
            ? `Add keyframe for "${selectedLabel}" at frame ${currentFrame}`
            : 'Select a layer first to add keyframes'}
        >◆ +</button>
        <button
          onClick={() => { if (selectedAnimId && hasKfAtCurrentFrame) deleteKeyframe(selectedAnimId, currentFrame); }}
          disabled={!hasKfAtCurrentFrame}
          style={{
            ...btnBase,
            backgroundColor: hasKfAtCurrentFrame ? '#FF4757' : (darkMode ? 'rgba(255,255,255,0.05)' : '#F0F0F0'),
            color: hasKfAtCurrentFrame ? '#fff' : dimText,
            cursor: hasKfAtCurrentFrame ? 'pointer' : 'not-allowed',
          }}
          title={hasKfAtCurrentFrame
            ? `Delete keyframe at frame ${currentFrame}`
            : 'No keyframe at current frame'}
        >◆ −</button>

        {selectedLabel && (
          <span style={{
            fontSize: '10px',
            fontWeight: 700,
            color: accent,
            backgroundColor: darkMode ? 'rgba(78,205,196,0.15)' : 'rgba(78,205,196,0.1)',
            padding: '2px 6px',
            borderRadius: '4px',
            maxWidth: '80px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {selectedLabel}
          </span>
        )}

        {editingGroup && (
          <button
            onClick={() => {
              exitGroupEdit();
              if (canvas) {
                canvas.setActiveObject(editingGroup);
                canvas.renderAll();
              }
              setSelectedAnimId((editingGroup as any)._animId || null);
            }}
            style={{
              ...btnBase,
              fontSize: '10px',
              padding: '2px 6px',
              backgroundColor: darkMode ? 'rgba(255,107,107,0.2)' : 'rgba(255,107,107,0.1)',
              color: kfColor,
            }}
            title="Exit group editing — return to moving the whole group"
          >
            Exit Group
          </button>
        )}

        <span style={{ fontWeight: 700, minWidth: '80px', fontSize: '11px' }}>
          {Math.floor(currentFrame / fps)}:{String(currentFrame % fps).padStart(2, '0')} / {Math.floor(totalFrames / fps)}s
        </span>

        {lastKeyframeFrame > 0 && (
          <span style={{ fontSize: '10px', color: dimText }}>
            (anim: {(lastKeyframeFrame / fps).toFixed(1)}s)
          </span>
        )}

        <div style={{ flex: 1 }} />

        <label style={{ fontWeight: 600, fontSize: '11px' }}>FPS:</label>
        <select
          value={fps}
          onChange={(e) => setFps(Number(e.target.value))}
          style={{ padding: '2px 4px', borderRadius: '4px', border: `1px solid ${border}`, backgroundColor: bg, color: text, fontSize: '11px' }}
        >
          <option value={12}>12</option>
          <option value={24}>24</option>
          <option value={30}>30</option>
        </select>

        <label style={{ fontWeight: 600, fontSize: '11px' }}>Dur:</label>
        <select
          value={Math.round(totalFrames / fps)}
          onChange={(e) => setDuration(Number(e.target.value))}
          style={{ padding: '2px 4px', borderRadius: '4px', border: `1px solid ${border}`, backgroundColor: bg, color: text, fontSize: '11px' }}
        >
          {[5, 10, 15, 20, 30, 60].map((s) => <option key={s} value={s}>{s}s</option>)}
        </select>
      </div>

      {/* Timeline body — single scroll container for labels + frames */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* Fixed label column — syncs vertical scroll with the frame area */}
        <div style={{ display: 'flex', flexDirection: 'column', width: `${LABEL_W}px`, flexShrink: 0, borderRight: `1px solid ${border}`, overflow: 'hidden' }}>
          {/* Ruler spacer */}
          <div style={{ height: '20px', flexShrink: 0, borderBottom: `1px solid ${border}` }} />
          {/* Labels body — scrolls vertically in sync */}
          <div
            ref={labelColRef}
            style={{ flex: 1, overflowY: 'hidden', overflowX: 'hidden' }}
          >
            {rows.map((row) => {
              const id = (row.obj as any)._animId;
              const tl = animState.timelines.find((t) => t.objectId === id);
              const hasKf = tl && tl.keyframes.length > 0;
              const isSelected = selectedAnimId === id;
              const isGroup = row.obj instanceof fabric.Group && !(row.obj instanceof fabric.ActiveSelection);
              const isEditingThisGroup = isGroup && editingGroup === row.obj;
              const isChildOfEditingGroup = row.parentGroup && editingGroup === row.parentGroup;
              return (
                <div
                  key={id}
                  data-timeline-id={id}
                  draggable
                  onClick={() => selectTimelineLayer(row)}
                  onDragStart={(e) => handleLayerDragStart(e, row)}
                  onDragOver={(e) => handleLayerDragOver(e, row)}
                  onDragLeave={handleLayerDragLeave}
                  onDrop={(e) => handleLayerDrop(e, row)}
                  style={{
                    height: `${ROW_H}px`,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 4px',
                    paddingLeft: `${4 + row.depth * 12}px`,
                    borderBottom: `1px solid ${border}`,
                    fontSize: '11px',
                    fontWeight: isSelected ? 700 : 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: isSelected ? accent : hasKf ? text : dimText,
                    backgroundColor: dragOverId === id
                      ? (darkMode ? 'rgba(78,205,196,0.3)' : 'rgba(78,205,196,0.2)')
                      : isSelected
                        ? (darkMode ? 'rgba(78,205,196,0.15)' : 'rgba(78,205,196,0.08)')
                        : isEditingThisGroup
                          ? (darkMode ? 'rgba(255,107,107,0.1)' : 'rgba(255,107,107,0.06)')
                          : isChildOfEditingGroup
                            ? (darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)')
                            : 'transparent',
                    cursor: 'grab',
                    borderLeft: isSelected ? `2px solid ${accent}` : dragOverId === id ? `2px solid ${accent}` : '2px solid transparent',
                  }}
                  title={row.depth > 0
                    ? `${getLabel(row.obj)} — drag to move, click to edit within group`
                    : isGroup
                      ? `${getLabel(row.obj)} — drag layers here to add to group`
                      : `${getLabel(row.obj)} — drag onto a group, click to select`}
                >
                  {isGroup ? (isEditingThisGroup ? '📂 ' : '📁 ') : row.depth > 0 ? '  ' : ''}{getLabel(row.obj)}
                </div>
              );
            })}
          </div>
        </div>

        {/* Scrollable frame area — drives both horizontal and vertical scroll */}
        <div
          ref={(el) => {
            frameAreaRef.current = el;
            scrollBodyRef.current = el;
          }}
          style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', position: 'relative', cursor: isScrubbing ? 'ew-resize' : 'default' }}
          onMouseDown={handleScrubMouseDown}
          onScroll={() => {
            // Sync label column vertical scroll with frame area
            if (scrollBodyRef.current && labelColRef.current) {
              labelColRef.current.scrollTop = scrollBodyRef.current.scrollTop;
            }
          }}
        >
          {/* Frame ruler */}
          <div
            style={{
              height: '20px',
              width: `${totalW}px`,
              position: 'sticky',
              top: 0,
              zIndex: 2,
              backgroundColor: bg,
              borderBottom: `1px solid ${border}`,
              cursor: 'pointer',
            }}
          >
            {Array.from({ length: Math.ceil(totalFrames / fps) + 1 }, (_, i) => (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  left: `${i * fps * FRAME_W}px`,
                  top: '3px',
                  fontSize: '9px',
                  fontWeight: 700,
                  color: dimText,
                  userSelect: 'none',
                }}
              >{i}s</span>
            ))}
          </div>

          {/* Last keyframe marker */}
          {lastKeyframeFrame > 0 && (
            <div style={{
              position: 'absolute',
              left: `${lastKeyframeFrame * FRAME_W}px`,
              top: 0,
              bottom: 0,
              width: '1px',
              backgroundColor: kfColor,
              opacity: 0.4,
              zIndex: 5,
              pointerEvents: 'none',
            }} />
          )}

          {/* Layer rows with keyframes */}
          <div style={{ width: `${totalW}px`, position: 'relative' }}>
            {rows.map((row) => {
              const id = (row.obj as any)._animId;
              const tl = animState.timelines.find((t) => t.objectId === id);
              const isSelected = selectedAnimId === id;
              return (
                <div
                  key={id}
                  style={{
                    height: `${ROW_H}px`,
                    borderBottom: `1px solid ${border}`,
                    position: 'relative',
                    backgroundColor: isSelected ? (darkMode ? 'rgba(78,205,196,0.08)' : 'rgba(78,205,196,0.04)') : 'transparent',
                  }}
                >
                  {/* Bar between first and last kf */}
                  {tl && tl.keyframes.length >= 2 && (
                    <div style={{
                      position: 'absolute',
                      left: `${tl.keyframes[0].frame * FRAME_W}px`,
                      width: `${(tl.keyframes[tl.keyframes.length - 1].frame - tl.keyframes[0].frame) * FRAME_W}px`,
                      top: `${ROW_H / 2 - 2}px`,
                      height: '4px',
                      backgroundColor: darkMode ? 'rgba(78,205,196,0.3)' : 'rgba(78,205,196,0.2)',
                      borderRadius: '2px',
                      pointerEvents: 'none',
                    }} />
                  )}
                  {/* Keyframe diamonds */}
                  {tl?.keyframes.map((kf) => {
                    const isDragging = draggingKf && draggingKf.objectId === id && draggingKf.fromFrame === kf.frame;
                    const displayFrame = isDragging ? draggingKf!.toFrame : kf.frame;
                    return (
                      <div
                        key={kf.frame}
                        style={{
                          position: 'absolute',
                          left: `${displayFrame * FRAME_W - 5}px`,
                          top: `${ROW_H / 2 - 5}px`,
                          width: '10px',
                          height: '10px',
                          backgroundColor: isDragging ? '#FFD93D' : kfColor,
                          transform: 'rotate(45deg)',
                          borderRadius: '2px',
                          cursor: isDragging ? 'grabbing' : 'grab',
                          zIndex: isDragging ? 20 : 1,
                          boxShadow: isDragging ? '0 2px 8px rgba(0,0,0,0.4)' : '0 1px 3px rgba(0,0,0,0.3)',
                          transition: isDragging ? 'none' : 'box-shadow 0.15s',
                        }}
                        title={isDragging ? `Moving to frame ${displayFrame}` : `Frame ${kf.frame} — drag to move, right-click to delete`}
                        onMouseDown={(e) => { if (e.button === 0) handleKfDragStart(e, id, kf.frame); }}
                        onClick={(e) => { e.stopPropagation(); if (!draggingKf) scrubTo(kf.frame); }}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); deleteKeyframe(id, kf.frame); }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Playhead */}
          <div style={{
            position: 'absolute',
            left: `${currentFrame * FRAME_W}px`,
            top: 0,
            bottom: 0,
            width: '2px',
            backgroundColor: accent,
            zIndex: 10,
            pointerEvents: 'none',
          }}>
            <div style={{
              position: 'absolute',
              top: 0,
              left: '-4px',
              width: '10px',
              height: '14px',
              backgroundColor: accent,
              borderRadius: '0 0 3px 3px',
            }} />
          </div>
        </div>
      </div>
    </div>
  );
}
