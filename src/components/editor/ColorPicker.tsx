import { useState, useEffect } from 'react';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label?: string;
}

const PRESET_COLORS = [
  // Reds & Pinks
  '#FF6B6B', '#FF4757', '#FF6348', '#E74C3C', '#FC5C65',
  // Oranges
  '#FF8A5C', '#FFA502', '#FF9F43', '#EE5A24', '#F39C12',
  // Yellows
  '#FFEAA7', '#FFD93D', '#FFC312', '#F9CA24', '#FDCB6E',
  // Greens
  '#96CEB4', '#88D8B0', '#2ECC71', '#6AB04C', '#00B894',
  // Teals & Cyans
  '#4ECDC4', '#00CEC9', '#7FDBFF', '#00B4D8', '#48DBFB',
  // Blues
  '#45B7D1', '#3498DB', '#0984E3', '#686DE0', '#4834D4',
  // Purples
  '#DDA0DD', '#A55EEA', '#8854D0', '#6C5CE7', '#BE2EDD',
  // Neutrals
  '#FFFFFF', '#F5F6FA', '#DFE6E9', '#636E72', '#2D3436',
  '#000000',
];

export default function ColorPicker({ color, onChange, label }: ColorPickerProps) {
  const [hexInput, setHexInput] = useState(color);
  const [recentColors, setRecentColors] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('ashermate_recent_colors');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    setHexInput(color);
  }, [color]);

  const addToRecent = (c: string) => {
    setRecentColors((prev) => {
      const filtered = prev.filter((rc) => rc.toLowerCase() !== c.toLowerCase());
      const next = [c, ...filtered].slice(0, 8);
      localStorage.setItem('ashermate_recent_colors', JSON.stringify(next));
      return next;
    });
  };

  const handlePresetClick = (c: string) => {
    onChange(c);
    addToRecent(c);
  };

  const handleHexSubmit = () => {
    let val = hexInput.trim();
    if (!val.startsWith('#')) val = '#' + val;
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(val)) {
      onChange(val);
      addToRecent(val);
    }
  };

  const styles = {
    container: {
      padding: '8px',
    } as React.CSSProperties,
    label: {
      fontSize: '13px',
      fontWeight: 700,
      marginBottom: '6px',
      display: 'block',
      color: 'inherit',
    } as React.CSSProperties,
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(6, 1fr)',
      gap: '4px',
      marginBottom: '8px',
    } as React.CSSProperties,
    swatch: (c: string, isActive: boolean) => ({
      width: '28px',
      height: '28px',
      borderRadius: '6px',
      border: isActive ? '3px solid #45B7D1' : '2px solid rgba(0,0,0,0.15)',
      backgroundColor: c,
      cursor: 'pointer',
      transition: 'transform 0.15s',
      boxShadow: isActive ? '0 0 6px rgba(69,183,209,0.5)' : 'none',
    }) as React.CSSProperties,
    hexRow: {
      display: 'flex',
      gap: '4px',
      marginBottom: '8px',
    } as React.CSSProperties,
    hexInput: {
      flex: 1,
      padding: '6px 8px',
      borderRadius: '8px',
      border: '2px solid #dfe6e9',
      fontSize: '13px',
      fontFamily: 'monospace',
      outline: 'none',
    } as React.CSSProperties,
    hexBtn: {
      padding: '6px 10px',
      borderRadius: '8px',
      border: 'none',
      backgroundColor: '#45B7D1',
      color: '#fff',
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: '12px',
    } as React.CSSProperties,
    recentLabel: {
      fontSize: '11px',
      color: '#636E72',
      marginBottom: '4px',
    } as React.CSSProperties,
    recentRow: {
      display: 'flex',
      gap: '4px',
    } as React.CSSProperties,
    recentSwatch: (c: string) => ({
      width: '24px',
      height: '24px',
      borderRadius: '6px',
      border: '2px solid rgba(0,0,0,0.1)',
      backgroundColor: c,
      cursor: 'pointer',
    }) as React.CSSProperties,
  };

  return (
    <div style={styles.container}>
      {label && <span style={styles.label}>{label}</span>}
      <div style={styles.grid}>
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            style={styles.swatch(c, c.toLowerCase() === color.toLowerCase())}
            onClick={() => handlePresetClick(c)}
            title={c}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.transform = 'scale(1.15)'; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.transform = 'scale(1)'; }}
          />
        ))}
      </div>
      <div style={styles.hexRow}>
        <input
          type="color"
          value={color.length === 7 ? color : '#000000'}
          onChange={(e) => {
            const c = e.target.value;
            setHexInput(c);
            onChange(c);
            addToRecent(c);
          }}
          style={{
            width: '36px',
            height: '32px',
            padding: '0',
            border: `2px solid ${color}`,
            borderRadius: '8px',
            cursor: 'pointer',
            backgroundColor: 'transparent',
            flexShrink: 0,
          }}
          title="Open color picker"
        />
        <input
          style={styles.hexInput}
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleHexSubmit()}
          placeholder="#FF6B6B"
        />
        <button style={styles.hexBtn} onClick={handleHexSubmit}>OK</button>
      </div>
      {recentColors.length > 0 && (
        <>
          <div style={styles.recentLabel}>Recent</div>
          <div style={styles.recentRow}>
            {recentColors.map((c, i) => (
              <button
                key={`${c}-${i}`}
                style={styles.recentSwatch(c)}
                onClick={() => handlePresetClick(c)}
                title={c}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
