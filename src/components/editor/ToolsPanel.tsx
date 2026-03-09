import React, { useState } from 'react';
import type { MediaAsset } from '../../lib/mediaLibrary';
import { getAssetFullUrl } from '../../lib/mediaLibrary';

export type ToolName =
  | 'select'
  | 'rectangle'
  | 'circle'
  | 'triangle'
  | 'star'
  | 'line'
  | 'pencil'
  | 'brush'
  | 'text';

export type ActionName =
  | 'eraser'
  | 'delete'
  | 'group'
  | 'ungroup'
  | 'duplicate'
  | 'import';

interface ToolsPanelProps {
  activeTool: ToolName;
  onToolSelect: (tool: ToolName) => void;
  onAction: (action: ActionName) => void;
  darkMode: boolean;
  compact?: boolean;
  libraryAssets?: MediaAsset[];
  onUseAsset?: (asset: MediaAsset) => void;
  onDeleteAsset?: (asset: MediaAsset) => void;
}

const S = 18; // icon size
const Icon = ({ children, ...props }: React.SVGProps<SVGSVGElement>) => (
  <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>{children}</svg>
);

const TOOL_ICONS: Record<ToolName, React.ReactNode> = {
  select: <Icon><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></Icon>,
  rectangle: <Icon><rect x="3" y="3" width="18" height="18" rx="2"/></Icon>,
  circle: <Icon><circle cx="12" cy="12" r="10"/></Icon>,
  triangle: <Icon><path d="M12 2L2 22h20L12 2z"/></Icon>,
  star: <Icon><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></Icon>,
  line: <Icon><line x1="5" y1="19" x2="19" y2="5"/></Icon>,
  pencil: <Icon><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></Icon>,
  brush: <Icon><path d="M18.37 2.63a2.12 2.12 0 013 3L14 13l-4 1 1-4 7.37-7.37z"/><path d="M9 14.5A3.5 3.5 0 005.5 18c-1.2 0-2.5.7-2.5 2 2 0 4.5-1 5.5-3a3.5 3.5 0 00.5-2.5z"/></Icon>,
  text: <Icon strokeWidth={2.5}><polyline points="4 7 4 4 20 4 20 7"/><line x1="9.5" y1="20" x2="14.5" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></Icon>,
};

const ACTION_ICONS: Record<string, React.ReactNode> = {
  import: <Icon><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></Icon>,
  eraser: <Icon><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></Icon>,
  group: <Icon><rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="14" width="8" height="8" rx="1"/><path d="M10 6h4m-4 12h4M6 10v4m12-4v4" strokeDasharray="2 2"/></Icon>,
  ungroup: <Icon><rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="14" width="8" height="8" rx="1"/><path d="M14 10l-4 4" strokeDasharray="2 2"/></Icon>,
  duplicate: <Icon><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></Icon>,
};

const TOOLS: { name: ToolName; label: string }[] = [
  { name: 'select', label: 'Select' },
  { name: 'rectangle', label: 'Rectangle' },
  { name: 'circle', label: 'Circle' },
  { name: 'triangle', label: 'Triangle' },
  { name: 'star', label: 'Star' },
  { name: 'line', label: 'Line' },
  { name: 'pencil', label: 'Pencil' },
  { name: 'brush', label: 'Brush' },
  { name: 'text', label: 'Text' },
];

const ACTIONS: { name: ActionName; label: string }[] = [
  { name: 'import', label: 'Import' },
  { name: 'eraser', label: 'Delete' },
  { name: 'group', label: 'Group' },
  { name: 'ungroup', label: 'Ungroup' },
  { name: 'duplicate', label: 'Duplicate' },
];

export default function ToolsPanel({
  activeTool,
  onToolSelect,
  onAction,
  darkMode,
  compact = false,
  libraryAssets = [],
  onUseAsset,
  onDeleteAsset,
}: ToolsPanelProps) {
  const [libraryOpen, setLibraryOpen] = useState(true);
  const panelBg = darkMode ? '#16213e' : '#f0f1f3';
  const textColor = darkMode ? '#F5F6FA' : '#2D3436';
  const sectionBorder = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  // ─── Compact (tablet) horizontal bar ──────────────────────────

  if (compact) {
    const compactBtn = (isActive: boolean): React.CSSProperties => ({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '38px',
      height: '38px',
      borderRadius: '10px',
      border: 'none',
      backgroundColor: isActive
        ? '#4ECDC4'
        : darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
      color: isActive ? '#fff' : textColor,
      cursor: 'pointer',
      flexShrink: 0,
      boxShadow: isActive ? '0 2px 8px rgba(78,205,196,0.35)' : 'none',
    });

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 8px',
        backgroundColor: panelBg,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        {TOOLS.map((t) => (
          <button key={t.name} style={compactBtn(activeTool === t.name)} onClick={() => onToolSelect(t.name)} title={t.label}>
            {TOOL_ICONS[t.name]}
          </button>
        ))}
        <div style={{ width: '1px', height: '24px', backgroundColor: sectionBorder, flexShrink: 0, margin: '0 2px' }} />
        {ACTIONS.map((a) => (
          <button key={a.name} style={compactBtn(false)} onClick={() => onAction(a.name)} title={a.label}>
            {ACTION_ICONS[a.name]}
          </button>
        ))}
      </div>
    );
  }

  // ─── Desktop full panel ───────────────────────────────────────
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
      height: '100%',
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
      padding: '8px 12px',
      borderRadius: '12px',
      border: 'none',
      backgroundColor: isActive
        ? '#4ECDC4'
        : darkMode
          ? 'rgba(255,255,255,0.06)'
          : 'rgba(0,0,0,0.03)',
      color: isActive ? '#fff' : textColor,
      fontWeight: isActive ? 700 : 600,
      fontSize: '13px',
      cursor: 'pointer',
      transition: 'all 0.15s',
      boxShadow: isActive ? '0 3px 10px rgba(78,205,196,0.35)' : 'none',
      textAlign: 'left' as const,
      width: '100%',
    }) as React.CSSProperties,
    toolIcon: {
      width: '22px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
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
          <span style={styles.toolIcon}>{TOOL_ICONS[t.name]}</span>
          <span>{t.label}</span>
        </button>
      ))}

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
          <span style={styles.toolIcon}>{ACTION_ICONS[a.name]}</span>
          <span>{a.label}</span>
        </button>
      ))}

      {/* Media Library */}
      <div
        style={{ ...styles.sectionTitle, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => setLibraryOpen(!libraryOpen)}
      >
        <span>Library</span>
        <span style={{ fontSize: '10px' }}>{libraryOpen ? '▼' : '▶'}</span>
      </div>
      {libraryOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {libraryAssets.length === 0 ? (
            <div style={{ fontSize: '11px', color: darkMode ? '#636E72' : '#B2BEC3', padding: '8px 4px', textAlign: 'center' }}>
              Import files to build your library
            </div>
          ) : (
            libraryAssets.map((asset) => {
              const isAudio = asset.mime_type.startsWith('audio/');
              return (
                <div
                  key={asset.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 8px',
                    borderRadius: '8px',
                    backgroundColor: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: textColor,
                    transition: 'background-color 0.15s',
                  }}
                  onClick={() => onUseAsset?.(asset)}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = darkMode
                      ? 'rgba(78,205,196,0.15)' : 'rgba(78,205,196,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = darkMode
                      ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
                  }}
                  title={`Click to add: ${asset.original_name}`}
                >
                  {isAudio ? (
                    <span style={{ fontSize: '16px', flexShrink: 0 }}>♪</span>
                  ) : (
                    <img
                      src={getAssetFullUrl(asset)}
                      alt=""
                      style={{ width: '24px', height: '24px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }}
                    />
                  )}
                  <span style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: 600,
                  }}>
                    {asset.original_name}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteAsset?.(asset);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#FF6B6B',
                      cursor: 'pointer',
                      fontSize: '11px',
                      padding: '2px 4px',
                      borderRadius: '4px',
                      flexShrink: 0,
                      opacity: 0.6,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.6'; }}
                    title="Remove from library"
                  >
                    ✕
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
