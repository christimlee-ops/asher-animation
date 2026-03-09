import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface TopBarProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onNewProject: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExport: () => void;
  exporting: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  projectName: string;
  compact?: boolean;
  isOwner?: boolean;
}

export default function TopBar({
  darkMode,
  onToggleDarkMode,
  onNewProject,
  onOpen,
  onSave,
  onSaveAs,
  onExport,
  exporting,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  projectName,
  compact = false,
  isOwner = true,
}: TopBarProps) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const bg = darkMode ? '#1a1a2e' : 'linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 100%)';
  const textColor = '#fff';

  const styles = {
    bar: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 16px',
      background: bg,
      color: textColor,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      gap: '8px',
      minHeight: '56px',
      zIndex: 100,
    } as React.CSSProperties,
    logo: {
      fontSize: '22px',
      fontWeight: 900,
      letterSpacing: '-0.5px',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      cursor: 'default',
      userSelect: 'none' as const,
    } as React.CSSProperties,
    group: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    } as React.CSSProperties,
    btn: (disabled?: boolean) => ({
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '8px 14px',
      borderRadius: '12px',
      border: 'none',
      backgroundColor: darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.25)',
      color: textColor,
      fontWeight: 700,
      fontSize: '14px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'background-color 0.2s, transform 0.15s',
      backdropFilter: 'blur(4px)',
    }) as React.CSSProperties,
    username: {
      fontSize: '14px',
      fontWeight: 600,
      maxWidth: '140px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap' as const,
    } as React.CSSProperties,
    toggleBtn: {
      padding: '8px 12px',
      borderRadius: '12px',
      border: 'none',
      backgroundColor: darkMode ? '#FFEAA7' : 'rgba(0,0,0,0.2)',
      color: darkMode ? '#2D3436' : '#fff',
      fontWeight: 700,
      fontSize: '16px',
      cursor: 'pointer',
      transition: 'all 0.2s',
    } as React.CSSProperties,
  };

  const hover = (e: React.MouseEvent) => {
    (e.currentTarget as HTMLElement).style.backgroundColor = darkMode
      ? 'rgba(255,255,255,0.2)'
      : 'rgba(255,255,255,0.4)';
    (e.currentTarget as HTMLElement).style.transform = 'scale(1.04)';
  };
  const unhover = (e: React.MouseEvent) => {
    (e.currentTarget as HTMLElement).style.backgroundColor = darkMode
      ? 'rgba(255,255,255,0.12)'
      : 'rgba(255,255,255,0.25)';
    (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
  };

  const displayName =
    user?.username || user?.email?.split('@')[0] || 'Guest';

  // ─── Compact (tablet) top bar ──────────────────────────────────

  if (compact) {
    const cBtn: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '38px',
      height: '38px',
      borderRadius: '10px',
      border: 'none',
      backgroundColor: darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.25)',
      color: textColor,
      fontSize: '18px',
      cursor: 'pointer',
      flexShrink: 0,
    };
    const cBtnDisabled: React.CSSProperties = { ...cBtn, opacity: 0.4, cursor: 'not-allowed' };

    return (
      <div style={{ ...styles.bar, minHeight: '48px', padding: '4px 8px', flexWrap: 'wrap', gap: '4px' }}>
        {/* Logo */}
        <span style={{ fontSize: '20px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '4px', marginRight: '4px' }}>
          🎨 <span style={{ fontSize: '16px' }}>{projectName}</span>
        </span>

        <div style={{ flex: 1 }} />

        {/* Undo / Redo */}
        <button style={canUndo ? cBtn : cBtnDisabled} onClick={onUndo} disabled={!canUndo} title="Undo">↩</button>
        <button style={canRedo ? cBtn : cBtnDisabled} onClick={onRedo} disabled={!canRedo} title="Redo">↪</button>

        {/* Menu toggle */}
        <button style={cBtn} onClick={() => setMenuOpen(!menuOpen)} title="Menu">☰</button>
        <button style={styles.toggleBtn} onClick={onToggleDarkMode} title="Toggle dark/light mode">
          {darkMode ? '☀️' : '🌙'}
        </button>

        {/* Dropdown menu */}
        {menuOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setMenuOpen(false)} />
            <div style={{
              position: 'absolute',
              right: 8,
              top: '100%',
              zIndex: 999,
              backgroundColor: darkMode ? '#1a1a2e' : '#f0f1f3',
              borderRadius: '12px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
              padding: '6px',
              minWidth: '180px',
            }}>
              {[
                { label: '📄 New', action: onNewProject },
                { label: '📂 Open', action: onOpen },
                ...(isOwner ? [{ label: '💾 Save', action: onSave }] : []),
                { label: '📋 Save As', action: onSaveAs },
                { label: exporting ? '⏳ Exporting...' : '🎬 Export', action: onExport, disabled: exporting },
                { label: `👤 ${displayName}`, action: () => {}, disabled: true },
                { label: '🚪 Logout', action: logout },
              ].map((item, i) => (
                <button
                  key={i}
                  onClick={() => { if (!item.disabled) { item.action(); setMenuOpen(false); } }}
                  disabled={item.disabled}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: item.disabled ? (darkMode ? '#636E72' : '#B2BEC3') : (darkMode ? '#F5F6FA' : '#2D3436'),
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: item.disabled ? 'default' : 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // ─── Desktop top bar ─────────────────────────────────────────

  return (
    <div style={styles.bar}>
      {/* Logo */}
      <div style={styles.logo}>
        <span style={{ fontSize: '28px' }}>🎨</span>
        <span>Ashermate</span>
      </div>

      {/* File actions */}
      <div style={styles.group}>
        <button style={styles.btn()} onClick={onNewProject} onMouseEnter={hover} onMouseLeave={unhover}>
          📄 New
        </button>
        <button style={styles.btn()} onClick={onOpen} onMouseEnter={hover} onMouseLeave={unhover}>
          📂 Open
        </button>
        {isOwner && (
          <button style={styles.btn()} onClick={onSave} onMouseEnter={hover} onMouseLeave={unhover}>
            💾 Save
          </button>
        )}
        <button style={styles.btn()} onClick={onSaveAs} onMouseEnter={hover} onMouseLeave={unhover}>
          📋 Save As
        </button>
        <button
          style={styles.btn(exporting)}
          onClick={onExport}
          disabled={exporting}
          onMouseEnter={exporting ? undefined : hover}
          onMouseLeave={exporting ? undefined : unhover}
        >
          {exporting ? '⏳ Exporting...' : '🎬 Export'}
        </button>
      </div>

      {/* Project Name */}
      <div style={{ fontSize: '15px', fontWeight: 700, opacity: 0.9, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
        {projectName}
      </div>

      {/* Undo / Redo */}
      <div style={styles.group}>
        <button
          style={styles.btn(!canUndo)}
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          onMouseEnter={canUndo ? hover : undefined}
          onMouseLeave={canUndo ? unhover : undefined}
        >
          ↩ Undo
        </button>
        <button
          style={styles.btn(!canRedo)}
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          onMouseEnter={canRedo ? hover : undefined}
          onMouseLeave={canRedo ? unhover : undefined}
        >
          ↪ Redo
        </button>
      </div>

      {/* Right side */}
      <div style={styles.group}>
        <span style={styles.username} title={user?.email || ''}>
          👤 {displayName}
        </span>
        <button
          style={styles.btn()}
          onClick={logout}
          onMouseEnter={hover}
          onMouseLeave={unhover}
        >
          🚪 Logout
        </button>
        <button style={styles.toggleBtn} onClick={onToggleDarkMode} title="Toggle dark/light mode">
          {darkMode ? '☀️' : '🌙'}
        </button>
      </div>
    </div>
  );
}
