import { useState, useEffect, useCallback, useRef } from 'react';
import * as fabric from 'fabric';
import InlineColorPicker from './InlineColorPicker';
import type { ColorMode, GradientValue } from './InlineColorPicker';

interface PropertiesPanelProps {
  selectedObject: fabric.FabricObject | null;
  canvas: fabric.Canvas | null;
  darkMode: boolean;
  onSaveHistory: () => void;
}

function getObjectLabel(obj: fabric.FabricObject): string {
  if ((obj as any).customName) return (obj as any).customName;
  switch (obj.type) {
    case 'rect': return 'Rectangle';
    case 'circle': return 'Circle';
    case 'triangle': return 'Triangle';
    case 'polygon': return 'Star';
    case 'line': return 'Line';
    case 'path': return 'Drawing';
    case 'i-text':
    case 'text': return 'Text';
    case 'image': return 'Image';
    case 'group': return 'Group';
    default: return obj.type || 'Object';
  }
}

function getObjectIcon(obj: fabric.FabricObject): string {
  switch (obj.type) {
    case 'rect': return '▭';
    case 'circle': return '○';
    case 'triangle': return '△';
    case 'polygon': return '★';
    case 'line': return '╱';
    case 'path': return '✏';
    case 'i-text':
    case 'text': return 'T';
    case 'image': return '🖼';
    case 'group': return '📁';
    default: return '◆';
  }
}

export default function PropertiesPanel({
  selectedObject,
  canvas,
  darkMode,
  onSaveHistory,
}: PropertiesPanelProps) {
  const [opacity, setOpacity] = useState(100);
  const [fillColor, setFillColor] = useState('#000000');
  const [fillMode, setFillMode] = useState<ColorMode>('solid');
  const [fillGradient, setFillGradient] = useState<GradientValue>({ color1: '#4ECDC4', color2: '#ffffff', angle: 0 });
  const [strokeColorVal, setStrokeColorVal] = useState('#000000');
  const [strokeMode, setStrokeMode] = useState<ColorMode>('solid');
  const [strokeGradient, setStrokeGradient] = useState<GradientValue>({ color1: '#2D3436', color2: '#ffffff', angle: 0 });
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [objectName, setObjectName] = useState('');
  const [showName, setShowName] = useState(true);
  const [showOpacity, setShowOpacity] = useState(false);
  const [showPivot, setShowPivot] = useState(false);
  const [showFill, setShowFill] = useState(false);
  const [showStroke, setShowStroke] = useState(false);
  const [pivotX, setPivotX] = useState<string>('center');
  const [pivotY, setPivotY] = useState<string>('center');
  const [layers, setLayers] = useState<fabric.FabricObject[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<fabric.FabricObject>>(new Set());
  const [, forceUpdate] = useState(0);

  // Drag-and-drop state
  const [dragItem, setDragItem] = useState<fabric.FabricObject | null>(null);
  const [dropTarget, setDropTarget] = useState<{ obj: fabric.FabricObject | null; position: 'above' | 'below' | 'into' } | null>(null);
  const dragCounter = useRef(0);

  const syncFromObject = useCallback((obj: fabric.FabricObject | null) => {
    if (!obj) return;
    setOpacity(Math.round((obj.opacity ?? 1) * 100));

    // Detect fill mode
    const fill = obj.fill;
    if (fill instanceof fabric.Gradient) {
      setFillMode('gradient');
      const stops = (fill as fabric.Gradient<'linear' | 'radial'>).colorStops || [];
      const c1 = stops[0]?.color || '#000000';
      const c2 = stops[stops.length - 1]?.color || '#ffffff';
      // Try to recover angle from coords
      const coords = (fill as any).coords || {};
      const dx = (coords.x2 || 0) - (coords.x1 || 0);
      const dy = (coords.y2 || 0) - (coords.y1 || 0);
      const angle = Math.round((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
      setFillGradient({ color1: c1, color2: c2, angle });
      setFillColor(c1);
    } else if (!fill || fill === 'transparent' || fill === '' || fill === 'rgba(0,0,0,0)') {
      setFillMode('none');
      setFillColor('#000000');
    } else {
      setFillMode('solid');
      setFillColor(typeof fill === 'string' ? fill : '#000000');
    }

    // Detect stroke mode
    const stroke = obj.stroke;
    if (stroke instanceof fabric.Gradient) {
      setStrokeMode('gradient');
      const stops = (stroke as fabric.Gradient<'linear' | 'radial'>).colorStops || [];
      const c1 = stops[0]?.color || '#000000';
      const c2 = stops[stops.length - 1]?.color || '#ffffff';
      const coords = (stroke as any).coords || {};
      const dx = (coords.x2 || 0) - (coords.x1 || 0);
      const dy = (coords.y2 || 0) - (coords.y1 || 0);
      const angle = Math.round((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
      setStrokeGradient({ color1: c1, color2: c2, angle });
      setStrokeColorVal(c1);
    } else if (!stroke || stroke === 'transparent' || stroke === '') {
      setStrokeMode('none');
      setStrokeColorVal('#000000');
    } else {
      setStrokeMode('solid');
      setStrokeColorVal(typeof stroke === 'string' ? stroke : '#000000');
    }

    setStrokeWidth(obj.strokeWidth || 0);
    setObjectName((obj as any).customName || '');
    // Read origin — could be string or numeric in Fabric.js v7
    const ox = obj.originX;
    const oy = obj.originY;
    if (typeof ox === 'string') {
      setPivotX(ox === 'left' || ox === 'right' ? ox : 'center');
    } else {
      setPivotX(ox <= 0.1 ? 'left' : ox >= 0.9 ? 'right' : 'center');
    }
    if (typeof oy === 'string') {
      setPivotY(oy === 'top' || oy === 'bottom' ? oy : 'center');
    } else {
      setPivotY(oy <= 0.1 ? 'top' : oy >= 0.9 ? 'bottom' : 'center');
    }
  }, []);

  const refreshLayers = useCallback(() => {
    if (!canvas) { setLayers([]); return; }
    const objects = canvas.getObjects().filter(
      (o) => !(o as any).excludeFromExport
    );
    setLayers([...objects].reverse());
  }, [canvas]);

  useEffect(() => {
    syncFromObject(selectedObject);
  }, [selectedObject, syncFromObject]);

  useEffect(() => {
    if (!canvas) return;
    const refresh = () => { refreshLayers(); forceUpdate(n => n + 1); };
    canvas.on('object:added', refresh);
    canvas.on('object:removed', refresh);
    canvas.on('object:modified', refresh);
    canvas.on('selection:created', refresh);
    canvas.on('selection:updated', refresh);
    canvas.on('selection:cleared', refresh);
    refresh();
    return () => {
      canvas.off('object:added', refresh);
      canvas.off('object:removed', refresh);
      canvas.off('object:modified', refresh);
      canvas.off('selection:created', refresh);
      canvas.off('selection:updated', refresh);
      canvas.off('selection:cleared', refresh);
    };
  }, [canvas, refreshLayers]);

  useEffect(() => {
    if (!canvas || !selectedObject) return;
    const handler = () => syncFromObject(canvas.getActiveObject() ?? null);
    canvas.on('object:rotating', handler);
    return () => { canvas.off('object:rotating', handler); };
  }, [canvas, selectedObject, syncFromObject]);

  const applyProp = (setter: () => void) => {
    setter();
    canvas?.renderAll();
    onSaveHistory();
  };

  const makeGradient = (obj: fabric.FabricObject, grad: GradientValue): fabric.Gradient<'linear'> => {
    const w = obj.width || 100;
    const h = obj.height || 100;
    // Convert CSS angle (0=up, clockwise) to math coords
    const cssAngle = ((grad.angle - 90 + 360) % 360);
    const rad = (cssAngle * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    return new fabric.Gradient({
      type: 'linear',
      coords: {
        x1: w / 2 - (cos * w) / 2,
        y1: h / 2 - (sin * h) / 2,
        x2: w / 2 + (cos * w) / 2,
        y2: h / 2 + (sin * h) / 2,
      },
      colorStops: [
        { offset: 0, color: grad.color1 },
        { offset: 1, color: grad.color2 },
      ],
    });
  };

  const isSelected = (obj: fabric.FabricObject) => {
    if (!canvas) return false;
    const active = canvas.getActiveObject();
    if (active === obj) return true;
    if (active?.type === 'activeSelection') {
      return (active as fabric.ActiveSelection).getObjects().includes(obj);
    }
    return false;
  };

  const selectLayer = (obj: fabric.FabricObject, e: React.MouseEvent) => {
    if (!canvas) return;
    if (e.shiftKey) {
      const active = canvas.getActiveObject();
      if (active && active !== obj) {
        const objects = active.type === 'activeSelection'
          ? [...(active as fabric.ActiveSelection).getObjects(), obj]
          : [active, obj];
        const sel = new fabric.ActiveSelection(objects, { canvas });
        canvas.setActiveObject(sel);
      } else {
        canvas.setActiveObject(obj);
      }
    } else {
      canvas.setActiveObject(obj);
    }
    canvas.renderAll();
  };

  const toggleVisibility = (obj: fabric.FabricObject) => {
    obj.visible = !obj.visible;
    canvas?.renderAll();
    onSaveHistory();
    forceUpdate(n => n + 1);
  };

  const toggleLock = (obj: fabric.FabricObject) => {
    const locked = !(obj as any)._locked;
    (obj as any)._locked = locked;
    obj.selectable = !locked;
    obj.evented = !locked;
    // If locked and currently selected, deselect it
    if (locked && canvas) {
      const active = canvas.getActiveObject();
      if (active === obj) {
        canvas.discardActiveObject();
      }
    }
    canvas?.renderAll();
    forceUpdate(n => n + 1);
  };

  // ─── Drag and Drop layer reorder ────────────────────────────────
  const handleDragStart = (obj: fabric.FabricObject, e: React.DragEvent) => {
    setDragItem(obj);
    e.dataTransfer.effectAllowed = 'move';
    // Set a transparent drag image
    const el = e.currentTarget as HTMLElement;
    e.dataTransfer.setDragImage(el, 20, 12);
  };

  const handleDragOver = (obj: fabric.FabricObject, e: React.DragEvent) => {
    e.preventDefault();
    if (!dragItem || dragItem === obj) { setDropTarget(null); return; }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    const isGroup = obj instanceof fabric.Group && !(obj instanceof fabric.ActiveSelection);

    let position: 'above' | 'below' | 'into';
    if (isGroup && y > h * 0.3 && y < h * 0.7) {
      position = 'into';
    } else if (y < h / 2) {
      position = 'above';
    } else {
      position = 'below';
    }

    setDropTarget({ obj, position });
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragLeave = (_obj: fabric.FabricObject, _e: React.DragEvent) => {
    // Only clear if truly leaving (not entering a child)
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
    }
  };

  const handleDragEnter = (_obj: fabric.FabricObject, _e: React.DragEvent) => {
    dragCounter.current++;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!canvas || !dragItem || !dropTarget || !dropTarget.obj) {
      setDragItem(null);
      setDropTarget(null);
      return;
    }

    const target = dropTarget.obj;
    const pos = dropTarget.position;
    const dragParent = (dragItem as any).group as fabric.Group | undefined;
    const targetParent = (target as any).group as fabric.Group | undefined;

    if (pos === 'into') {
      // Drop into group
      const isTargetGroup = target instanceof fabric.Group && !(target instanceof fabric.ActiveSelection);
      if (isTargetGroup && target !== dragParent) {
        const tgtGroup = target as fabric.Group;

        // Remove from current container (exitGroup converts to absolute coords)
        if (dragParent) {
          dragParent.remove(dragItem);
          dragParent.dirty = true;
          dragParent.setCoords();
          try { (dragParent as any)._calcBounds(); } catch (_) {}
        } else {
          canvas.remove(dragItem);
        }

        // add() calls enterGroup which automatically converts absolute coords
        // to the group's local space — no manual conversion needed
        tgtGroup.add(dragItem);
        tgtGroup.dirty = true;
        tgtGroup.setCoords();
        try { (tgtGroup as any)._calcBounds(); } catch (_) {}

        canvas.discardActiveObject();
        canvas.renderAll();
        onSaveHistory();
        refreshLayers();
        setExpandedGroups((prev) => { const next = new Set(prev); next.add(target); return next; });
      }
    } else if (dragParent && !targetParent) {
      // Dragging from inside a group to top-level — remove from group
      const mat = dragItem.calcTransformMatrix();
      dragParent.remove(dragItem);
      dragParent.dirty = true;
      dragParent.setCoords();
      try { (dragParent as any)._calcBounds(); } catch (_) {}

      dragItem.left = mat[4];
      dragItem.top = mat[5];
      dragItem.setCoords();
      canvas.add(dragItem);

      // Now reorder at top level relative to target
      const allObjs = canvas.getObjects();
      const targetIdx = allObjs.indexOf(target);
      if (targetIdx !== -1) {
        const destIdx = pos === 'above' ? targetIdx + 1 : targetIdx;
        canvas.moveObjectTo(dragItem, destIdx);
      }

      canvas.discardActiveObject();
      canvas.renderAll();
      onSaveHistory();
      refreshLayers();
    } else if (dragParent === targetParent) {
      // Reorder within the SAME container (group or canvas)
      // Uses moveObjectTo which directly splices _objects without coordinate transforms
      const container: any = dragParent || canvas;
      const objs = container.getObjects() as fabric.FabricObject[];
      const srcIdx = objs.indexOf(dragItem);
      const tgtIdx = objs.indexOf(target);
      if (srcIdx !== -1 && tgtIdx !== -1 && srcIdx !== tgtIdx) {
        // layers list is reversed: "above" in list = higher z = later in _objects
        let destIdx: number;
        if (pos === 'above') {
          destIdx = srcIdx < tgtIdx ? tgtIdx : tgtIdx + 1;
        } else {
          destIdx = srcIdx < tgtIdx ? tgtIdx - 1 : tgtIdx;
        }
        destIdx = Math.max(0, Math.min(destIdx, objs.length - 1));
        container.moveObjectTo(dragItem, destIdx);
      }
      canvas.renderAll();
      onSaveHistory();
      refreshLayers();
    }

    setDragItem(null);
    setDropTarget(null);
    dragCounter.current = 0;
  };

  const handleDragEnd = () => {
    setDragItem(null);
    setDropTarget(null);
    dragCounter.current = 0;
  };

  const toggleExpanded = (obj: fabric.FabricObject) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(obj)) {
        next.delete(obj);
      } else {
        next.add(obj);
      }
      return next;
    });
  };

  const panelBg = darkMode ? '#16213e' : '#fff';
  const textColor = darkMode ? '#F5F6FA' : '#2D3436';
  const inputBg = darkMode ? 'rgba(255,255,255,0.08)' : '#F5F6FA';
  const borderColor = darkMode ? 'rgba(255,255,255,0.12)' : '#DFE6E9';
  const layerBg = darkMode ? 'rgba(255,255,255,0.04)' : '#F8F9FA';
  const layerSelectedBg = darkMode ? 'rgba(78,205,196,0.2)' : '#E3F9F5';
  const layerHoverBg = darkMode ? 'rgba(255,255,255,0.08)' : '#F0F0F0';

  const styles = {
    panel: {
      display: 'flex',
      flexDirection: 'column' as const,
      backgroundColor: panelBg,
      color: textColor,
      height: '100%',
      boxShadow: '-2px 0 12px rgba(0,0,0,0.08)',
      fontSize: '14px',
      overflow: 'hidden',
    } as React.CSSProperties,
    title: {
      fontSize: '16px',
      fontWeight: 800,
      padding: '12px 12px 8px',
      color: darkMode ? '#4ECDC4' : '#FF6B6B',
      flexShrink: 0,
    } as React.CSSProperties,
    section: {
      padding: '0 12px 10px',
      borderBottom: `1px solid ${borderColor}`,
      flexShrink: 0,
    } as React.CSSProperties,
    sectionLabel: {
      fontSize: '11px',
      fontWeight: 800,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.8px',
      color: darkMode ? '#96CEB4' : '#636E72',
      marginBottom: '6px',
      padding: '8px 0 0',
    } as React.CSSProperties,
    row: {
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
      marginBottom: '6px',
    } as React.CSSProperties,
    input: {
      flex: 1,
      padding: '6px 8px',
      borderRadius: '8px',
      border: `2px solid ${borderColor}`,
      backgroundColor: inputBg,
      color: textColor,
      fontSize: '13px',
      outline: 'none',
      fontWeight: 600,
    } as React.CSSProperties,
    slider: { flex: 1, accentColor: '#4ECDC4' } as React.CSSProperties,
    colorRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      cursor: 'pointer',
      marginBottom: '6px',
    } as React.CSSProperties,
    colorSwatch: (c: string) => ({
      width: '24px',
      height: '24px',
      borderRadius: '6px',
      backgroundColor: c,
      border: `2px solid ${borderColor}`,
      cursor: 'pointer',
      flexShrink: 0,
    }) as React.CSSProperties,
    pickerDropdown: {
      backgroundColor: darkMode ? '#1a1a2e' : '#fff',
      borderRadius: '12px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
      zIndex: 200,
      marginTop: '4px',
    } as React.CSSProperties,
    layersContainer: {
      flex: 1,
      overflowY: 'auto' as const,
      padding: '0 8px 8px',
      minHeight: 0,
    } as React.CSSProperties,
    layerItem: (selected: boolean, depth: number) => ({
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '6px 8px',
      paddingLeft: `${8 + depth * 16}px`,
      borderRadius: '10px',
      backgroundColor: selected ? layerSelectedBg : layerBg,
      border: selected ? '2px solid #4ECDC4' : '2px solid transparent',
      cursor: 'pointer',
      marginBottom: '3px',
      transition: 'all 0.1s',
      userSelect: 'none' as const,
      fontSize: depth > 0 ? '12px' : '13px',
    }) as React.CSSProperties,
    layerIcon: {
      fontSize: '14px',
      width: '20px',
      textAlign: 'center' as const,
      flexShrink: 0,
    } as React.CSSProperties,
    layerName: {
      flex: 1,
      fontSize: '13px',
      fontWeight: 600,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap' as const,
    } as React.CSSProperties,
    layerBtn: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      fontSize: '13px',
      padding: '2px 3px',
      borderRadius: '4px',
      opacity: 0.6,
      color: textColor,
    } as React.CSSProperties,
    expandBtn: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      fontSize: '10px',
      padding: '2px 4px',
      color: textColor,
      opacity: 0.7,
      flexShrink: 0,
      width: '18px',
      textAlign: 'center' as const,
    } as React.CSSProperties,
    emptyLayers: {
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '30px 12px',
      gap: '8px',
      color: darkMode ? '#636E72' : '#B2BEC3',
      textAlign: 'center' as const,
    } as React.CSSProperties,
  };

  // Count all visible items (including nested) for the label
  const countAll = (objs: fabric.FabricObject[]): number => {
    let n = 0;
    for (const o of objs) {
      n++;
      if (o instanceof fabric.Group && !(o instanceof fabric.ActiveSelection)) {
        n += countAll(o.getObjects());
      }
    }
    return n;
  };

  // ─── Drop indicator styles ────────────────────────────────────
  const getDropIndicator = (obj: fabric.FabricObject): React.CSSProperties => {
    if (!dropTarget || dropTarget.obj !== obj) return {};
    if (dropTarget.position === 'above') {
      return { borderTop: '2px solid #4ECDC4' };
    }
    if (dropTarget.position === 'below') {
      return { borderBottom: '2px solid #4ECDC4' };
    }
    if (dropTarget.position === 'into') {
      return { outline: '2px solid #4ECDC4', outlineOffset: '-2px' };
    }
    return {};
  };

  // Recursive layer renderer
  const renderLayerItem = (obj: fabric.FabricObject, depth: number, key: string) => {
    const sel = isSelected(obj);
    const isGroup = obj instanceof fabric.Group && !(obj instanceof fabric.ActiveSelection);
    const expanded = expandedGroups.has(obj);
    const children = isGroup ? (obj as fabric.Group).getObjects() : [];
    const isDragging = dragItem === obj;

    return (
      <div key={key}>
        <div
          draggable
          onDragStart={(e) => handleDragStart(obj, e)}
          onDragOver={(e) => handleDragOver(obj, e)}
          onDragEnter={(e) => handleDragEnter(obj, e)}
          onDragLeave={(e) => handleDragLeave(obj, e)}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          style={{
            ...styles.layerItem(sel, depth),
            ...getDropIndicator(obj),
            opacity: isDragging ? 0.4 : 1,
            cursor: 'grab',
          }}
          onClick={(e) => selectLayer(obj, e)}
          onMouseEnter={(e) => {
            if (!sel && !dragItem) (e.currentTarget as HTMLElement).style.backgroundColor = layerHoverBg;
          }}
          onMouseLeave={(e) => {
            if (!sel && !dragItem) (e.currentTarget as HTMLElement).style.backgroundColor = layerBg;
          }}
        >
          {/* Expand/collapse toggle for groups */}
          {isGroup ? (
            <button
              style={styles.expandBtn}
              onClick={(e) => { e.stopPropagation(); toggleExpanded(obj); }}
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? '▼' : '▶'}
            </button>
          ) : (
            <span style={{ width: '18px', flexShrink: 0 }} />
          )}
          <span style={styles.layerIcon}>{getObjectIcon(obj)}</span>
          <span style={styles.layerName}>
            {(obj as any).customName || getObjectLabel(obj)}
            {isGroup && (
              <span style={{ fontSize: '11px', opacity: 0.5, marginLeft: '4px' }}>
                ({children.length})
              </span>
            )}
          </span>
          <button
            style={{ ...styles.layerBtn, opacity: (obj as any)._locked ? 1 : 0.3 }}
            onClick={(e) => { e.stopPropagation(); toggleLock(obj); }}
            title={(obj as any)._locked ? 'Unlock' : 'Lock'}
          >
            {(obj as any)._locked ? '🔒' : '🔓'}
          </button>
          <button
            style={{ ...styles.layerBtn, opacity: obj.visible ? 0.8 : 0.3 }}
            onClick={(e) => { e.stopPropagation(); toggleVisibility(obj); }}
            title={obj.visible ? 'Hide' : 'Show'}
          >
            {obj.visible !== false ? '👁' : '👁‍🗨'}
          </button>
        </div>
        {/* Render children if expanded */}
        {isGroup && expanded && (
          <div style={{ borderLeft: `2px solid ${darkMode ? 'rgba(78,205,196,0.3)' : '#DFE6E9'}`, marginLeft: `${12 + depth * 16}px`, paddingLeft: '2px' }}>
            {[...children].reverse().map((child, ci) =>
              renderLayerItem(child, depth + 1, `${key}-${ci}`)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={styles.panel}>
      <div style={styles.title}>Properties</div>

      {/* Scrollable wrapper for entire panel content (layers + properties) */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, WebkitOverflowScrolling: 'touch' as any, touchAction: 'pan-y' }}>

      {/* ─── Layers Section (large, scrollable) ─── */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>
          Layers ({countAll(layers)})
        </div>
      </div>
      <div style={{ padding: '0 8px 8px' }}>
        {layers.length === 0 ? (
          <div style={styles.emptyLayers}>
            <div style={{ fontSize: '36px' }}>🎨</div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>No layers yet</div>
            <div style={{ fontSize: '12px' }}>Draw shapes to add layers</div>
          </div>
        ) : (
          layers.map((obj, i) => renderLayerItem(obj, 0, `layer-${i}`))
        )}
      </div>

      {/* ─── Properties for selected object ─── */}
      {selectedObject && (() => {
        const isGroup = selectedObject instanceof fabric.Group && !(selectedObject instanceof fabric.ActiveSelection);
        const isImage = selectedObject.type === 'image';
        const isMulti = selectedObject instanceof fabric.ActiveSelection;
        const disableFillStroke = isGroup || isImage || isMulti;
        const disabledStyle = { opacity: 0.35, pointerEvents: 'none' as const };

        return (
        <>
          {/* Name */}
          <div style={styles.section}>
            <div
              style={{ ...styles.sectionLabel, cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setShowName(!showName)}
            >
              Name {showName ? '▼' : '▶'}
            </div>
            {showName && (
              <input
                style={{ ...styles.input, width: '100%' }}
                value={objectName}
                onChange={(e) => {
                  setObjectName(e.target.value);
                  (selectedObject as any).customName = e.target.value;
                  refreshLayers();
                  // Notify other components (e.g. Timeline) that a name changed
                  canvas?.fire('object:modified', { target: selectedObject });
                }}
                placeholder="Name this layer..."
              />
            )}
          </div>

          {/* Opacity */}
          <div style={styles.section}>
            <div
              style={{ ...styles.sectionLabel, cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setShowOpacity(!showOpacity)}
            >
              Opacity {showOpacity ? '▼' : '▶'}{!showOpacity && <span style={{ float: 'right', fontSize: '11px', opacity: 0.7 }}>{opacity}%</span>}
            </div>
            {showOpacity && (
              <div style={styles.row}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={opacity}
                  style={styles.slider}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setOpacity(v);
                    applyProp(() => selectedObject.set({ opacity: v / 100 }));
                  }}
                />
                <span style={{ width: '32px', textAlign: 'right', fontWeight: 700, fontSize: '13px' }}>
                  {opacity}%
                </span>
              </div>
            )}
          </div>

          {/* Pivot Point */}
          <div style={styles.section}>
            <div
              style={{ ...styles.sectionLabel, cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setShowPivot(!showPivot)}
            >
              Pivot Point {showPivot ? '▼' : '▶'}{!showPivot && <span style={{ float: 'right', fontSize: '11px', opacity: 0.7 }}>{pivotX}, {pivotY}</span>}
            </div>
            {showPivot && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {/* 3x3 grid of pivot positions */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', width: '120px', margin: '0 auto' }}>
                  {(['top', 'center', 'bottom'] as const).map((oy) =>
                    (['left', 'center', 'right'] as const).map((ox) => {
                      const isActive = pivotX === ox && pivotY === oy;
                      return (
                        <button
                          key={`${ox}-${oy}`}
                          onClick={() => {
                            const obj = canvas?.getActiveObject();
                            if (!obj || !canvas) return;
                            const curOx = String(obj.originX);
                            const curOy = String(obj.originY);
                            // Use translateToGivenOrigin to convert left/top
                            // from current origin to new origin — works for group children too
                            const pos = new fabric.Point(obj.left || 0, obj.top || 0);
                            const newPos = obj.translateToGivenOrigin(pos, curOx as any, curOy as any, ox as any, oy as any);
                            obj.originX = ox;
                            obj.originY = oy;
                            obj.left = newPos.x;
                            obj.top = newPos.y;
                            obj.dirty = true;
                            obj.setCoords();
                            // Re-render parent group if inside one
                            if (obj.group) {
                              obj.group.dirty = true;
                              obj.group.setCoords();
                            }
                            setPivotX(ox);
                            setPivotY(oy);
                            canvas.requestRenderAll();
                            onSaveHistory();
                          }}
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '8px',
                            border: isActive ? '2px solid #4ECDC4' : `2px solid ${darkMode ? 'rgba(255,255,255,0.15)' : '#DFE6E9'}`,
                            backgroundColor: isActive
                              ? (darkMode ? 'rgba(78,205,196,0.2)' : 'rgba(78,205,196,0.1)')
                              : (darkMode ? 'rgba(255,255,255,0.06)' : '#F5F6FA'),
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                          }}
                          title={`${oy} ${ox}`}
                        >
                          <div style={{
                            width: isActive ? '10px' : '6px',
                            height: isActive ? '10px' : '6px',
                            borderRadius: '50%',
                            backgroundColor: isActive ? '#4ECDC4' : (darkMode ? '#636E72' : '#B2BEC3'),
                          }} />
                        </button>
                      );
                    })
                  ).flat()}
                </div>
                <div style={{ fontSize: '10px', textAlign: 'center', color: darkMode ? '#636E72' : '#B2BEC3' }}>
                  Sets rotation &amp; scale origin
                </div>
              </div>
            )}
          </div>

          {/* Fill */}
          <div style={{ ...styles.section, ...(disableFillStroke ? disabledStyle : {}) }}>
            <div
              style={{ ...styles.sectionLabel, cursor: disableFillStroke ? 'default' : 'pointer', userSelect: 'none' }}
              onClick={disableFillStroke ? undefined : () => setShowFill(!showFill)}
            >
              Fill {showFill ? '▼' : '▶'}
              {!showFill && (
                fillMode === 'none'
                  ? <span style={{ float: 'right', fontSize: '11px', opacity: 0.7 }}>None</span>
                  : fillMode === 'gradient'
                    ? <span style={{ float: 'right', display: 'inline-block', width: '28px', height: '14px', borderRadius: '3px', background: `linear-gradient(${fillGradient.angle}deg, ${fillGradient.color1}, ${fillGradient.color2})`, border: `1.5px solid ${darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`, verticalAlign: 'middle' }} />
                    : <span style={{ float: 'right', display: 'inline-block', width: '14px', height: '14px', borderRadius: '3px', backgroundColor: fillColor, border: `1.5px solid ${darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`, verticalAlign: 'middle' }} />
              )}
            </div>
            {showFill && !disableFillStroke && (
              <InlineColorPicker
                color={fillColor}
                mode={fillMode}
                gradient={fillGradient}
                onChange={(c) => {
                  setFillColor(c);
                  applyProp(() => selectedObject.set({ fill: c }));
                }}
                onModeChange={(m) => {
                  setFillMode(m);
                  if (m === 'none') {
                    applyProp(() => selectedObject.set({ fill: 'transparent' }));
                  } else if (m === 'solid') {
                    applyProp(() => selectedObject.set({ fill: fillColor }));
                  } else if (m === 'gradient') {
                    applyProp(() => selectedObject.set({ fill: makeGradient(selectedObject, fillGradient) }));
                  }
                }}
                onGradientChange={(g) => {
                  setFillGradient(g);
                  applyProp(() => selectedObject.set({ fill: makeGradient(selectedObject, g) }));
                }}
                storageKey="fill"
                darkMode={darkMode}
              />
            )}
          </div>

          {/* Stroke */}
          <div style={{ ...styles.section, ...(disableFillStroke ? disabledStyle : {}) }}>
            <div
              style={{ ...styles.sectionLabel, cursor: disableFillStroke ? 'default' : 'pointer', userSelect: 'none' }}
              onClick={disableFillStroke ? undefined : () => setShowStroke(!showStroke)}
            >
              Stroke {showStroke ? '▼' : '▶'}
              {!showStroke && (
                strokeMode === 'none'
                  ? <span style={{ float: 'right', fontSize: '11px', opacity: 0.7 }}>None</span>
                  : strokeMode === 'gradient'
                    ? <span style={{ float: 'right', display: 'inline-block', width: '28px', height: '14px', borderRadius: '3px', background: `linear-gradient(${strokeGradient.angle}deg, ${strokeGradient.color1}, ${strokeGradient.color2})`, border: `1.5px solid ${darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`, verticalAlign: 'middle' }} />
                    : <span style={{ float: 'right', display: 'inline-block', width: '14px', height: '14px', borderRadius: '3px', backgroundColor: 'transparent', border: `2px solid ${strokeColorVal}`, verticalAlign: 'middle' }} />
              )}
            </div>
            {showStroke && !disableFillStroke && (
              <>
                <InlineColorPicker
                  color={strokeColorVal}
                  mode={strokeMode}
                  gradient={strokeGradient}
                  onChange={(c) => {
                    setStrokeColorVal(c);
                    applyProp(() => selectedObject.set({ stroke: c }));
                  }}
                  onModeChange={(m) => {
                    setStrokeMode(m);
                    if (m === 'none') {
                      applyProp(() => selectedObject.set({ stroke: 'transparent' }));
                    } else if (m === 'solid') {
                      applyProp(() => selectedObject.set({ stroke: strokeColorVal }));
                    } else if (m === 'gradient') {
                      applyProp(() => selectedObject.set({ stroke: makeGradient(selectedObject, strokeGradient) }));
                    }
                  }}
                  onGradientChange={(g) => {
                    setStrokeGradient(g);
                    applyProp(() => selectedObject.set({ stroke: makeGradient(selectedObject, g) }));
                  }}
                  storageKey="stroke"
                  darkMode={darkMode}
                />
                <div style={{ ...styles.row, marginTop: '4px', padding: '0 8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, width: '50px' }}>Width</span>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    value={strokeWidth}
                    style={styles.slider}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setStrokeWidth(v);
                      applyProp(() => selectedObject.set({ strokeWidth: v }));
                    }}
                  />
                  <span style={{ width: '28px', textAlign: 'right', fontWeight: 700, fontSize: '13px' }}>
                    {strokeWidth}
                  </span>
                </div>
              </>
            )}
          </div>
        </>
        );
      })()}
      </div>{/* end scrollable wrapper */}
    </div>
  );
}
