import { useRef, useCallback, useEffect, useState } from 'react';

export type ColorMode = 'solid' | 'gradient' | 'none';

export interface GradientValue {
  color1: string;
  color2: string;
  angle: number;
}

interface InlineColorPickerProps {
  color: string;
  mode: ColorMode;
  gradient?: GradientValue;
  onChange: (color: string) => void;
  onModeChange: (mode: ColorMode) => void;
  onGradientChange?: (gradient: GradientValue) => void;
  storageKey: string;
  darkMode: boolean;
}

const RECENT_KEY_PREFIX = 'ashermate_recent_';
const MAX_RECENT = 10;

// ─── Color conversion helpers ────────────────────────────────────
function safeHex(color: string): string {
  if (!color || color === 'transparent' || color === 'none' || color === '') return '#000000';
  if (color.startsWith('#') && color.length === 7 && /^#[0-9a-fA-F]{6}$/.test(color)) return color;
  if (color.startsWith('#') && color.length === 4 && /^#[0-9a-fA-F]{3}$/.test(color)) {
    return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
  }
  // Named colors / rgb() — parse via temporary canvas
  try {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.fillStyle = color;
    const parsed = ctx.fillStyle; // browser normalizes to #rrggbb or rgb(...)
    if (parsed.startsWith('#')) return parsed;
    const m = parsed.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (m) {
      const toH = (n: string) => parseInt(n).toString(16).padStart(2, '0');
      return `#${toH(m[1])}${toH(m[2])}${toH(m[3])}`;
    }
  } catch { /* fallback */ }
  return '#000000';
}

function hexToHsv(hex: string): [number, number, number] {
  const safe = safeHex(hex);
  const r = parseInt(safe.slice(1, 3), 16) / 255;
  const g = parseInt(safe.slice(3, 5), 16) / 255;
  const b = parseInt(safe.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

function hsvToHex(h: number, s: number, v: number): string {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0, g = 0, b = 0;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hueToHex(h: number): string {
  return hsvToHex(h, 1, 1);
}

function loadRecent(key: string): string[] {
  try {
    const saved = localStorage.getItem(RECENT_KEY_PREFIX + key);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

function saveRecent(key: string, colors: string[]) {
  localStorage.setItem(RECENT_KEY_PREFIX + key, JSON.stringify(colors));
}

// Checkerboard pattern for transparent preview
const CHECKER_BG = `repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 0 / 8px 8px`;

export default function InlineColorPicker({
  color,
  mode,
  gradient,
  onChange,
  onModeChange,
  onGradientChange,
  storageKey,
  darkMode,
}: InlineColorPickerProps) {
  const safeColor = safeHex(color);
  const [hsv, setHsv] = useState<[number, number, number]>(() => hexToHsv(safeColor));
  const [recentColors, setRecentColors] = useState<string[]>(() => loadRecent(storageKey));
  const [editingStop, setEditingStop] = useState<0 | 1>(0); // which gradient stop is being edited
  const svRef = useRef<HTMLDivElement>(null);
  const svCanvasRef = useRef<HTMLCanvasElement>(null);
  const hueCanvasRef = useRef<HTMLCanvasElement>(null);
  const draggingSV = useRef(false);
  const draggingHue = useRef(false);

  const grad = gradient || { color1: safeColor, color2: '#ffffff', angle: 0 };

  // Sync from external color changes
  useEffect(() => {
    const safe = safeHex(color);
    if (mode === 'solid' && hsvToHex(hsv[0], hsv[1], hsv[2]) !== safe) {
      setHsv(hexToHsv(safe));
    }
  }, [color, mode]);

  // When editing gradient stops, sync HSV to the active stop
  useEffect(() => {
    if (mode === 'gradient') {
      const stopColor = editingStop === 0 ? grad.color1 : grad.color2;
      setHsv(hexToHsv(safeHex(stopColor)));
    }
  }, [editingStop, mode]);

  // Measure container width
  const [containerW, setContainerW] = useState(220);
  useEffect(() => {
    const el = svRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerW(el.clientWidth - 24);
    });
    ro.observe(el);
    setContainerW(el.clientWidth - 24);
    return () => ro.disconnect();
  }, []);

  const SV_W = containerW;
  const SV_H = Math.round(containerW * 0.6);
  const HUE_H = 14;

  const addToRecent = useCallback((c: string) => {
    setRecentColors(prev => {
      const filtered = prev.filter(rc => rc.toLowerCase() !== c.toLowerCase());
      const next = [c, ...filtered].slice(0, MAX_RECENT);
      saveRecent(storageKey, next);
      return next;
    });
  }, [storageKey]);

  // Draw the SV gradient
  const drawSV = useCallback(() => {
    const canvas = svCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width, h = canvas.height;
    const hueColor = hueToHex(hsv[0]);
    const gradH = ctx.createLinearGradient(0, 0, w, 0);
    gradH.addColorStop(0, '#ffffff');
    gradH.addColorStop(1, hueColor);
    ctx.fillStyle = gradH;
    ctx.fillRect(0, 0, w, h);
    const gradV = ctx.createLinearGradient(0, 0, 0, h);
    gradV.addColorStop(0, 'rgba(0,0,0,0)');
    gradV.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = gradV;
    ctx.fillRect(0, 0, w, h);
  }, [hsv[0], containerW]);

  const drawHue = useCallback(() => {
    const canvas = hueCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width, h = canvas.height;
    const g = ctx.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 6; i++) {
      g.addColorStop(i / 6, hueToHex(i / 6));
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, [containerW]);

  useEffect(() => { drawSV(); }, [drawSV]);
  useEffect(() => { drawHue(); }, [drawHue]);

  const emitColor = useCallback((hex: string) => {
    if (mode === 'solid') {
      onChange(hex);
    } else if (mode === 'gradient' && onGradientChange) {
      const newGrad = { ...grad };
      if (editingStop === 0) newGrad.color1 = hex;
      else newGrad.color2 = hex;
      onGradientChange(newGrad);
    }
  }, [mode, onChange, onGradientChange, grad, editingStop]);

  const handleSVInteraction = useCallback((e: React.MouseEvent | MouseEvent) => {
    const canvas = svCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setHsv(prev => {
      const next: [number, number, number] = [prev[0], x, 1 - y];
      return next;
    });
    const newHex = hsvToHex(hsv[0], x, 1 - y);
    emitColor(newHex);
  }, [emitColor, hsv]);

  const handleHueInteraction = useCallback((e: React.MouseEvent | MouseEvent) => {
    const canvas = hueCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHsv(prev => {
      const next: [number, number, number] = [x, prev[1], prev[2]];
      return next;
    });
    const newHex = hsvToHex(x, hsv[1], hsv[2]);
    emitColor(newHex);
  }, [emitColor, hsv]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingSV.current) handleSVInteraction(e);
      if (draggingHue.current) handleHueInteraction(e);
    };
    const handleMouseUp = () => {
      if (draggingSV.current || draggingHue.current) {
        addToRecent(hsvToHex(hsv[0], hsv[1], hsv[2]));
      }
      draggingSV.current = false;
      draggingHue.current = false;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleSVInteraction, handleHueInteraction, addToRecent, hsv]);

  const svX = hsv[1] * SV_W;
  const svY = (1 - hsv[2]) * SV_H;
  const hueX = hsv[0] * SV_W;
  const borderCol = darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';
  const tabBg = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const tabActiveBg = '#4ECDC4';
  const tabColor = darkMode ? '#F5F6FA' : '#2D3436';

  const gradPreviewBg = `linear-gradient(${grad.angle}deg, ${grad.color1}, ${grad.color2})`;

  return (
    <div ref={svRef} style={{ padding: '0 12px 6px' }}>
      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '6px', borderRadius: '8px', overflow: 'hidden', backgroundColor: tabBg }}>
        {(['solid', 'gradient', 'none'] as ColorMode[]).map(m => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            style={{
              flex: 1,
              padding: '5px 0',
              border: 'none',
              backgroundColor: mode === m ? tabActiveBg : 'transparent',
              color: mode === m ? '#fff' : tabColor,
              fontSize: '11px',
              fontWeight: mode === m ? 700 : 600,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {m === 'none' ? 'None' : m === 'gradient' ? 'Gradient' : 'Solid'}
          </button>
        ))}
      </div>

      {/* Transparent / None mode */}
      {mode === 'none' && (
        <div style={{
          padding: '12px',
          textAlign: 'center',
          borderRadius: '6px',
          background: CHECKER_BG,
          border: `1px solid ${borderCol}`,
          fontSize: '12px',
          fontWeight: 700,
          color: '#999',
        }}>
          Transparent
        </div>
      )}

      {/* Gradient mode */}
      {mode === 'gradient' && (
        <div style={{ marginBottom: '6px' }}>
          {/* Gradient preview */}
          <div style={{
            height: '24px',
            borderRadius: '6px',
            background: gradPreviewBg,
            border: `1px solid ${borderCol}`,
            marginBottom: '6px',
          }} />
          {/* Stop selectors + angle */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
            <button
              onClick={() => setEditingStop(0)}
              style={{
                width: '28px', height: '28px', borderRadius: '6px',
                backgroundColor: grad.color1,
                border: editingStop === 0 ? '3px solid #4ECDC4' : `2px solid ${borderCol}`,
                cursor: 'pointer', padding: 0, flexShrink: 0,
              }}
              title="Stop 1"
            />
            <button
              onClick={() => setEditingStop(1)}
              style={{
                width: '28px', height: '28px', borderRadius: '6px',
                backgroundColor: grad.color2,
                border: editingStop === 1 ? '3px solid #4ECDC4' : `2px solid ${borderCol}`,
                cursor: 'pointer', padding: 0, flexShrink: 0,
              }}
              title="Stop 2"
            />
            <span style={{ fontSize: '11px', fontWeight: 700, color: darkMode ? '#636E72' : '#B2BEC3', marginLeft: '4px' }}>
              Angle
            </span>
            <input
              type="range"
              min={0} max={360}
              value={grad.angle}
              style={{ flex: 1, accentColor: '#4ECDC4' }}
              onChange={(e) => {
                onGradientChange?.({ ...grad, angle: Number(e.target.value) });
              }}
            />
            <span style={{ fontSize: '11px', fontWeight: 700, width: '30px', textAlign: 'right', color: tabColor }}>
              {grad.angle}°
            </span>
          </div>
        </div>
      )}

      {/* HSV picker (shown for solid and gradient modes) */}
      {mode !== 'none' && (
        <>
          {/* SV area */}
          <div style={{ position: 'relative', width: SV_W, height: SV_H, cursor: 'crosshair', borderRadius: '6px', overflow: 'hidden', border: `1px solid ${borderCol}` }}>
            <canvas
              ref={svCanvasRef}
              width={SV_W}
              height={SV_H}
              style={{ display: 'block', width: SV_W, height: SV_H }}
              onMouseDown={(e) => { draggingSV.current = true; handleSVInteraction(e); }}
            />
            <div style={{
              position: 'absolute',
              left: svX - 6, top: svY - 6,
              width: 12, height: 12,
              borderRadius: '50%',
              border: '2px solid #fff',
              boxShadow: '0 0 2px rgba(0,0,0,0.6)',
              pointerEvents: 'none',
            }} />
          </div>
          {/* Hue slider */}
          <div style={{ position: 'relative', width: SV_W, height: HUE_H, cursor: 'pointer', borderRadius: '4px', overflow: 'hidden', marginTop: '4px', border: `1px solid ${borderCol}` }}>
            <canvas
              ref={hueCanvasRef}
              width={SV_W}
              height={HUE_H}
              style={{ display: 'block', width: SV_W, height: HUE_H }}
              onMouseDown={(e) => { draggingHue.current = true; handleHueInteraction(e); }}
            />
            <div style={{
              position: 'absolute',
              left: hueX - 3, top: -1,
              width: 6, height: HUE_H + 2,
              borderRadius: '2px',
              border: '2px solid #fff',
              boxShadow: '0 0 2px rgba(0,0,0,0.5)',
              pointerEvents: 'none',
            }} />
          </div>
          {/* Hex input */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
            <div style={{
              width: '24px', height: '24px', borderRadius: '4px',
              backgroundColor: hsvToHex(hsv[0], hsv[1], hsv[2]),
              border: `1px solid ${borderCol}`, flexShrink: 0,
            }} />
            <input
              type="text"
              value={hsvToHex(hsv[0], hsv[1], hsv[2])}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                  setHsv(hexToHsv(v));
                  emitColor(v);
                }
              }}
              style={{
                flex: 1,
                padding: '4px 6px',
                borderRadius: '6px',
                border: `1px solid ${borderCol}`,
                backgroundColor: darkMode ? 'rgba(255,255,255,0.08)' : '#F5F6FA',
                color: tabColor,
                fontSize: '12px',
                fontWeight: 600,
                fontFamily: 'monospace',
                outline: 'none',
              }}
            />
          </div>
        </>
      )}

      {/* Recent colors */}
      {recentColors.length > 0 && mode !== 'none' && (
        <div style={{ marginTop: '6px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: darkMode ? '#636E72' : '#B2BEC3', marginBottom: '3px' }}>
            Recent
          </div>
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
            {recentColors.map((c, i) => (
              <button
                key={`${c}-${i}`}
                onClick={() => {
                  const safe = safeHex(c);
                  setHsv(hexToHsv(safe));
                  emitColor(safe);
                }}
                style={{
                  width: '20px', height: '20px', borderRadius: '4px',
                  border: c.toLowerCase() === safeColor.toLowerCase()
                    ? '2px solid #4ECDC4'
                    : `1.5px solid ${borderCol}`,
                  backgroundColor: c,
                  cursor: 'pointer', padding: 0,
                }}
                title={c}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
