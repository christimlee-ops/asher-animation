import { useState, useEffect, useCallback } from 'react';
import * as fabric from 'fabric';
import ColorPicker from './ColorPicker';

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
  const [strokeColorVal, setStrokeColorVal] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [objectName, setObjectName] = useState('');
  const [showFillPicker, setShowFillPicker] = useState(false);
  const [showStrokePicker, setShowStrokePicker] = useState(false);
  const [layers, setLayers] = useState<fabric.FabricObject[]>([]);
  const [, forceUpdate] = useState(0);

  const syncFromObject = useCallback((obj: fabric.FabricObject | null) => {
    if (!obj) return;
    setOpacity(Math.round((obj.opacity ?? 1) * 100));
    const fill = obj.fill;
    setFillColor(typeof fill === 'string' ? fill : '#000000');
    setStrokeColorVal(obj.stroke as string || '#000000');
    setStrokeWidth(obj.strokeWidth || 0);
    setObjectName((obj as any).customName || '');
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

  const moveLayerUp = (obj: fabric.FabricObject) => {
    canvas?.bringObjectForward(obj);
    canvas?.renderAll();
    onSaveHistory();
    refreshLayers();
  };

  const moveLayerDown = (obj: fabric.FabricObject) => {
    canvas?.sendObjectBackwards(obj);
    canvas?.renderAll();
    onSaveHistory();
    refreshLayers();
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
    layerItem: (selected: boolean) => ({
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '8px 10px',
      borderRadius: '10px',
      backgroundColor: selected ? layerSelectedBg : layerBg,
      border: selected ? '2px solid #4ECDC4' : '2px solid transparent',
      cursor: 'pointer',
      marginBottom: '4px',
      transition: 'all 0.1s',
      userSelect: 'none' as const,
    }) as React.CSSProperties,
    layerIcon: {
      fontSize: '16px',
      width: '24px',
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
      fontSize: '14px',
      padding: '2px 4px',
      borderRadius: '4px',
      opacity: 0.6,
      color: textColor,
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

  return (
    <div style={styles.panel}>
      <div style={styles.title}>Properties</div>

      {/* ─── Layers Section (large, scrollable) ─── */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>
          Layers ({layers.length})
        </div>
      </div>
      <div style={styles.layersContainer}>
        {layers.length === 0 ? (
          <div style={styles.emptyLayers}>
            <div style={{ fontSize: '36px' }}>🎨</div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>No layers yet</div>
            <div style={{ fontSize: '12px' }}>Draw shapes to add layers</div>
          </div>
        ) : (
          layers.map((obj, i) => {
            const sel = isSelected(obj);
            return (
              <div
                key={i}
                style={styles.layerItem(sel)}
                onClick={(e) => selectLayer(obj, e)}
                onMouseEnter={(e) => {
                  if (!sel) (e.currentTarget as HTMLElement).style.backgroundColor = layerHoverBg;
                }}
                onMouseLeave={(e) => {
                  if (!sel) (e.currentTarget as HTMLElement).style.backgroundColor = layerBg;
                }}
              >
                <span style={styles.layerIcon}>{getObjectIcon(obj)}</span>
                <span style={styles.layerName}>
                  {(obj as any).customName || getObjectLabel(obj)}
                  {obj.type === 'group' && (
                    <span style={{ fontSize: '11px', opacity: 0.5, marginLeft: '4px' }}>
                      ({(obj as fabric.Group).getObjects().length})
                    </span>
                  )}
                </span>
                <button
                  style={{ ...styles.layerBtn, opacity: obj.visible ? 0.8 : 0.3 }}
                  onClick={(e) => { e.stopPropagation(); toggleVisibility(obj); }}
                  title={obj.visible ? 'Hide' : 'Show'}
                >
                  {obj.visible !== false ? '👁' : '👁‍🗨'}
                </button>
                <button
                  style={styles.layerBtn}
                  onClick={(e) => { e.stopPropagation(); moveLayerUp(obj); }}
                  title="Move up"
                >
                  ▲
                </button>
                <button
                  style={styles.layerBtn}
                  onClick={(e) => { e.stopPropagation(); moveLayerDown(obj); }}
                  title="Move down"
                >
                  ▼
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* ─── Properties for selected object ─── */}
      {selectedObject && (
        <>
          {/* Name */}
          <div style={styles.section}>
            <div style={styles.sectionLabel}>Name</div>
            <input
              style={{ ...styles.input, width: '100%' }}
              value={objectName}
              onChange={(e) => {
                setObjectName(e.target.value);
                (selectedObject as any).customName = e.target.value;
                refreshLayers();
              }}
              placeholder="Name this layer..."
            />
          </div>


          {/* Opacity */}
          <div style={styles.section}>
            <div style={styles.sectionLabel}>Opacity</div>
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
          </div>

          {/* Fill Color */}
          <div style={styles.section}>
            <div style={styles.sectionLabel}>Fill</div>
            <div
              style={styles.colorRow}
              onClick={() => { setShowFillPicker(!showFillPicker); setShowStrokePicker(false); }}
            >
              <div style={styles.colorSwatch(fillColor)} />
              <span style={{ fontWeight: 600, fontSize: '13px' }}>{fillColor}</span>
            </div>
            {showFillPicker && (
              <div style={styles.pickerDropdown}>
                <ColorPicker
                  color={fillColor}
                  onChange={(c) => {
                    setFillColor(c);
                    applyProp(() => selectedObject.set({ fill: c }));
                  }}
                />
              </div>
            )}
          </div>

          {/* Stroke */}
          <div style={styles.section}>
            <div style={styles.sectionLabel}>Stroke</div>
            <div
              style={styles.colorRow}
              onClick={() => { setShowStrokePicker(!showStrokePicker); setShowFillPicker(false); }}
            >
              <div style={styles.colorSwatch(strokeColorVal)} />
              <span style={{ fontWeight: 600, fontSize: '13px' }}>{strokeColorVal}</span>
            </div>
            {showStrokePicker && (
              <div style={styles.pickerDropdown}>
                <ColorPicker
                  color={strokeColorVal}
                  onChange={(c) => {
                    setStrokeColorVal(c);
                    applyProp(() => selectedObject.set({ stroke: c }));
                  }}
                />
              </div>
            )}
            <div style={styles.row}>
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
          </div>
        </>
      )}
    </div>
  );
}
