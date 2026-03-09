import { useState, useRef, useCallback } from 'react';
import * as fabric from 'fabric';
import TopBar from '../components/editor/TopBar';
import ToolsPanel from '../components/editor/ToolsPanel';
import type { ToolName, ActionName } from '../components/editor/ToolsPanel';
import CanvasEditor from '../components/editor/Canvas';
import type { CanvasHandle } from '../components/editor/Canvas';
import PropertiesPanel from '../components/editor/PropertiesPanel';

export default function EditorPage() {
  const [darkMode, setDarkMode] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolName>('select');
  const [fillColor, setFillColor] = useState('#4ECDC4');
  const [strokeColor, setStrokeColor] = useState('#2D3436');
  const [selectedObject, setSelectedObject] = useState<fabric.FabricObject | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const canvasRef = useRef<CanvasHandle>(null);

  const handleHistoryChange = useCallback((undo: boolean, redo: boolean) => {
    setCanUndo(undo);
    setCanRedo(redo);
  }, []);

  const handleSelectionChange = useCallback((obj: fabric.FabricObject | null) => {
    setSelectedObject(obj);
  }, []);

  const handleAction = useCallback(
    (action: ActionName) => {
      const handle = canvasRef.current;
      if (!handle) return;
      switch (action) {
        case 'delete':
          handle.deleteSelected();
          break;
        case 'duplicate':
          handle.duplicateSelected();
          break;
        case 'group':
          handle.groupSelected();
          break;
        case 'ungroup':
          handle.ungroupSelected();
          break;
        case 'eraser':
          handle.deleteSelected();
          break;
      }
    },
    [],
  );

  const handleNewProject = () => {
    if (window.confirm('Start a new project? Unsaved changes will be lost.')) {
      canvasRef.current?.clear();
    }
  };

  const handleSave = () => {
    const json = canvasRef.current?.toJSON();
    if (!json) return;
    const blob = new Blob([JSON.stringify(json)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'animation-project.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpen = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.svg,.png,.jpg,.jpeg,.gif,.webp';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.name.endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const json = JSON.parse(reader.result as string);
            canvasRef.current?.loadJSON(json);
          } catch {
            alert('Invalid project file.');
          }
        };
        reader.readAsText(file);
      } else {
        canvasRef.current?.importFile(file);
      }
    };
    input.click();
  };

  const pageBg = darkMode ? '#0f3460' : '#E8F0FE';

  const styles = {
    layout: {
      display: 'grid',
      gridTemplateRows: 'auto 1fr auto',
      gridTemplateColumns: '220px 1fr 260px',
      gridTemplateAreas: `
        "topbar topbar topbar"
        "tools canvas props"
        "timeline timeline timeline"
      `,
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      backgroundColor: pageBg,
      fontFamily: "'Segoe UI', 'Roboto', 'Arial', sans-serif",
    } as React.CSSProperties,
    topbar: { gridArea: 'topbar' } as React.CSSProperties,
    tools: { gridArea: 'tools', overflow: 'hidden' } as React.CSSProperties,
    canvas: { gridArea: 'canvas', overflow: 'hidden', display: 'flex' } as React.CSSProperties,
    props: { gridArea: 'props', overflow: 'hidden' } as React.CSSProperties,
    timeline: {
      gridArea: 'timeline',
      height: '80px',
      backgroundColor: darkMode ? '#1a1a2e' : '#fff',
      borderTop: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid #DFE6E9',
      display: 'flex',
      alignItems: 'center',
      padding: '0 20px',
      gap: '12px',
      boxShadow: '0 -2px 12px rgba(0,0,0,0.06)',
    } as React.CSSProperties,
    timelineLabel: {
      fontSize: '13px',
      fontWeight: 800,
      color: darkMode ? '#96CEB4' : '#636E72',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.8px',
    } as React.CSSProperties,
    timelinePlaceholder: {
      flex: 1,
      height: '40px',
      borderRadius: '12px',
      backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : '#F5F6FA',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: darkMode ? '#636E72' : '#B2BEC3',
      fontSize: '14px',
      fontWeight: 600,
    } as React.CSSProperties,
  };

  return (
    <div style={styles.layout}>
      {/* Top Bar */}
      <div style={styles.topbar}>
        <TopBar
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
          onNewProject={handleNewProject}
          onOpen={handleOpen}
          onSave={handleSave}
          onUndo={() => canvasRef.current?.undo()}
          onRedo={() => canvasRef.current?.redo()}
          canUndo={canUndo}
          canRedo={canRedo}
        />
      </div>

      {/* Tools Panel */}
      <div style={styles.tools}>
        <ToolsPanel
          activeTool={activeTool}
          onToolSelect={setActiveTool}
          onAction={handleAction}
          fillColor={fillColor}
          strokeColor={strokeColor}
          onFillChange={setFillColor}
          onStrokeChange={setStrokeColor}
          darkMode={darkMode}
        />
      </div>

      {/* Canvas */}
      <div style={styles.canvas}>
        <CanvasEditor
          ref={canvasRef}
          activeTool={activeTool}
          fillColor={fillColor}
          strokeColor={strokeColor}
          darkMode={darkMode}
          onSelectionChange={handleSelectionChange}
          onHistoryChange={handleHistoryChange}
          onToolReset={() => setActiveTool('select')}
        />
      </div>

      {/* Properties Panel */}
      <div style={styles.props}>
        <PropertiesPanel
          selectedObject={selectedObject}
          canvas={canvasRef.current?.getCanvas() ?? null}
          darkMode={darkMode}
          onSaveHistory={() => {
            // Trigger a save in the canvas history stack
            // We access canvas directly since the handle exposes it
          }}
        />
      </div>

      {/* Timeline */}
      <div style={styles.timeline}>
        <span style={styles.timelineLabel}>Timeline</span>
        <div style={styles.timelinePlaceholder}>
          Timeline coming soon -- drag keyframes here to animate!
        </div>
      </div>
    </div>
  );
}
