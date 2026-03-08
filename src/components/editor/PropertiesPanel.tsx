import { useState, useEffect, useCallback } from 'react';
import * as fabric from 'fabric';
import ColorPicker from './ColorPicker';

interface PropertiesPanelProps {
  selectedObject: fabric.FabricObject | null;
  canvas: fabric.Canvas | null;
  darkMode: boolean;
  onSaveHistory: () => void;
}

export default function PropertiesPanel({
  selectedObject,
  canvas,
  darkMode,
  onSaveHistory,
}: PropertiesPanelProps) {
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [opacity, setOpacity] = useState(100);
  const [fillColor, setFillColor] = useState('#000000');
  const [strokeColorVal, setStrokeColorVal] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [objectName, setObjectName] = useState('');
  const [lockAspect, setLockAspect] = useState(false);
  const [showFillPicker, setShowFillPicker] = useState(false);
  const [showStrokePicker, setShowStrokePicker] = useState(false);

  const syncFromObject = useCallback((obj: fabric.FabricObject | null) => {
    if (!obj) return;
    setX(Math.round(obj.left || 0));
    setY(Math.round(obj.top || 0));
    setWidth(Math.round((obj.width || 0) * (obj.scaleX || 1)));
    setHeight(Math.round((obj.height || 0) * (obj.scaleY || 1)));
    setRotation(Math.round(obj.angle || 0));
    setOpacity(Math.round((obj.opacity ?? 1) * 100));
    const fill = obj.fill;
    setFillColor(typeof fill === 'string' ? fill : '#000000');
    setStrokeColorVal(obj.stroke as string || '#000000');
    setStrokeWidth(obj.strokeWidth || 0);
    setObjectName((obj as any).customName || obj.type || '');
  }, []);

  useEffect(() => {
    syncFromObject(selectedObject);
  }, [selectedObject, syncFromObject]);

  // Listen for live object movement/resize
  useEffect(() => {
    if (!canvas || !selectedObject) return;
    const handler = () => syncFromObject(canvas.getActiveObject() ?? null);
    canvas.on('object:moving', handler);
    canvas.on('object:scaling', handler);
    canvas.on('object:rotating', handler);
    return () => {
      canvas.off('object:moving', handler);
      canvas.off('object:scaling', handler);
      canvas.off('object:rotating', handler);
    };
  }, [canvas, selectedObject, syncFromObject]);

  const applyProp = (setter: () => void) => {
    setter();
    canvas?.renderAll();
    onSaveHistory();
  };

  const panelBg = darkMode ? '#16213e' : '#fff';
  const textColor = darkMode ? '#F5F6FA' : '#2D3436';
  const inputBg = darkMode ? 'rgba(255,255,255,0.08)' : '#F5F6FA';
  const borderColor = darkMode ? 'rgba(255,255,255,0.12)' : '#DFE6E9';

  const styles = {
    panel: {
      display: 'flex',
      flexDirection: 'column' as const,
      backgroundColor: panelBg,
      color: textColor,
      padding: '12px',
      gap: '12px',
      overflowY: 'auto' as const,
      boxShadow: '-2px 0 12px rgba(0,0,0,0.08)',
      fontSize: '14px',
    } as React.CSSProperties,
    title: {
      fontSize: '16px',
      fontWeight: 800,
      marginBottom: '4px',
      color: darkMode ? '#4ECDC4' : '#FF6B6B',
    } as React.CSSProperties,
    empty: {
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      gap: '12px',
      color: darkMode ? '#636E72' : '#B2BEC3',
      textAlign: 'center' as const,
    } as React.CSSProperties,
    emptyIcon: {
      fontSize: '48px',
    } as React.CSSProperties,
    section: {
      borderBottom: `1px solid ${borderColor}`,
      paddingBottom: '10px',
    } as React.CSSProperties,
    sectionLabel: {
      fontSize: '11px',
      fontWeight: 800,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.8px',
      color: darkMode ? '#96CEB4' : '#636E72',
      marginBottom: '6px',
    } as React.CSSProperties,
    row: {
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
      marginBottom: '6px',
    } as React.CSSProperties,
    label: {
      width: '24px',
      fontWeight: 700,
      fontSize: '12px',
      textAlign: 'right' as const,
      flexShrink: 0,
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
    slider: {
      flex: 1,
      accentColor: '#4ECDC4',
    } as React.CSSProperties,
    lockBtn: (isLocked: boolean) => ({
      padding: '4px 8px',
      borderRadius: '8px',
      border: `2px solid ${borderColor}`,
      backgroundColor: isLocked ? '#4ECDC4' : inputBg,
      color: isLocked ? '#fff' : textColor,
      cursor: 'pointer',
      fontWeight: 700,
      fontSize: '14px',
    }) as React.CSSProperties,
    actionBtn: {
      padding: '8px 12px',
      borderRadius: '10px',
      border: 'none',
      backgroundColor: darkMode ? 'rgba(255,255,255,0.1)' : '#F5F6FA',
      color: textColor,
      fontWeight: 700,
      fontSize: '13px',
      cursor: 'pointer',
      transition: 'all 0.15s',
      flex: 1,
      textAlign: 'center' as const,
    } as React.CSSProperties,
    colorRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      cursor: 'pointer',
      marginBottom: '6px',
    } as React.CSSProperties,
    colorSwatch: (c: string) => ({
      width: '28px',
      height: '28px',
      borderRadius: '8px',
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
  };

  if (!selectedObject) {
    return (
      <div style={styles.panel}>
        <div style={styles.title}>Properties</div>
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>🎯</div>
          <div style={{ fontWeight: 600, fontSize: '15px' }}>No object selected</div>
          <div style={{ fontSize: '13px' }}>Click on a shape on the canvas to see its properties here</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.panel}>
      <div style={styles.title}>Properties</div>

      {/* Name */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>Name</div>
        <input
          style={{ ...styles.input, width: '100%' }}
          value={objectName}
          onChange={(e) => {
            setObjectName(e.target.value);
            (selectedObject as any).customName = e.target.value;
          }}
          placeholder="Object name"
        />
      </div>

      {/* Position */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>Position</div>
        <div style={styles.row}>
          <span style={styles.label}>X</span>
          <input
            style={styles.input}
            type="number"
            value={x}
            onChange={(e) => {
              const v = Number(e.target.value);
              setX(v);
              applyProp(() => selectedObject.set({ left: v }));
            }}
          />
          <span style={styles.label}>Y</span>
          <input
            style={styles.input}
            type="number"
            value={y}
            onChange={(e) => {
              const v = Number(e.target.value);
              setY(v);
              applyProp(() => selectedObject.set({ top: v }));
            }}
          />
        </div>
      </div>

      {/* Size */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>Size</div>
        <div style={styles.row}>
          <span style={styles.label}>W</span>
          <input
            style={styles.input}
            type="number"
            value={width}
            onChange={(e) => {
              const v = Number(e.target.value);
              const ratio = height / width;
              setWidth(v);
              const newScaleX = v / (selectedObject.width || 1);
              selectedObject.set({ scaleX: newScaleX });
              if (lockAspect) {
                const newH = Math.round(v * ratio);
                setHeight(newH);
                selectedObject.set({ scaleY: newH / (selectedObject.height || 1) });
              }
              canvas?.renderAll();
              onSaveHistory();
            }}
            min={1}
          />
          <span style={styles.label}>H</span>
          <input
            style={styles.input}
            type="number"
            value={height}
            onChange={(e) => {
              const v = Number(e.target.value);
              const ratio = width / height;
              setHeight(v);
              const newScaleY = v / (selectedObject.height || 1);
              selectedObject.set({ scaleY: newScaleY });
              if (lockAspect) {
                const newW = Math.round(v * ratio);
                setWidth(newW);
                selectedObject.set({ scaleX: newW / (selectedObject.width || 1) });
              }
              canvas?.renderAll();
              onSaveHistory();
            }}
            min={1}
          />
          <button
            style={styles.lockBtn(lockAspect)}
            onClick={() => setLockAspect(!lockAspect)}
            title={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
          >
            {lockAspect ? '🔒' : '🔓'}
          </button>
        </div>
      </div>

      {/* Rotation */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>Rotation</div>
        <div style={styles.row}>
          <input
            style={styles.input}
            type="number"
            value={rotation}
            min={0}
            max={360}
            onChange={(e) => {
              const v = Number(e.target.value) % 360;
              setRotation(v);
              applyProp(() => selectedObject.set({ angle: v }));
            }}
          />
          <span style={{ fontSize: '13px', fontWeight: 600 }}>deg</span>
        </div>
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
          <span style={{ ...styles.label, width: '60px' }}>Width</span>
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

      {/* Layer order */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>Layer Order</div>
        <div style={styles.row}>
          <button
            style={styles.actionBtn}
            onClick={() => {
              canvas?.bringObjectForward(selectedObject);
              canvas?.renderAll();
              onSaveHistory();
            }}
          >
            ⬆ Forward
          </button>
          <button
            style={styles.actionBtn}
            onClick={() => {
              canvas?.sendObjectBackwards(selectedObject);
              canvas?.renderAll();
              onSaveHistory();
            }}
          >
            ⬇ Backward
          </button>
        </div>
      </div>
    </div>
  );
}
