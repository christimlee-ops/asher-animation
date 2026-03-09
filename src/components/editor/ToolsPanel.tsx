import { useState } from 'react';
import ColorPicker from './ColorPicker';

export type ToolName =
  | 'select'
  | 'rectangle'
  | 'circle'
  | 'triangle'
  | 'star'
  | 'line'
  | 'pencil'
  | 'text';

export type ActionName =
  | 'eraser'
  | 'group'
  | 'ungroup'
  | 'duplicate'
  | 'delete';

interface ToolsPanelProps {
  activeTool: ToolName;
  onToolSelect: (tool: ToolName) => void;
  onAction: (action: ActionName) => void;
  fillColor: string;
  strokeColor: string;
  onFillChange: (color: string) => void;
  onStrokeChange: (color: string) => void;
  darkMode: boolean;
}

const TOOLS: { name: ToolName; icon: string; label: string }[] = [
  { name: 'select', icon: '🖱️', label: 'Select' },
  { name: 'rectangle', icon: '▭', label: 'Rectangle' },
  { name: 'circle', icon: '○', label: 'Circle' },
  { name: 'triangle', icon: '△', label: 'Triangle' },
  { name: 'star', icon: '★', label: 'Star' },
  { name: 'line', icon: '╱', label: 'Line' },
  { name: 'pencil', icon: '✏️', label: 'Pencil' },
  { name: 'text', icon: 'T', label: 'Text' },
];

const ACTIONS: { name: ActionName; icon: string; label: string }[] = [
  { name: 'eraser', icon: '🧹', label: 'Eraser' },
  { name: 'group', icon: '📦', label: 'Group' },
  { name: 'ungroup', icon: '📤', label: 'Ungroup' },
  { name: 'duplicate', icon: '📋', label: 'Duplicate' },
  { name: 'delete', icon: '🗑️', label: 'Delete' },
];

export default function ToolsPanel({
  activeTool,
  onToolSelect,
  onAction,
  fillColor,
  strokeColor,
  onFillChange,
  onStrokeChange,
  darkMode,
}: ToolsPanelProps) {
  const [showFillPicker, setShowFillPicker] = useState(false);
  const [showStrokePicker, setShowStrokePicker] = useState(false);

  const panelBg = darkMode ? '#16213e' : '#fff';
  const textColor = darkMode ? '#F5F6FA' : '#2D3436';
  const sectionBorder = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  const styles = {
    panel: {
      display: 'flex',
      flexDirection: 'column' as const,
      backgroundColor: panelBg,
      color: textColor,
      padding: '12px 8px',
      gap: '6px',
      overflowY: 'auto' as const,
      boxShadow: '2px 0 12px rgba(0,0,0,0.08)',
    } as React.CSSProperties,
    sectionTitle: {
      fontSize: '11px',
      fontWeight: 800,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.8px',
      color: darkMode ? '#96CEB4' : '#636E72',
      padding: '8px 4px 4px',
      borderTop: `1px solid ${sectionBorder}`,
      marginTop: '4px',
    } as React.CSSProperties,
    toolBtn: (isActive: boolean) => ({
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 12px',
      borderRadius: '12px',
      border: 'none',
      backgroundColor: isActive
        ? darkMode
          ? '#4ECDC4'
          : '#4ECDC4'
        : darkMode
          ? 'rgba(255,255,255,0.06)'
          : 'rgba(0,0,0,0.03)',
      color: isActive ? '#fff' : textColor,
      fontWeight: isActive ? 800 : 600,
      fontSize: '14px',
      cursor: 'pointer',
      transition: 'all 0.15s',
      boxShadow: isActive ? '0 3px 10px rgba(78,205,196,0.35)' : 'none',
      textAlign: 'left' as const,
      width: '100%',
    }) as React.CSSProperties,
    toolIcon: {
      fontSize: '18px',
      width: '24px',
      textAlign: 'center' as const,
    } as React.CSSProperties,
    actionBtn: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      borderRadius: '12px',
      border: 'none',
      backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
      color: textColor,
      fontWeight: 600,
      fontSize: '13px',
      cursor: 'pointer',
      transition: 'all 0.15s',
      width: '100%',
      textAlign: 'left' as const,
    } as React.CSSProperties,
    colorRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 4px',
      cursor: 'pointer',
    } as React.CSSProperties,
    colorSwatch: (c: string) => ({
      width: '32px',
      height: '32px',
      borderRadius: '8px',
      backgroundColor: c,
      border: '2px solid rgba(0,0,0,0.15)',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      cursor: 'pointer',
      flexShrink: 0,
    }) as React.CSSProperties,
    colorLabel: {
      fontSize: '13px',
      fontWeight: 600,
    } as React.CSSProperties,
    pickerDropdown: {
      position: 'absolute' as const,
      left: '100%',
      top: '0',
      marginLeft: '8px',
      backgroundColor: darkMode ? '#1a1a2e' : '#fff',
      borderRadius: '12px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
      zIndex: 200,
      width: '220px',
    } as React.CSSProperties,
    colorRowWrapper: {
      position: 'relative' as const,
    } as React.CSSProperties,
  };

  const hoverAction = (e: React.MouseEvent) => {
    (e.currentTarget as HTMLElement).style.backgroundColor = darkMode
      ? 'rgba(255,255,255,0.12)'
      : 'rgba(0,0,0,0.08)';
  };
  const unhoverAction = (e: React.MouseEvent) => {
    (e.currentTarget as HTMLElement).style.backgroundColor = darkMode
      ? 'rgba(255,255,255,0.06)'
      : 'rgba(0,0,0,0.03)';
  };

  return (
    <div style={styles.panel}>
      {/* Drawing Tools */}
      <div style={{ ...styles.sectionTitle, borderTop: 'none', marginTop: 0 }}>Tools</div>
      {TOOLS.map((t) => (
        <button
          key={t.name}
          style={styles.toolBtn(activeTool === t.name)}
          onClick={() => onToolSelect(t.name)}
          title={t.label}
        >
          <span style={styles.toolIcon}>{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}

      {/* Colors */}
      <div style={styles.sectionTitle}>Colors</div>
      <div style={styles.colorRowWrapper}>
        <div style={styles.colorRow} onClick={() => { setShowFillPicker(!showFillPicker); setShowStrokePicker(false); }}>
          <div style={styles.colorSwatch(fillColor)} />
          <span style={styles.colorLabel}>Fill</span>
        </div>
        {showFillPicker && (
          <div style={styles.pickerDropdown}>
            <ColorPicker color={fillColor} onChange={(c) => { onFillChange(c); }} label="Fill Color" />
          </div>
        )}
      </div>
      <div style={styles.colorRowWrapper}>
        <div style={styles.colorRow} onClick={() => { setShowStrokePicker(!showStrokePicker); setShowFillPicker(false); }}>
          <div style={styles.colorSwatch(strokeColor)} />
          <span style={styles.colorLabel}>Stroke</span>
        </div>
        {showStrokePicker && (
          <div style={styles.pickerDropdown}>
            <ColorPicker color={strokeColor} onChange={(c) => { onStrokeChange(c); }} label="Stroke Color" />
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={styles.sectionTitle}>Actions</div>
      {ACTIONS.map((a) => (
        <button
          key={a.name}
          style={styles.actionBtn}
          onClick={() => onAction(a.name)}
          title={a.label}
          onMouseEnter={hoverAction}
          onMouseLeave={unhoverAction}
        >
          <span style={styles.toolIcon}>{a.icon}</span>
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}
