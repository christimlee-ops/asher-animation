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
import { createDefaultState, createScene } from '../lib/animationState';
import type { AnimationState, AudioTrack, Scene } from '../lib/animationState';
import { exportMultiScene } from '../lib/exportVideo';
import { loadProject, listProjects, deleteProject } from '../lib/projectManager';
import { apiPost, apiPut } from '../lib/api';
import { uploadAsset, listAssets, deleteAsset, updateAssetCategory, renameAsset, getAssetFullUrl, isAudioAsset, ASSET_CATEGORIES, getThumbnailUrl, clearThumbnailCache, onThumbnailReady } from '../lib/mediaLibrary';
import type { MediaAsset, AssetCategory } from '../lib/mediaLibrary';
import { useIsTablet, useIsMobile } from '../lib/useMediaQuery';
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
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryPage, setLibraryPage] = useState(0);
  const [, setThumbRevision] = useState(0);
  const LIBRARY_PAGE_SIZE = 10;
  const [scenes, setScenes] = useState<Scene[]>(() => {
    const s = createScene('Scene 1');
    s.animState = createDefaultState();
    return [s];
  });
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [renamingSceneId, setRenamingSceneId] = useState<string | null>(null);
  const [sceneRenameValue, setSceneRenameValue] = useState('');
  const [deleteSceneIndex, setDeleteSceneIndex] = useState<number | null>(null);
  const isTablet = useIsTablet();
  const isMobile = useIsMobile();
  const canvasRef = useRef<CanvasHandle>(null);

  // Ownership: true if new project or if current user is the owner
  const isOwner = !currentProjectId || !projectOwnerId || String(projectOwnerId) === String(user?.id);

  // ─── Scene management ─────────────────────────────────────────
  // Track whether we're in the middle of a scene switch to avoid re-entrancy
  const switchingSceneRef = useRef(false);

  const switchToScene = useCallback(async (index: number) => {
    if (index === activeSceneIndex || switchingSceneRef.current) return;
    switchingSceneRef.current = true;

    // Save current scene first (compute locally, don't set state yet)
    const canvasJson = canvasRef.current?.toJSON();
    let updatedScenes = scenes;
    if (canvasJson) {
      updatedScenes = scenes.map((s, i) =>
        i === activeSceneIndex ? { ...s, canvasJSON: canvasJson, animState } : s
      );
    }

    // Load the target scene's canvas (async — do this BEFORE any state updates
    // so all setState calls happen in the same microtask and React batches them)
    const targetScene = updatedScenes[index];
    if (targetScene) {
      if (targetScene.canvasJSON) {
        await canvasRef.current?.loadJSON(targetScene.canvasJSON);
      } else {
        canvasRef.current?.clear();
      }
    }

    // All state updates after the await — React batches into one render,
    // so the Timeline key, animState, and scenes all update atomically
    setScenes(updatedScenes);
    if (targetScene) {
      setAnimState(targetScene.animState);
    }
    setActiveSceneIndex(index);
    setSelectedObject(null);
    setCanvasVersion((v) => v + 1);
    switchingSceneRef.current = false;
  }, [activeSceneIndex, animState, scenes]);

  const addScene = useCallback(() => {
    // Save current scene before adding new one
    const canvasJson = canvasRef.current?.toJSON();
    const updatedScenes = canvasJson
      ? scenes.map((s, i) => i === activeSceneIndex ? { ...s, canvasJSON: canvasJson, animState } : s)
      : scenes;
    const newScene = createScene(`Scene ${updatedScenes.length + 1}`);
    const newScenes = [...updatedScenes, newScene];
    setScenes(newScenes);
    setActiveSceneIndex(newScenes.length - 1);
    setAnimState(createDefaultState());
    setSelectedObject(null);
    // Clear canvas for new scene
    setTimeout(() => {
      canvasRef.current?.clear();
      setCanvasVersion((v) => v + 1);
    }, 0);
  }, [activeSceneIndex, animState, scenes]);

  const deleteScene = useCallback((index: number) => {
    if (scenes.length <= 1) return;
    setDeleteSceneIndex(index);
  }, [scenes]);

  const confirmDeleteScene = useCallback(() => {
    if (deleteSceneIndex === null) return;
    const index = deleteSceneIndex;
    setDeleteSceneIndex(null);
    const newScenes = scenes.filter((_, i) => i !== index);
    setScenes(newScenes);

    if (index === activeSceneIndex) {
      // Deleted the active scene — switch to nearest
      const targetIndex = Math.min(index, newScenes.length - 1);
      setActiveSceneIndex(targetIndex);
      const targetScene = newScenes[targetIndex];
      if (targetScene) {
        setAnimState(targetScene.animState);
        if (targetScene.canvasJSON) {
          canvasRef.current?.loadJSON(targetScene.canvasJSON);
        } else {
          canvasRef.current?.clear();
        }
        setCanvasVersion((v) => v + 1);
      }
    } else if (index < activeSceneIndex) {
      // Deleted a scene before the active one — adjust index
      setActiveSceneIndex(activeSceneIndex - 1);
    }
    setSelectedObject(null);
  }, [deleteSceneIndex, scenes, activeSceneIndex]);

  // Fetch media library on mount
  useEffect(() => {
    listAssets().then(setLibraryAssets).catch(() => {});
  }, []);

  // Re-render when thumbnails finish generating
  useEffect(() => {
    return onThumbnailReady(() => setThumbRevision((r) => r + 1));
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
      const isBackground = asset.category === 'backgrounds';
      const CANVAS_W = 1920;
      const CANVAS_H = 1080;
      if (asset.mime_type === 'image/svg+xml') {
        fabric.loadSVGFromURL(fullUrl).then((result) => {
          const group = fabric.util.groupSVGElements(result.objects.filter(Boolean) as fabric.FabricObject[], result.options);
          if (isBackground) {
            // Scale to cover the export area and position at origin
            const scaleX = CANVAS_W / (group.width || 1);
            const scaleY = CANVAS_H / (group.height || 1);
            const scale = Math.max(scaleX, scaleY);
            group.set({ scaleX: scale, scaleY: scale, left: 0, top: 0, originX: 'left', originY: 'top' });
            // Send to back so it's behind other objects
            c.add(group);
            c.sendObjectToBack(group);
          } else {
            group.scaleToWidth(200);
            group.set({ left: CANVAS_W / 2, top: CANVAS_H / 2, originX: 'center', originY: 'center' });
            c.add(group);
          }
          c.setActiveObject(group);
          c.renderAll();
        });
      } else {
        const imgEl = new Image();
        imgEl.crossOrigin = 'anonymous';
        imgEl.onload = () => {
          const fImg = new fabric.FabricImage(imgEl);
          if (isBackground) {
            // Scale to cover the export area and position at origin
            const scaleX = CANVAS_W / (fImg.width || 1);
            const scaleY = CANVAS_H / (fImg.height || 1);
            const scale = Math.max(scaleX, scaleY);
            fImg.set({ scaleX: scale, scaleY: scale, left: 0, top: 0, originX: 'left', originY: 'top' });
            // Send to back so it's behind other objects
            c.add(fImg);
            c.sendObjectToBack(fImg);
          } else {
            fImg.scaleToWidth(200);
            fImg.set({ left: CANVAS_W / 2, top: CANVAS_H / 2, originX: 'center', originY: 'center' });
            c.add(fImg);
          }
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
        clearThumbnailCache(asset.id);
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
      const canvasJson = canvasRef.current?.toJSON();
      const blob = await exportMultiScene({
        canvas: c,
        scenes,
        activeSceneIndex,
        currentCanvasJSON: canvasJson || {},
        currentAnimState: animState,
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
  }, [animState, exporting, projectName, scenes, activeSceneIndex]);

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
        case 'flipH':
          handle.flipHorizontalSelected();
          break;
        case 'flipV':
          handle.flipVerticalSelected();
          break;
        case 'copy':
          handle.copySelected();
          break;
        case 'paste':
          handle.pasteClipboard();
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
          if (data.scenes && data.scenes.length > 0) {
            // Project with scenes
            setScenes(data.scenes);
            const idx = data.activeSceneIndex || 0;
            setActiveSceneIndex(idx);
            const scene = data.scenes[idx];
            if (scene.canvasJSON) await canvasRef.current?.loadJSON(scene.canvasJSON);
            setAnimState(scene.animState || createDefaultState());
          } else if (data.canvas) {
            // Legacy: { canvas, animState } format
            await canvasRef.current?.loadJSON(data.canvas);
            const anim = data.animState || createDefaultState();
            setAnimState(anim);
            const s = createScene('Scene 1');
            s.canvasJSON = data.canvas;
            s.animState = anim;
            setScenes([s]);
            setActiveSceneIndex(0);
          } else {
            // Very old format: plain canvas JSON
            await canvasRef.current?.loadJSON(data);
            const s = createScene('Scene 1');
            s.canvasJSON = data;
            s.animState = createDefaultState();
            setScenes([s]);
            setActiveSceneIndex(0);
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
    // Save current scene state before serializing
    const updatedScenes = scenes.map((s, i) =>
      i === activeSceneIndex ? { ...s, canvasJSON: canvasJson, animState } : s
    );
    const json = { canvas: canvasJson, animState, scenes: updatedScenes, activeSceneIndex };
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
        if (data.scenes && data.scenes.length > 0) {
          // Project with scenes
          setScenes(data.scenes);
          const idx = data.activeSceneIndex || 0;
          setActiveSceneIndex(idx);
          const scene = data.scenes[idx];
          if (scene.canvasJSON) await canvasRef.current?.loadJSON(scene.canvasJSON);
          setAnimState(scene.animState || createDefaultState());
        } else if (data.canvas) {
          // Legacy project without scenes — wrap in a single scene
          await canvasRef.current?.loadJSON(data.canvas);
          const anim = data.animState || createDefaultState();
          setAnimState(anim);
          const s = createScene('Scene 1');
          s.canvasJSON = data.canvas;
          s.animState = anim;
          setScenes([s]);
          setActiveSceneIndex(0);
        } else {
          await canvasRef.current?.loadJSON(data);
          setAnimState(createDefaultState());
          const s = createScene('Scene 1');
          s.canvasJSON = data;
          s.animState = createDefaultState();
          setScenes([s]);
          setActiveSceneIndex(0);
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
      gridTemplateRows: isMobile
        ? 'auto auto 1fr auto'
        : isTablet ? 'auto auto 1fr auto' : 'auto 1fr auto',
      gridTemplateColumns: isMobile
        ? '1fr'
        : isTablet ? '1fr 220px' : '220px 1fr 260px',
      gridTemplateAreas: isMobile
        ? `"topbar" "tools" "canvas" "timeline"`
        : isTablet
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
    props: { gridArea: 'props', overflow: isMobile ? 'visible' : 'hidden', ...(isMobile ? { display: 'none' } : {}) } as React.CSSProperties,
    timeline: {
      gridArea: 'timeline',
      height: timelineCollapsed ? '28px' : (isMobile ? '130px' : isTablet ? '160px' : '210px'),
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
        {/* Collapse/expand header bar with scene tabs */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '28px',
            backgroundColor: darkMode ? '#1a1a2e' : '#f0f1f3',
            borderBottom: timelineCollapsed ? 'none' : `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : '#DFE6E9'}`,
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          {/* Collapse toggle */}
          <div
            onClick={() => setTimelineCollapsed(!timelineCollapsed)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 10px',
              cursor: 'pointer',
              height: '100%',
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

          {/* Scene tabs */}
          {!timelineCollapsed && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              flex: 1,
              overflow: 'auto',
              padding: '0 4px',
              height: '100%',
            }}>
              <div style={{ width: '1px', height: '16px', backgroundColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', flexShrink: 0, margin: '0 4px' }} />
              {scenes.map((scene, idx) => {
                const isActive = idx === activeSceneIndex;
                return (
                  <div
                    key={scene.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      backgroundColor: isActive
                        ? (darkMode ? 'rgba(78,205,196,0.2)' : 'rgba(78,205,196,0.15)')
                        : 'transparent',
                      border: isActive ? '1px solid #4ECDC4' : '1px solid transparent',
                      cursor: 'pointer',
                      flexShrink: 0,
                      height: '22px',
                    }}
                    onClick={() => switchToScene(idx)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setRenamingSceneId(scene.id);
                      setSceneRenameValue(scene.name);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (scenes.length > 1) deleteScene(idx);
                    }}
                  >
                    {renamingSceneId === scene.id ? (
                      <input
                        autoFocus
                        value={sceneRenameValue}
                        onChange={(e) => setSceneRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setScenes((prev) => prev.map((s) =>
                              s.id === scene.id ? { ...s, name: sceneRenameValue.trim() || scene.name } : s
                            ));
                            setRenamingSceneId(null);
                          }
                          if (e.key === 'Escape') setRenamingSceneId(null);
                        }}
                        onBlur={() => {
                          setScenes((prev) => prev.map((s) =>
                            s.id === scene.id ? { ...s, name: sceneRenameValue.trim() || scene.name } : s
                          ));
                          setRenamingSceneId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: '70px',
                          padding: '0 4px',
                          border: '1px solid #4ECDC4',
                          borderRadius: '3px',
                          backgroundColor: darkMode ? 'rgba(255,255,255,0.08)' : '#fff',
                          color: darkMode ? '#F5F6FA' : '#2D3436',
                          fontSize: '10px',
                          fontWeight: 700,
                          outline: 'none',
                        }}
                      />
                    ) : (
                      <span style={{
                        fontSize: '10px',
                        fontWeight: isActive ? 800 : 600,
                        color: isActive ? '#4ECDC4' : (darkMode ? '#B2BEC3' : '#636E72'),
                        whiteSpace: 'nowrap',
                      }}>
                        {scene.name}
                      </span>
                    )}
                    {scenes.length > 1 && isActive && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteScene(idx); }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: darkMode ? '#636E72' : '#B2BEC3',
                          cursor: 'pointer',
                          padding: '0',
                          fontSize: '12px',
                          lineHeight: 1,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title="Delete scene"
                      >×</button>
                    )}
                  </div>
                );
              })}
              {/* Add scene button */}
              <button
                onClick={(e) => { e.stopPropagation(); addScene(); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '20px',
                  height: '20px',
                  borderRadius: '5px',
                  border: `1px dashed ${darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`,
                  backgroundColor: 'transparent',
                  color: darkMode ? '#636E72' : '#B2BEC3',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 700,
                  flexShrink: 0,
                  lineHeight: 1,
                }}
                title="Add new scene"
              >+</button>
            </div>
          )}
        </div>
        {!timelineCollapsed && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <TimelinePanel
              key={`${canvasVersion}-${activeSceneIndex}`}
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
            alignItems: isMobile ? 'flex-end' : 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => { setShowLibrary(false); setEditingAssetId(null); setLibrarySearch(''); }}
        >
          <div
            style={{
              backgroundColor: darkMode ? '#1a1a2e' : '#f0f1f3',
              borderRadius: isMobile ? '16px 16px 0 0' : '16px',
              padding: isMobile ? '16px' : '24px',
              width: isMobile ? '100%' : '520px',
              maxWidth: isMobile ? '100%' : '90vw',
              maxHeight: isMobile ? '90vh' : '80vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              color: darkMode ? '#F5F6FA' : '#2D3436',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? '10px' : '16px', gap: '8px' }}>
              <h2 style={{ margin: 0, fontSize: isMobile ? '17px' : '20px', fontWeight: 800, whiteSpace: 'nowrap' }}>Media Library</h2>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={handleImportToLibrary}
                  style={{
                    padding: isMobile ? '7px 10px' : '8px 16px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #4ECDC4, #44B09E)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: isMobile ? '12px' : '13px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  + Import
                </button>
                <button
                  onClick={() => { setShowLibrary(false); setEditingAssetId(null); setLibrarySearch(''); }}
                  style={{
                    padding: isMobile ? '7px 10px' : '8px 12px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: darkMode ? 'rgba(255,255,255,0.1)' : '#DFE6E9',
                    color: darkMode ? '#F5F6FA' : '#636E72',
                    fontWeight: 700,
                    fontSize: isMobile ? '12px' : '13px',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            {/* Search bar */}
            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <svg
                width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={darkMode ? '#636E72' : '#B2BEC3'} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              >
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                placeholder="Search all categories..."
                value={librarySearch}
                onChange={(e) => { setLibrarySearch(e.target.value); setLibraryPage(0); }}
                style={{
                  width: '100%',
                  padding: '9px 10px 9px 32px',
                  borderRadius: '10px',
                  border: `2px solid ${librarySearch ? '#4ECDC4' : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')}`,
                  backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : '#fff',
                  color: darkMode ? '#F5F6FA' : '#2D3436',
                  fontSize: '13px',
                  fontWeight: 600,
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
              />
              {librarySearch && (
                <button
                  onClick={() => setLibrarySearch('')}
                  style={{
                    position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                    color: darkMode ? '#636E72' : '#B2BEC3', fontSize: '16px', lineHeight: 1,
                  }}
                >
                  ×
                </button>
              )}
            </div>

            {/* Category tabs - hidden when searching */}
            {!librarySearch && (
              <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
                {ASSET_CATEGORIES.map((cat) => {
                  const count = libraryAssets.filter((a) => a.category === cat.key).length;
                  const isActive = libraryCategory === cat.key;
                  return (
                    <button
                      key={cat.key}
                      onClick={() => { setLibraryCategory(cat.key); setEditingAssetId(null); setLibraryPage(0); }}
                      style={{
                        flex: 1,
                        padding: isMobile ? '6px 4px' : '10px 8px',
                        borderRadius: '10px',
                        border: `2px solid ${isActive ? '#4ECDC4' : 'transparent'}`,
                        backgroundColor: isActive
                          ? (darkMode ? 'rgba(78,205,196,0.15)' : 'rgba(78,205,196,0.1)')
                          : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'),
                        color: isActive ? '#4ECDC4' : (darkMode ? '#B2BEC3' : '#636E72'),
                        fontSize: isMobile ? '11px' : '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '2px',
                        transition: 'all 0.15s',
                      }}
                    >
                      <span style={{ fontSize: isMobile ? '15px' : '18px' }}>{cat.icon}</span>
                      <span>{cat.label}</span>
                      <span style={{ fontSize: '10px', opacity: 0.7 }}>{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Asset grid */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
              {(() => {
                const searchTerm = librarySearch.trim().toLowerCase();
                const filtered = searchTerm
                  ? libraryAssets.filter((a) =>
                      a.original_name.toLowerCase().includes(searchTerm) ||
                      a.category.toLowerCase().includes(searchTerm) ||
                      a.mime_type.toLowerCase().includes(searchTerm)
                    )
                  : libraryAssets.filter((a) => a.category === libraryCategory);
                if (filtered.length === 0) {
                  return (
                    <div style={{
                      textAlign: 'center',
                      padding: '40px 20px',
                      color: darkMode ? '#636E72' : '#B2BEC3',
                      fontSize: '14px',
                    }}>
                      {searchTerm
                        ? <>No results for "{librarySearch}".<br /><span style={{ fontSize: '12px' }}>Try a different search term.</span></>
                        : <>No {ASSET_CATEGORIES.find((c) => c.key === libraryCategory)?.label.toLowerCase()} yet.<br /><span style={{ fontSize: '12px' }}>Click "+ Import" to add files.</span></>
                      }
                    </div>
                  );
                }
                const totalPages = Math.ceil(filtered.length / LIBRARY_PAGE_SIZE);
                const safePage = Math.min(libraryPage, totalPages - 1);
                const pageStart = safePage * LIBRARY_PAGE_SIZE;
                const pageAssets = filtered.slice(pageStart, pageStart + LIBRARY_PAGE_SIZE);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {searchTerm && (
                      <div style={{ fontSize: '11px', fontWeight: 700, color: darkMode ? '#636E72' : '#B2BEC3', padding: '2px 4px 6px', borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`, marginBottom: '4px' }}>
                        {filtered.length} result{filtered.length !== 1 ? 's' : ''} across all categories
                      </div>
                    )}
                    {pageAssets.map((asset) => {
                      const isAudio = asset.mime_type.startsWith('audio/');
                      const isEditing = editingAssetId === asset.id;
                      const thumbSize = isMobile ? 44 : 56;
                      const thumbUrl = !isAudio ? getThumbnailUrl(asset, thumbSize * 2) : null;
                      const matchedCat = searchTerm ? ASSET_CATEGORIES.find((c) => c.key === asset.category) : null;
                      return (
                        <div key={asset.id}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: isMobile ? '8px' : '10px',
                              padding: isMobile ? '6px 8px' : '8px 12px',
                              borderRadius: '10px',
                              backgroundColor: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                              cursor: 'pointer',
                              transition: 'background-color 0.15s',
                            }}
                            onClick={() => {
                              handleUseAsset(asset);
                              setShowLibrary(false);
                              setEditingAssetId(null);
                              setLibrarySearch('');
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
                                width: `${thumbSize}px`, height: `${thumbSize}px`, borderRadius: '8px',
                                backgroundColor: darkMode ? 'rgba(78,205,196,0.15)' : 'rgba(78,205,196,0.1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: isMobile ? '18px' : '22px', flexShrink: 0,
                              }}>♪</span>
                            ) : (
                              <img
                                src={thumbUrl || getAssetFullUrl(asset)}
                                alt=""
                                loading="lazy"
                                style={{ width: `${thumbSize}px`, height: `${thumbSize}px`, objectFit: 'cover', borderRadius: '8px', flexShrink: 0, backgroundColor: darkMode ? '#2a2a3e' : '#d8d9db' }}
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
                                  {asset.original_name.replace(/\.[^.]+$/, '')}
                                </div>
                              )}
                              <div style={{ fontSize: '11px', color: darkMode ? '#636E72' : '#B2BEC3', display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <span>{(asset.size / 1024).toFixed(0)} KB</span>
                                {matchedCat && (
                                  <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', backgroundColor: darkMode ? 'rgba(78,205,196,0.12)' : 'rgba(78,205,196,0.08)', color: '#4ECDC4', fontWeight: 700 }}>
                                    {matchedCat.icon} {matchedCat.label}
                                  </span>
                                )}
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
                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '6px', padding: '10px 0 4px', borderTop: `1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`,
                        marginTop: '6px',
                      }}>
                        <button
                          onClick={() => setLibraryPage(Math.max(0, safePage - 1))}
                          disabled={safePage === 0}
                          style={{
                            padding: '4px 10px', borderRadius: '6px', border: 'none',
                            backgroundColor: safePage === 0 ? 'transparent' : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'),
                            color: safePage === 0 ? (darkMode ? '#444' : '#ccc') : (darkMode ? '#B2BEC3' : '#636E72'),
                            fontWeight: 700, fontSize: '12px', cursor: safePage === 0 ? 'default' : 'pointer',
                          }}
                        >‹ Prev</button>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: darkMode ? '#636E72' : '#B2BEC3' }}>
                          {safePage + 1} / {totalPages}
                        </span>
                        <button
                          onClick={() => setLibraryPage(Math.min(totalPages - 1, safePage + 1))}
                          disabled={safePage >= totalPages - 1}
                          style={{
                            padding: '4px 10px', borderRadius: '6px', border: 'none',
                            backgroundColor: safePage >= totalPages - 1 ? 'transparent' : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'),
                            color: safePage >= totalPages - 1 ? (darkMode ? '#444' : '#ccc') : (darkMode ? '#B2BEC3' : '#636E72'),
                            fontWeight: 700, fontSize: '12px', cursor: safePage >= totalPages - 1 ? 'default' : 'pointer',
                          }}
                        >Next ›</button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Delete Scene Confirmation */}
      {deleteSceneIndex !== null && (
        <div
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          }}
          onClick={() => setDeleteSceneIndex(null)}
        >
          <div
            style={{
              backgroundColor: darkMode ? '#1a1a2e' : '#fff',
              borderRadius: '16px', padding: '28px 32px', width: '360px', maxWidth: '90vw',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              color: darkMode ? '#F5F6FA' : '#2D3436',
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              backgroundColor: 'rgba(255,107,107,0.12)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
            }}>
              <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#FF6B6B" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 800 }}>Delete Scene</h3>
            <p style={{
              margin: '0 0 24px', fontSize: '14px', lineHeight: 1.5,
              color: darkMode ? '#B2BEC3' : '#636E72',
            }}>
              Are you sure you want to delete <strong style={{ color: darkMode ? '#F5F6FA' : '#2D3436' }}>"{scenes[deleteSceneIndex]?.name}"</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setDeleteSceneIndex(null)}
                style={{
                  flex: 1, padding: '10px 16px', borderRadius: '10px',
                  border: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                  backgroundColor: 'transparent',
                  color: darkMode ? '#B2BEC3' : '#636E72',
                  fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                onClick={confirmDeleteScene}
                style={{
                  flex: 1, padding: '10px 16px', borderRadius: '10px', border: 'none',
                  background: 'linear-gradient(135deg, #FF6B6B, #EE5A24)',
                  color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(255,107,107,0.3)',
                }}
              >Delete</button>
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
