import { useState } from 'react';
import ColorPicker from './ColorPicker';

export type FillMode = 'none' | 'solid' | 'linear' | 'radial';

export interface GradientValue {
  mode: FillMode;
  color: string;
  color1: string;
  color2: string;
  angle: number;
}

interface GradientPickerProps {
  value: GradientValue;
  onChange: (val: GradientValue) => void;
  darkMode: boolean;
}

export function defaultGradientValue(color: string): GradientValue {
  return {
    mode: color === 'transparent' || color === '' ? 'none' : 'solid',
    color: color === 'transparent' || color === '' ? '#4ECDC4' : color,
    color1: color === 'transparent' || color === '' ? '#4ECDC4' : color,
    color2: '#FFFFFF',
    angle: 0,
  };
}

// Checkerboard pattern for transparent preview
const CHECKER_BG = `repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 0 / 12px 12px`;

export default function GradientPicker({ value, onChange, darkMode }: GradientPickerProps) {
  const [editingStop, setEditingStop] = useState<'color1' | 'color2' | null>(null);

  const textColor = darkMode ? '#F5F6FA' : '#2D3436';
  const borderColor = darkMode ? 'rgba(255,255,255,0.12)' : '#DFE6E9';
  const bgColor = darkMode ? 'rgba(255,255,255,0.06)' : '#F5F6FA';

  const tabStyle = (active: boolean) => ({
    flex: 1,
    padding: '6px 0',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: active ? '#4ECDC4' : bgColor,
    color: active ? '#fff' : textColor,
    fontWeight: 700 as const,
    fontSize: '11px',
    cursor: 'pointer' as const,
    transition: 'all 0.15s',
  });

  const swatchStyle = (c: string, active: boolean) => ({
    width: '28px',
    height: '28px',
    borderRadius: '8px',
    backgroundColor: c,
    border: active ? '3px solid #4ECDC4' : `2px solid ${borderColor}`,
    cursor: 'pointer' as const,
    flexShrink: 0 as const,
  });

  const getPreviewGradient = () => {
    if (value.mode === 'none') return CHECKER_BG;
    if (value.mode === 'solid') return value.color;
    if (value.mode === 'linear') {
      return `linear-gradient(${value.angle}deg, ${value.color1}, ${value.color2})`;
    }
    return `radial-gradient(circle, ${value.color1}, ${value.color2})`;
  };

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: '3px', marginBottom: '8px' }}>
        <button style={tabStyle(value.mode === 'none')} onClick={() => onChange({ ...value, mode: 'none' })}>
          None
        </button>
        <button style={tabStyle(value.mode === 'solid')} onClick={() => onChange({ ...value, mode: 'solid' })}>
          Solid
        </button>
        <button style={tabStyle(value.mode === 'linear')} onClick={() => onChange({ ...value, mode: 'linear' })}>
          Linear
        </button>
        <button style={tabStyle(value.mode === 'radial')} onClick={() => onChange({ ...value, mode: 'radial' })}>
          Radial
        </button>
      </div>

      {/* Preview */}
      <div
        style={{
          height: '32px',
          borderRadius: '8px',
          background: getPreviewGradient(),
          border: `2px solid ${borderColor}`,
          marginBottom: '8px',
          position: 'relative',
        }}
      >
        {value.mode === 'none' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 700,
            color: '#FF6B6B',
          }}>
            {/* Red diagonal line through checkerboard = transparent */}
            <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
              <line x1="0" y1="100%" x2="100%" y2="0" stroke="#FF6B6B" strokeWidth="2" />
            </svg>
          </div>
        )}
      </div>

      {value.mode === 'none' && (
        <div style={{ fontSize: '12px', color: darkMode ? '#636E72' : '#B2BEC3', textAlign: 'center', padding: '4px 0' }}>
          Transparent (no fill)
        </div>
      )}

      {value.mode === 'solid' && (
        <ColorPicker
          color={value.color}
          onChange={(c) => onChange({ ...value, color: c, color1: c })}
          label="Color"
        />
      )}

      {(value.mode === 'linear' || value.mode === 'radial') && (
        <>
          {/* Color stops */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
            <div
              style={swatchStyle(value.color1, editingStop === 'color1')}
              onClick={() => setEditingStop(editingStop === 'color1' ? null : 'color1')}
              title="Start color"
            />
            <span style={{ fontSize: '12px', fontWeight: 600, color: textColor }}>Start</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: textColor }}>End</span>
            <div
              style={swatchStyle(value.color2, editingStop === 'color2')}
              onClick={() => setEditingStop(editingStop === 'color2' ? null : 'color2')}
              title="End color"
            />
          </div>

          {editingStop && (
            <div style={{ marginBottom: '6px' }}>
              <ColorPicker
                color={editingStop === 'color1' ? value.color1 : value.color2}
                onChange={(c) => {
                  if (editingStop === 'color1') {
                    onChange({ ...value, color1: c, color: c });
                  } else {
                    onChange({ ...value, color2: c });
                  }
                }}
                label={editingStop === 'color1' ? 'Start Color' : 'End Color'}
              />
            </div>
          )}

          {/* Angle slider (linear only) */}
          {value.mode === 'linear' && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, width: '40px', color: textColor }}>Angle</span>
              <input
                type="range"
                min={0}
                max={360}
                value={value.angle}
                style={{ flex: 1, accentColor: '#4ECDC4' }}
                onChange={(e) => onChange({ ...value, angle: Number(e.target.value) })}
              />
              <span style={{ width: '32px', textAlign: 'right', fontWeight: 700, fontSize: '12px', color: textColor }}>
                {value.angle}°
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
