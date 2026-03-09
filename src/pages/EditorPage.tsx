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
import type { AnimationState, AudioTrack } from '../lib/animationState';
import { exportToMp4 } from '../lib/exportVideo';
import { loadProject, listProjects, deleteProject } from '../lib/projectManager';
import { apiPost, apiPut } from '../lib/api';
import { uploadAsset, listAssets, deleteAsset, updateAssetCategory, renameAsset, getAssetFullUrl, isAudioAsset, ASSET_CATEGORIES } from '../lib/mediaLibrary';
import type { MediaAsset, AssetCategory } from '../lib/mediaLibrary';
import { useIsTablet } from '../lib/useMediaQuery';
import { useAuth } from '../contexts/AuthContext';

export default function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [darkMode, setDarkMode] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolName>('select');
  const [fillColor, _setFillColor] = useState('#4ECDC4');
  const [strokeColor, _setStrokeColor] = useState('#2D3436');
  const [selectedObject, setSelectedObject] = useState<fabric.FabricObject | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(projectId || null);
  const [projectName, setProjectName] = useState('Untitled');
  const [projectOwnerId, setProjectOwnerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [animState, setAnimState] = useState<AnimationState>(createDefaultState());
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [canvasVersion, setCanvasVersion] = useState(0);
  const [libraryAssets, setLibraryAssets] = useState<MediaAsset[]>([]);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryCategory, setLibraryCategory] = useState<AssetCategory>('characters');
  const [editingAssetId, setEditingAssetId] = useState<number | null>(null);
  const [renamingAssetId, setRenamingAssetId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const isTablet = useIsTablet();
  const canvasRef = useRef<CanvasHandle>(null);

  // Ownership: true if new project or if current user is the owner
  const isOwner = !currentProjectId || !projectOwnerId || String(projectOwnerId) === String(user?.id);

  // Fetch media library on mount
  useEffect(() => {
    listAssets().then(setLibraryAssets).catch(() => {});
  }, []);

  const handleHistoryChange = useCallback((undo: boolean, redo: boolean) => {
    setCanUndo(undo);
    setCanRedo(redo);
  }, []);

  const handleSelectionChange = useCallback((obj: fabric.FabricObject | null) => {
    setSelectedObject(obj);
  }, []);

  const handleImportToLibrary = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.svg,.png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.ogg,.m4a,.aac';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setPendingImportFile(file);
      setShowCategoryPicker(true);
    };
    input.click();
  }, []);

  const handleImport = handleImportToLibrary;

  const confirmImportWithCategory = useCallback((category: AssetCategory) => {
    const file = pendingImportFile;
    if (!file) return;
    setShowCategoryPicker(false);
    setPendingImportFile(null);

    // Only upload to library — user clicks the asset in the library to add it
    uploadAsset(file, category)
      .then((asset) => {
        setLibraryAssets((prev) => [asset, ...prev]);
      })
      .catch((err) => console.warn('Failed to save to library:', err));
  }, [pendingImportFile]);

  const handleUseAsset = useCallback((asset: MediaAsset) => {
    const fullUrl = getAssetFullUrl(asset);
    if (isAudioAsset(asset)) {
      // Fetch the audio file and convert to data URL for timeline
      fetch(fullUrl)
        .then((res) => res.blob())
        .then((blob) => {
          const reader = new FileReader();
          reader.onload = () => {
            const track: AudioTrack = {
              id: `audio_${Date.now()}`,
              name: asset.original_name.replace(/\.[^.]+$/, ''),
              dataUrl: reader.result as string,
              startFrame: 0,
              volume: 1,
            };
            setAnimState((prev) => ({
              ...prev,
              audioTracks: [...(prev.audioTracks || []), track],
            }));
          };
          reader.readAsDataURL(blob);
        })
        .catch(() => alert('Failed to load audio from library'));
    } else {
      // Image — add to canvas via fabric
      const c = canvasRef.current?.getCanvas();
      if (!c) return;
      if (asset.mime_type === 'image/svg+xml') {
        fabric.loadSVGFromURL(fullUrl).then((result) => {
          const group = fabric.util.groupSVGElements(result.objects.filter(Boolean) as fabric.FabricObject[], result.options);
          group.scaleToWidth(200);
          c.add(group);
          c.setActiveObject(group);
          c.renderAll();
        });
      } else {
        const imgEl = new Image();
        imgEl.crossOrigin = 'anonymous';
        imgEl.onload = () => {
          const fImg = new fabric.FabricImage(imgEl);
          fImg.scaleToWidth(200);
          c.add(fImg);
          c.setActiveObject(fImg);
          c.renderAll();
        };
        imgEl.src = fullUrl;
      }
    }
  }, []);

  const handleDeleteAsset = useCallback((asset: MediaAsset) => {
    deleteAsset(asset.id)
      .then(() => {
        setLibraryAssets((prev) => prev.filter((a) => a.id !== asset.id));
      })
      .catch(() => alert('Failed to delete asset'));
  }, []);

  const handleChangeAssetCategory = useCallback((asset: MediaAsset, category: AssetCategory) => {
    updateAssetCategory(asset.id, category)
      .then(() => {
        setLibraryAssets((prev) =>
          prev.map((a) => a.id === asset.id ? { ...a, category } : a)
        );
      })
      .catch(() => alert('Failed to update category'));
  }, []);

  const handleRenameAsset = useCallback((assetId: number, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) { setRenamingAssetId(null); return; }
    renameAsset(assetId, trimmed)
      .then(() => {
        setLibraryAssets((prev) =>
          prev.map((a) => a.id === assetId ? { ...a, original_name: trimmed } : a)
        );
      })
      .catch(() => alert('Failed to rename asset'));
    setRenamingAssetId(null);
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
      a.download = `${projectName || 'animation'}.webm`;
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
        setProjectOwnerId(proj.user_id ? String(proj.user_id) : null);
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
    if (!isOwner) {
      // Non-owners can only Save As
      handleSaveAs();
      return;
    }
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
    // Non-owners are forced to save as copy
    const forceCopy = !isOwner;
    const json = { canvas: canvasJson, animState };
    console.log('[SAVE] animState timelines:', animState.timelines.length, 'objects:', (canvasJson as any).objects?.length);
    console.log('[SAVE] _animIds on objects:', (canvasJson as any).objects?.map((o: any) => o._animId).filter(Boolean));
    setSaving(true);
    setSaveStatus('');
    setShowSaveModal(false);
    try {
      if (currentProjectId && !asCopy && !forceCopy) {
        // Update existing project (only owner)
        await apiPut(`/projects/${currentProjectId}`, { name: finalName, data: json });
        setProjectName(finalName);
      } else {
        // Create new project
        const res = await apiPost<{ project: { id: string } }>('/projects', {
          name: finalName,
          data: json,
        });
        setCurrentProjectId(String(res.project.id));
        setProjectOwnerId(user?.id ? String(user.id) : null);
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


  const styles = {
    layout: {
      display: 'grid',
      gridTemplateRows: isTablet ? 'auto auto 1fr auto' : 'auto 1fr auto',
      gridTemplateColumns: isTablet ? '1fr 220px' : '220px 1fr 260px',
      gridTemplateAreas: isTablet
        ? `"topbar topbar" "tools tools" "canvas props" "timeline timeline"`
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
    props: { gridArea: 'props', overflow: 'hidden' } as React.CSSProperties,
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
        {(saveStatus || saving) && (
          <div style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', zIndex: 10, display: 'flex', gap: '12px' }}>
            {saving && <span style={{ fontSize: '13px', fontWeight: 700, color: darkMode ? '#4ECDC4' : '#636E72' }}>Saving...</span>}
            {saveStatus && <span style={{ fontSize: '13px', fontWeight: 700, color: saveStatus === 'Saved!' ? '#00B894' : '#FF6B6B' }}>{saveStatus}</span>}
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
          isOwner={isOwner}
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
          onOpenLibrary={() => setShowLibrary(true)}
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
            backgroundColor: darkMode ? '#1a1a2e' : '#f0f1f3',
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
              backgroundColor: darkMode ? '#1a1a2e' : '#f0f1f3',
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
              backgroundColor: darkMode ? '#1a1a2e' : '#f0f1f3',
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
              backgroundColor: darkMode ? '#1a1a2e' : '#f0f1f3',
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

      {/* Media Library Modal */}
      {showLibrary && (
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
          onClick={() => { setShowLibrary(false); setEditingAssetId(null); }}
        >
          <div
            style={{
              backgroundColor: darkMode ? '#1a1a2e' : '#f0f1f3',
              borderRadius: '16px',
              padding: '24px',
              width: '520px',
              maxWidth: '90vw',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              color: darkMode ? '#F5F6FA' : '#2D3436',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Media Library</h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleImportToLibrary}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #4ECDC4, #44B09E)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  + Import New
                </button>
                <button
                  onClick={() => { setShowLibrary(false); setEditingAssetId(null); }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: darkMode ? 'rgba(255,255,255,0.1)' : '#DFE6E9',
                    color: darkMode ? '#F5F6FA' : '#636E72',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            {/* Category tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
              {ASSET_CATEGORIES.map((cat) => {
                const count = libraryAssets.filter((a) => a.category === cat.key).length;
                const isActive = libraryCategory === cat.key;
                return (
                  <button
                    key={cat.key}
                    onClick={() => { setLibraryCategory(cat.key); setEditingAssetId(null); }}
                    style={{
                      flex: 1,
                      padding: '10px 8px',
                      borderRadius: '10px',
                      border: `2px solid ${isActive ? '#4ECDC4' : 'transparent'}`,
                      backgroundColor: isActive
                        ? (darkMode ? 'rgba(78,205,196,0.15)' : 'rgba(78,205,196,0.1)')
                        : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'),
                      color: isActive ? '#4ECDC4' : (darkMode ? '#B2BEC3' : '#636E72'),
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '2px',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: '18px' }}>{cat.icon}</span>
                    <span>{cat.label}</span>
                    <span style={{ fontSize: '10px', opacity: 0.7 }}>{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Asset grid */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {(() => {
                const filtered = libraryAssets.filter((a) => a.category === libraryCategory);
                if (filtered.length === 0) {
                  return (
                    <div style={{
                      textAlign: 'center',
                      padding: '40px 20px',
                      color: darkMode ? '#636E72' : '#B2BEC3',
                      fontSize: '14px',
                    }}>
                      No {ASSET_CATEGORIES.find((c) => c.key === libraryCategory)?.label.toLowerCase()} yet.
                      <br />
                      <span style={{ fontSize: '12px' }}>Click "Import New" to add files.</span>
                    </div>
                  );
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {filtered.map((asset) => {
                      const isAudio = asset.mime_type.startsWith('audio/');
                      const isEditing = editingAssetId === asset.id;
                      return (
                        <div key={asset.id}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '8px 12px',
                              borderRadius: '10px',
                              backgroundColor: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                              cursor: 'pointer',
                              transition: 'background-color 0.15s',
                            }}
                            onClick={() => {
                              handleUseAsset(asset);
                              setShowLibrary(false);
                              setEditingAssetId(null);
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.backgroundColor = darkMode
                                ? 'rgba(78,205,196,0.12)' : 'rgba(78,205,196,0.08)';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.backgroundColor = darkMode
                                ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
                            }}
                          >
                            {/* Thumbnail */}
                            {isAudio ? (
                              <span style={{
                                width: '56px', height: '56px', borderRadius: '8px',
                                backgroundColor: darkMode ? 'rgba(78,205,196,0.15)' : 'rgba(78,205,196,0.1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '22px', flexShrink: 0,
                              }}>♪</span>
                            ) : (
                              <img
                                src={getAssetFullUrl(asset)}
                                alt=""
                                style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }}
                              />
                            )}
                            {/* Name */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {renamingAssetId === asset.id ? (
                                <input
                                  autoFocus
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRenameAsset(asset.id, renameValue);
                                    if (e.key === 'Escape') setRenamingAssetId(null);
                                  }}
                                  onBlur={() => handleRenameAsset(asset.id, renameValue)}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    width: '100%',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    border: `2px solid #4ECDC4`,
                                    backgroundColor: darkMode ? 'rgba(255,255,255,0.08)' : '#fff',
                                    color: darkMode ? '#F5F6FA' : '#2D3436',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    fontWeight: 700, fontSize: '13px',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    cursor: 'text',
                                  }}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setRenamingAssetId(asset.id);
                                    setRenameValue(asset.original_name);
                                  }}
                                  title="Double-click to rename"
                                >
                                  {asset.original_name}
                                </div>
                              )}
                              <div style={{ fontSize: '11px', color: darkMode ? '#636E72' : '#B2BEC3' }}>
                                {(asset.size / 1024).toFixed(0)} KB
                              </div>
                            </div>
                            {/* Rename button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (renamingAssetId === asset.id) {
                                  handleRenameAsset(asset.id, renameValue);
                                } else {
                                  setRenamingAssetId(asset.id);
                                  setRenameValue(asset.original_name);
                                }
                              }}
                              style={{
                                background: 'none', border: 'none',
                                color: darkMode ? '#636E72' : '#B2BEC3',
                                cursor: 'pointer', padding: '4px', borderRadius: '6px', flexShrink: 0,
                              }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#4ECDC4'; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = darkMode ? '#636E72' : '#B2BEC3'; }}
                              title="Rename"
                            >
                              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                              </svg>
                            </button>
                            {/* Edit category */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingAssetId(isEditing ? null : asset.id);
                              }}
                              style={{
                                background: 'none', border: 'none',
                                color: darkMode ? '#636E72' : '#B2BEC3',
                                cursor: 'pointer', padding: '4px', borderRadius: '6px', flexShrink: 0,
                              }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#4ECDC4'; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = darkMode ? '#636E72' : '#B2BEC3'; }}
                              title="Change category"
                            >
                              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                            </button>
                            {/* Delete */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteAsset(asset);
                              }}
                              style={{
                                background: 'none', border: 'none',
                                color: '#FF6B6B', cursor: 'pointer',
                                padding: '4px', borderRadius: '6px', flexShrink: 0, opacity: 0.5,
                              }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.5'; }}
                              title="Delete from library"
                            >
                              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                              </svg>
                            </button>
                          </div>
                          {/* Category editor dropdown */}
                          {isEditing && (
                            <div style={{
                              display: 'flex', gap: '4px', padding: '6px 12px',
                              marginTop: '2px',
                            }}>
                              {ASSET_CATEGORIES.map((cat) => (
                                <button
                                  key={cat.key}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (cat.key !== asset.category) {
                                      handleChangeAssetCategory(asset, cat.key);
                                    }
                                    setEditingAssetId(null);
                                  }}
                                  style={{
                                    flex: 1,
                                    padding: '6px 4px',
                                    borderRadius: '8px',
                                    border: `1px solid ${cat.key === asset.category ? '#4ECDC4' : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')}`,
                                    backgroundColor: cat.key === asset.category
                                      ? (darkMode ? 'rgba(78,205,196,0.15)' : 'rgba(78,205,196,0.1)')
                                      : 'transparent',
                                    color: cat.key === asset.category ? '#4ECDC4' : (darkMode ? '#B2BEC3' : '#636E72'),
                                    fontWeight: 700,
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px',
                                  }}
                                >
                                  <span>{cat.icon}</span>
                                  <span>{cat.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Category Picker Modal */}
      {showCategoryPicker && pendingImportFile && (
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
          onClick={() => { setShowCategoryPicker(false); setPendingImportFile(null); }}
        >
          <div
            style={{
              backgroundColor: darkMode ? '#1a1a2e' : '#f0f1f3',
              borderRadius: '16px',
              padding: '24px',
              minWidth: '340px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              color: darkMode ? '#F5F6FA' : '#2D3436',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 800 }}>Choose Category</h2>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: darkMode ? '#636E72' : '#B2BEC3' }}>
              Where should "{pendingImportFile.name}" be filed?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {ASSET_CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => confirmImportWithCategory(cat.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    border: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                    backgroundColor: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                    color: darkMode ? '#F5F6FA' : '#2D3436',
                    fontWeight: 700,
                    fontSize: '14px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = darkMode
                      ? 'rgba(78,205,196,0.15)' : 'rgba(78,205,196,0.1)';
                    (e.currentTarget as HTMLElement).style.borderColor = '#4ECDC4';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = darkMode
                      ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
                    (e.currentTarget as HTMLElement).style.borderColor = darkMode
                      ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
                  }}
                >
                  <span style={{ fontSize: '20px' }}>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setShowCategoryPicker(false); setPendingImportFile(null); }}
              style={{
                marginTop: '12px',
                padding: '8px 20px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: darkMode ? 'rgba(255,255,255,0.1)' : '#DFE6E9',
                color: darkMode ? '#F5F6FA' : '#636E72',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '13px',
                width: '100%',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Export progress popup */}
      {exporting && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            backgroundColor: darkMode ? '#1a1a2e' : '#f0f1f3',
            borderRadius: '16px',
            padding: '32px 40px',
            minWidth: '320px',
            textAlign: 'center',
            boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
            border: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
          }}>
            <div style={{
              width: '48px', height: '48px', margin: '0 auto 16px',
              border: '4px solid', borderColor: `#4ECDC4 transparent transparent transparent`,
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <div style={{ fontSize: '16px', fontWeight: 800, color: darkMode ? '#F5F6FA' : '#2D3436', marginBottom: '8px' }}>
              Exporting Video
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: darkMode ? '#636E72' : '#636E72' }}>
              {exportStatus || 'Starting...'}
            </div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  );
}
