import { useAuth } from '../../contexts/AuthContext';

interface TopBarProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onNewProject: () => void;
  onOpen: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export default function TopBar({
  darkMode,
  onToggleDarkMode,
  onNewProject,
  onOpen,
  onSave,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: TopBarProps) {
  const { user, logout } = useAuth();

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

  return (
    <div style={styles.bar}>
      {/* Logo */}
      <div style={styles.logo}>
        <span style={{ fontSize: '28px' }}>🎨</span>
        <span>AnimateKids</span>
      </div>

      {/* File actions */}
      <div style={styles.group}>
        <button style={styles.btn()} onClick={onNewProject} onMouseEnter={hover} onMouseLeave={unhover}>
          📄 New
        </button>
        <button style={styles.btn()} onClick={onOpen} onMouseEnter={hover} onMouseLeave={unhover}>
          📂 Open
        </button>
        <button style={styles.btn()} onClick={onSave} onMouseEnter={hover} onMouseLeave={unhover}>
          💾 Save
        </button>
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
