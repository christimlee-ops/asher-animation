import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as fabric from 'fabric';
import TopBar from '../components/editor/TopBar';
import ToolsPanel from '../components/editor/ToolsPanel';
import type { ToolName, ActionName } from '../components/editor/ToolsPanel';
import CanvasEditor from '../components/editor/Canvas';
import type { CanvasHandle } from '../components/editor/Canvas';
import PropertiesPanel from '../components/editor/PropertiesPanel';
import TimelinePanel from '../components/editor/Timeline';
import { createDefaultState } from '../lib/animationState';
import type { AnimationState } from '../lib/animationState';
import { exportToMp4 } from '../lib/exportVideo';
import { loadProject, listProjects, deleteProject } from '../lib/projectManager';
import { apiPost, apiPut } from '../lib/api';
import { useIsTablet } from '../lib/useMediaQuery';

export default function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolName>('select');
  const [fillColor, _setFillColor] = useState('#4ECDC4');
  const [strokeColor, _setStrokeColor] = useState('#2D3436');
  const [selectedObject, setSelectedObject] = useState<fabric.FabricObject | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(projectId || null);
  const [projectName, setProjectName] = useState('Untitled');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [animState, setAnimState] = useState<AnimationState>(createDefaultState());
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [canvasVersion, setCanvasVersion] = useState(0);
  const isTablet = useIsTablet();
  const [showProps, setShowProps] = useState(false);
  const canvasRef = useRef<CanvasHandle>(null);

  const handleHistoryChange = useCallback((undo: boolean, redo: boolean) => {
    setCanUndo(undo);
    setCanRedo(redo);
  }, []);

  const handleSelectionChange = useCallback((obj: fabric.FabricObject | null) => {
    setSelectedObject(obj);
  }, []);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.svg,.png,.jpg,.jpeg,.gif,.webp';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) canvasRef.current?.importFile(file);
    };
    input.click();
  }, []);

  const handleExport = useCallback(async () => {
    const c = canvasRef.current?.getCanvas();
    if (!c || exporting) return;
    setExporting(true);
    setExportStatus('Starting export...');
    try {
      const blob = await exportToMp4({
        canvas: c,
        animState,
        width: 1920,
        height: 1080,
        onProgress: setExportStatus,
      });
      // Download the file
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName || 'animation'}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
      setExportStatus('');
    } catch (err) {
      console.error('Export error:', err);
      setExportStatus('Export failed');
      setTimeout(() => setExportStatus(''), 3000);
    } finally {
      setExporting(false);
    }
  }, [animState, exporting, projectName]);

  const handleAction = useCallback(
    (action: ActionName) => {
      const handle = canvasRef.current;
      if (!handle) return;
      switch (action) {
        case 'duplicate':
          handle.duplicateSelected();
          break;
        case 'group':
          handle.groupSelected();
          break;
        case 'ungroup':
          handle.ungroupSelected();
          break;
        case 'delete':
          handle.deleteSelected();
          break;
        case 'eraser':
          handle.deleteSelected();
          break;
        case 'import':
          handleImport();
          break;
      }
    },
    [handleImport],
  );

  const [showNewModal, setShowNewModal] = useState(false);

  const handleNewProject = () => {
    setShowNewModal(true);
  };

  const confirmNewProject = () => {
    setShowNewModal(false);
    canvasRef.current?.clear();
    setCurrentProjectId(null);
    setProjectName('Untitled');
    setSaveStatus('');
    setAnimState(createDefaultState());
    navigate('/editor', { replace: true });
  };

  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalName, setSaveModalName] = useState('');
  const [saveModalMode, setSaveModalMode] = useState<'save' | 'saveAs'>('save');
  const [projectList, setProjectList] = useState<{ id: string; name: string; updated_at: string }[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Load project from URL param on mount
  useEffect(() => {
    if (!projectId) return;
    loadProject(projectId)
      .then(async (proj) => {
        setCurrentProjectId(proj.id);
        setProjectName(proj.name || 'Untitled');
        if (proj.data) {
          const data = typeof proj.data === 'string' ? JSON.parse(proj.data) : proj.data;
          console.log('[LOAD] data keys:', Object.keys(data));
          console.log('[LOAD] has animState:', !!data.animState, 'timelines:', data.animState?.timelines?.length);
          // Support both old format (plain canvas) and new format ({ canvas, animState })
          if (data.canvas) {
            await canvasRef.current?.loadJSON(data.canvas);
            if (data.animState) {
              console.log('[LOAD] Setting animState with', data.animState.timelines?.length, 'timelines');
              setAnimState(data.animState);
            }
          } else {
            await canvasRef.current?.loadJSON(data);
          }
          setCanvasVersion((v) => v + 1);
        }
      })
      .catch((err) => {
        console.error('[LOAD] Failed:', err);
        setSaveStatus('Failed to load project');
      });
  }, [projectId]);

  const handleSave = () => {
    if (currentProjectId) {
      // Existing project — show dialog to allow renaming
      setSaveModalMode('save');
      setSaveModalName(projectName);
      setShowSaveModal(true);
    } else {
      // New project — show dialog with title input
      setSaveModalMode('save');
      setSaveModalName(projectName === 'Untitled' ? '' : projectName);
      setShowSaveModal(true);
    }
  };

  const handleSaveAs = () => {
    setSaveModalMode('saveAs');
    setSaveModalName('');
    setShowSaveModal(true);
  };

  const executeSave = async (name: string, asCopy: boolean) => {
    const canvasJson = canvasRef.current?.toJSON();
    if (!canvasJson) return;
    const finalName = name.trim() || 'Untitled';
    // Bundle canvas + animation state together
    const json = { canvas: canvasJson, animState };
    console.log('[SAVE] animState timelines:', animState.timelines.length, 'objects:', (canvasJson as any).objects?.length);
    console.log('[SAVE] _animIds on objects:', (canvasJson as any).objects?.map((o: any) => o._animId).filter(Boolean));
    setSaving(true);
    setSaveStatus('');
    setShowSaveModal(false);
    try {
      if (currentProjectId && !asCopy) {
        // Update existing project
        await apiPut(`/projects/${currentProjectId}`, { name: finalName, data: json });
        setProjectName(finalName);
      } else {
        // Create new project
        const res = await apiPost<{ project: { id: string } }>('/projects', {
          name: finalName,
          data: json,
        });
        setCurrentProjectId(String(res.project.id));
        setProjectName(finalName);
        navigate(`/editor/${res.project.id}`, { replace: true });
      }
      setSaveStatus('Saved!');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (err) {
      setSaveStatus('Save failed');
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleOpen = async () => {
    setLoadingProjects(true);
    setShowOpenModal(true);
    try {
      const projects = await listProjects();
      setProjectList(projects);
    } catch {
      alert('Failed to load projects.');
      setShowOpenModal(false);
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleOpenProject = async (id: string) => {
    setShowOpenModal(false);
    try {
      const proj = await loadProject(id);
      setCurrentProjectId(String(proj.id));
      setProjectName(proj.name || 'Untitled');
      if (proj.data) {
        const data = typeof proj.data === 'string' ? JSON.parse(proj.data) : proj.data;
        if (data.canvas) {
          await canvasRef.current?.loadJSON(data.canvas);
          if (data.animState) setAnimState(data.animState);
        } else {
          await canvasRef.current?.loadJSON(data);
          setAnimState(createDefaultState());
        }
        setCanvasVersion((v) => v + 1);
      }
      navigate(`/editor/${proj.id}`, { replace: true });
    } catch {
      alert('Failed to open project.');
    }
  };

  const pageBg = darkMode ? '#0f3460' : '#E8F0FE';

  // Close properties overlay when switching to desktop
  useEffect(() => {
    if (!isTablet) setShowProps(false);
  }, [isTablet]);

  // Close properties overlay when selection is cleared on tablet
  useEffect(() => {
    if (isTablet && !selectedObject) setShowProps(false);
  }, [isTablet, selectedObject]);

  // Auto-show properties when selecting an object on tablet
  useEffect(() => {
    if (isTablet && selectedObject) setShowProps(true);
  }, [isTablet, selectedObject]);

  const styles = {
    layout: {
      display: 'grid',
      gridTemplateRows: isTablet ? 'auto auto 1fr auto' : 'auto 1fr auto',
      gridTemplateColumns: isTablet ? '1fr' : '220px 1fr 260px',
      gridTemplateAreas: isTablet
        ? `"topbar" "tools" "canvas" "timeline"`
        : `"topbar topbar topbar" "tools canvas props" "timeline timeline timeline"`,
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      backgroundColor: pageBg,
      fontFamily: "'Segoe UI', 'Roboto', 'Arial', sans-serif",
    } as React.CSSProperties,
    topbar: { gridArea: 'topbar' } as React.CSSProperties,
    tools: { gridArea: 'tools', overflow: 'hidden' } as React.CSSProperties,
    canvas: { gridArea: 'canvas', overflow: 'hidden', display: 'flex', position: 'relative' as const } as React.CSSProperties,
    props: isTablet ? {
      position: 'fixed' as const,
      right: 0,
      top: 0,
      bottom: 0,
      width: '280px',
      zIndex: 200,
      overflow: 'auto',
      boxShadow: '-4px 0 20px rgba(0,0,0,0.2)',
      transform: showProps ? 'translateX(0)' : 'translateX(100%)',
      transition: 'transform 0.25s ease',
    } as React.CSSProperties : { gridArea: 'props', overflow: 'hidden' } as React.CSSProperties,
    propsBackdrop: {
      position: 'fixed' as const,
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.3)',
      zIndex: 199,
    } as React.CSSProperties,
    timeline: {
      gridArea: 'timeline',
      height: timelineCollapsed ? '28px' : (isTablet ? '150px' : '200px'),
      borderTop: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid #DFE6E9',
      boxShadow: '0 -2px 12px rgba(0,0,0,0.06)',
      overflow: 'hidden',
      transition: 'height 0.2s ease',
      display: 'flex',
      flexDirection: 'column',
    } as React.CSSProperties,
  };

  return (
    <div style={styles.layout}>
      {/* Top Bar */}
      <div style={{ ...styles.topbar, position: 'relative' }}>
        {(saveStatus || saving || exportStatus) && (
          <div style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', zIndex: 10, display: 'flex', gap: '12px' }}>
            {saving && <span style={{ fontSize: '13px', fontWeight: 700, color: darkMode ? '#4ECDC4' : '#636E72' }}>Saving...</span>}
            {saveStatus && <span style={{ fontSize: '13px', fontWeight: 700, color: saveStatus === 'Saved!' ? '#00B894' : '#FF6B6B' }}>{saveStatus}</span>}
            {exportStatus && <span style={{ fontSize: '13px', fontWeight: 700, color: '#6C5CE7' }}>{exportStatus}</span>}
          </div>
        )}
        <TopBar
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
          onNewProject={handleNewProject}
          onOpen={handleOpen}
          onSave={handleSave}
          onSaveAs={handleSaveAs}
          onExport={handleExport}
          exporting={exporting}
          onUndo={() => canvasRef.current?.undo()}
          onRedo={() => canvasRef.current?.redo()}
          canUndo={canUndo}
          canRedo={canRedo}
          projectName={projectName}
          compact={isTablet}
        />
      </div>

      {/* Tools Panel */}
      <div style={styles.tools}>
        <ToolsPanel
          activeTool={activeTool}
          onToolSelect={setActiveTool}
          onAction={handleAction}
          darkMode={darkMode}
          compact={isTablet}
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
        {/* Tablet: properties toggle button */}
        {isTablet && selectedObject && !showProps && (
          <button
            onClick={() => setShowProps(true)}
            style={{
              position: 'absolute',
              right: 8,
              top: 8,
              zIndex: 50,
              padding: '8px 12px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: '#4ECDC4',
              color: '#fff',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            Properties
          </button>
        )}
      </div>

      {/* Properties Panel */}
      {isTablet && showProps && (
        <div style={styles.propsBackdrop} onClick={() => setShowProps(false)} />
      )}
      <div style={styles.props}>
        {isTablet && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            backgroundColor: darkMode ? '#1a1a2e' : '#fff',
            borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : '#DFE6E9'}`,
          }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: darkMode ? '#F5F6FA' : '#2D3436' }}>Properties</span>
            <button
              onClick={() => setShowProps(false)}
              style={{
                padding: '4px 10px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: darkMode ? 'rgba(255,255,255,0.1)' : '#F5F6FA',
                color: darkMode ? '#F5F6FA' : '#636E72',
                fontWeight: 700,
                fontSize: '16px',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        )}
        <PropertiesPanel
          selectedObject={selectedObject}
          canvas={canvasRef.current?.getCanvas() ?? null}
          darkMode={darkMode}
          onSaveHistory={() => {}}
        />
      </div>

      {/* Timeline */}
      <div style={styles.timeline}>
        {/* Collapse/expand header bar */}
        <div
          onClick={() => setTimelineCollapsed(!timelineCollapsed)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px',
            height: '28px',
            backgroundColor: darkMode ? '#1a1a2e' : '#fff',
            borderBottom: timelineCollapsed ? 'none' : `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : '#DFE6E9'}`,
            cursor: 'pointer',
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          <span style={{
            fontSize: '11px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            color: darkMode ? '#96CEB4' : '#636E72',
          }}>
            Timeline
          </span>
          <span style={{
            fontSize: '10px',
            fontWeight: 700,
            color: darkMode ? '#636E72' : '#B2BEC3',
          }}>
            {timelineCollapsed ? '▲' : '▼'}
          </span>
        </div>
        {!timelineCollapsed && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <TimelinePanel
              key={canvasVersion}
              canvas={canvasRef.current?.getCanvas() ?? null}
              animState={animState}
              onAnimStateChange={setAnimState}
              darkMode={darkMode}
            />
          </div>
        )}
      </div>

      {/* New Project Modal */}
      {showNewModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setShowNewModal(false)}
        >
          <div
            style={{
              backgroundColor: darkMode ? '#1a1a2e' : '#fff',
              borderRadius: '16px',
              padding: '24px',
              minWidth: '380px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              color: darkMode ? '#F5F6FA' : '#2D3436',
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📄</div>
            <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 800 }}>New Project</h2>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: darkMode ? '#B2BEC3' : '#636E72' }}>
              Start fresh? Any unsaved changes will be lost.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button
                onClick={() => setShowNewModal(false)}
                style={{
                  padding: '10px 24px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: darkMode ? 'rgba(255,255,255,0.1)' : '#DFE6E9',
                  color: darkMode ? '#F5F6FA' : '#636E72',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmNewProject}
                style={{
                  padding: '10px 24px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #FF6B6B, #FF8E8E)',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Start New
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Open Projects Modal */}
      {showOpenModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setShowOpenModal(false)}
        >
          <div
            style={{
              backgroundColor: darkMode ? '#1a1a2e' : '#fff',
              borderRadius: '16px',
              padding: '24px',
              minWidth: '400px',
              maxWidth: '500px',
              maxHeight: '70vh',
              overflow: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              color: darkMode ? '#F5F6FA' : '#2D3436',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 16px', fontSize: '20px', fontWeight: 800 }}>Open Project</h2>
            {loadingProjects ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#636E72' }}>Loading...</div>
            ) : projectList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#636E72' }}>No saved projects yet.</div>
            ) : (
              projectList.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleOpenProject(String(p.id))}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '10px',
                    backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : '#F5F6FA',
                    marginBottom: '8px',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = darkMode ? 'rgba(78,205,196,0.2)' : '#E3F9F5';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = darkMode ? 'rgba(255,255,255,0.06)' : '#F5F6FA';
                  }}
                >
                  <span style={{ fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span style={{ fontSize: '12px', color: '#636E72', flexShrink: 0 }}>
                    {new Date(p.updated_at).toLocaleDateString()}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete "${p.name}"? This cannot be undone.`)) {
                        deleteProject(String(p.id)).then(() => {
                          setProjectList((prev) => prev.filter((proj) => proj.id !== p.id));
                          // If deleting the currently open project, reset editor
                          if (currentProjectId === String(p.id)) {
                            canvasRef.current?.clear();
                            setCurrentProjectId(null);
                            setProjectName('Untitled');
                            setAnimState(createDefaultState());
                            navigate('/editor', { replace: true });
                          }
                        }).catch(() => alert('Failed to delete project.'));
                      }
                    }}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      color: '#FF6B6B',
                      cursor: 'pointer',
                      fontSize: '14px',
                      flexShrink: 0,
                      lineHeight: 1,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,107,107,0.15)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                    title={`Delete "${p.name}"`}
                  >
                    🗑️
                  </button>
                </div>
              ))
            )}
            <button
              onClick={() => setShowOpenModal(false)}
              style={{
                marginTop: '12px',
                padding: '8px 20px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#FF6B6B',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Save Modal */}
      {showSaveModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setShowSaveModal(false)}
        >
          <div
            style={{
              backgroundColor: darkMode ? '#1a1a2e' : '#fff',
              borderRadius: '16px',
              padding: '24px',
              minWidth: '380px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              color: darkMode ? '#F5F6FA' : '#2D3436',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 16px', fontSize: '20px', fontWeight: 800 }}>
              {saveModalMode === 'saveAs' ? 'Save As New Project' : currentProjectId ? 'Save Project' : 'Name Your Project'}
            </h2>
            <label style={{ fontSize: '13px', fontWeight: 700, color: darkMode ? '#96CEB4' : '#636E72', display: 'block', marginBottom: '6px' }}>
              Project Name
            </label>
            <input
              autoFocus
              value={saveModalName}
              onChange={(e) => setSaveModalName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') executeSave(saveModalName, saveModalMode === 'saveAs'); }}
              placeholder="My Cool Animation"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                border: `2px solid ${darkMode ? 'rgba(255,255,255,0.15)' : '#DFE6E9'}`,
                backgroundColor: darkMode ? 'rgba(255,255,255,0.08)' : '#F5F6FA',
                color: darkMode ? '#F5F6FA' : '#2D3436',
                fontSize: '15px',
                fontWeight: 600,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSaveModal(false)}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: darkMode ? 'rgba(255,255,255,0.1)' : '#DFE6E9',
                  color: darkMode ? '#F5F6FA' : '#636E72',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => executeSave(saveModalName, saveModalMode === 'saveAs')}
                style={{
                  padding: '8px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #4ECDC4, #44B09E)',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                {saveModalMode === 'saveAs' ? 'Save As New' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
