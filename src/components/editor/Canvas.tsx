import {
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import * as fabric from 'fabric';
import type { ToolName } from './ToolsPanel';

// ─── Types ───────────────────────────────────────────────────────────
export interface CanvasHandle {
  getCanvas: () => fabric.Canvas | null;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
  toJSON: () => object;
  loadJSON: (json: object) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  setBackgroundColor: (color: string) => void;
  toggleGrid: () => void;
  importFile: (file: File) => void;
}

interface CanvasProps {
  activeTool: ToolName;
  fillColor: string;
  strokeColor: string;
  darkMode: boolean;
  onSelectionChange: (obj: fabric.FabricObject | null) => void;
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
  onToolReset?: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────
const CANVAS_W = 1920;
const CANVAS_H = 1080;
const MAX_HISTORY = 50;
const GRID_SIZE = 40;

// ─── Component ───────────────────────────────────────────────────────
const CanvasEditor = forwardRef<CanvasHandle, CanvasProps>(
  ({ activeTool, fillColor, strokeColor, darkMode, onSelectionChange, onHistoryChange, onToolReset }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasElRef = useRef<HTMLCanvasElement>(null);
    const fcRef = useRef<fabric.Canvas | null>(null);
    const historyRef = useRef<string[]>([]);
    const historyIndexRef = useRef(-1);
    const isDrawingShapeRef = useRef(false);
    const drawStartRef = useRef<{ x: number; y: number } | null>(null);
    const tempShapeRef = useRef<fabric.FabricObject | null>(null);
    const showGridRef = useRef(false);
    const gridLinesRef = useRef<fabric.FabricObject[]>([]);
    const isPanningRef = useRef(false);
    const lastPanPosRef = useRef<{ x: number; y: number } | null>(null);

    // ─── History helpers ───────────────────────────────────────────
    const saveHistory = useCallback(() => {
      const fc = fcRef.current;
      if (!fc) return;
      const json = JSON.stringify(fc.toJSON());
      const idx = historyIndexRef.current;
      // Trim future
      historyRef.current = historyRef.current.slice(0, idx + 1);
      historyRef.current.push(json);
      if (historyRef.current.length > MAX_HISTORY) {
        historyRef.current.shift();
      } else {
        historyIndexRef.current = historyRef.current.length - 1;
      }
      onHistoryChange(historyIndexRef.current > 0, false);
    }, [onHistoryChange]);

    const restoreHistory = useCallback(
      (index: number) => {
        const fc = fcRef.current;
        if (!fc) return;
        const json = historyRef.current[index];
        if (!json) return;
        fc.loadFromJSON(JSON.parse(json)).then(() => {
          fc.renderAll();
          historyIndexRef.current = index;
          onHistoryChange(index > 0, index < historyRef.current.length - 1);
        });
      },
      [onHistoryChange],
    );

    const undo = useCallback(() => {
      if (historyIndexRef.current > 0) {
        restoreHistory(historyIndexRef.current - 1);
      }
    }, [restoreHistory]);

    const redo = useCallback(() => {
      if (historyIndexRef.current < historyRef.current.length - 1) {
        restoreHistory(historyIndexRef.current + 1);
      }
    }, [restoreHistory]);

    // ─── Fit canvas to container ───────────────────────────────────
    const fitCanvas = useCallback(() => {
      const fc = fcRef.current;
      const container = containerRef.current;
      if (!fc || !container) return;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const scaleX = cw / CANVAS_W;
      const scaleY = ch / CANVAS_H;
      const scale = Math.min(scaleX, scaleY, 1);
      fc.setDimensions({ width: CANVAS_W * scale, height: CANVAS_H * scale });
      fc.setZoom(scale);
    }, []);

    // ─── Grid ──────────────────────────────────────────────────────
    const drawGrid = useCallback(() => {
      const fc = fcRef.current;
      if (!fc) return;
      removeGrid();
      const lines: fabric.FabricObject[] = [];
      for (let x = 0; x <= CANVAS_W; x += GRID_SIZE) {
        const line = new fabric.Line([x, 0, x, CANVAS_H], {
          stroke: 'rgba(0,0,0,0.08)',
          strokeWidth: 1,
          selectable: false,
          evented: false,
          excludeFromExport: true,
        });
        fc.add(line);
        fc.sendObjectToBack(line);
        lines.push(line);
      }
      for (let y = 0; y <= CANVAS_H; y += GRID_SIZE) {
        const line = new fabric.Line([0, y, CANVAS_W, y], {
          stroke: 'rgba(0,0,0,0.08)',
          strokeWidth: 1,
          selectable: false,
          evented: false,
          excludeFromExport: true,
        });
        fc.add(line);
        fc.sendObjectToBack(line);
        lines.push(line);
      }
      gridLinesRef.current = lines;
      fc.renderAll();
    }, []);

    const removeGrid = useCallback(() => {
      const fc = fcRef.current;
      if (!fc) return;
      gridLinesRef.current.forEach((l) => fc.remove(l));
      gridLinesRef.current = [];
      fc.renderAll();
    }, []);

    // ─── Snap ──────────────────────────────────────────────────────
    const snapToGrid = (val: number) =>
      showGridRef.current ? Math.round(val / GRID_SIZE) * GRID_SIZE : val;

    // ─── Initialize fabric canvas ──────────────────────────────────
    useEffect(() => {
      if (!canvasElRef.current) return;
      const fc = new fabric.Canvas(canvasElRef.current, {
        width: CANVAS_W,
        height: CANVAS_H,
        backgroundColor: '#ffffff',
        preserveObjectStacking: true,
        selection: true,
      });
      fcRef.current = fc;
      fitCanvas();
      saveHistory();

      // Resize observer
      const ro = new ResizeObserver(() => fitCanvas());
      if (containerRef.current) ro.observe(containerRef.current);

      // Mouse wheel zoom
      fc.on('mouse:wheel', (opt) => {
        const e = opt.e as WheelEvent;
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY;
        let zoom = fc.getZoom();
        zoom *= 0.999 ** delta;
        const minZoom =
          Math.min(
            (containerRef.current?.clientWidth || 800) / CANVAS_W,
            (containerRef.current?.clientHeight || 600) / CANVAS_H,
            1,
          );
        zoom = Math.max(minZoom, Math.min(5, zoom));
        fc.zoomToPoint(new fabric.Point(e.offsetX, e.offsetY), zoom);
      });

      // Delete key
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
          const active = fc.getActiveObjects();
          if (active.length) {
            active.forEach((o) => fc.remove(o));
            fc.discardActiveObject();
            fc.renderAll();
            saveHistory();
            onSelectionChange(null);
          }
        }
        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
        if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
      };
      window.addEventListener('keydown', handleKeyDown);

      // Selection events
      fc.on('selection:created', () => {
        const sel = fc.getActiveObject();
        onSelectionChange(sel || null);
      });
      fc.on('selection:updated', () => {
        const sel = fc.getActiveObject();
        onSelectionChange(sel || null);
      });
      fc.on('selection:cleared', () => {
        onSelectionChange(null);
      });

      // Save history on object modified
      fc.on('object:modified', () => saveHistory());

      // File drop
      const handleDrop = (e: DragEvent) => {
        e.preventDefault();
        const files = e.dataTransfer?.files;
        if (!files || !files.length) return;
        importFileToCanvas(files[0]);
      };
      const handleDragOver = (e: DragEvent) => e.preventDefault();
      const el = containerRef.current;
      if (el) {
        el.addEventListener('drop', handleDrop);
        el.addEventListener('dragover', handleDragOver);
      }

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        if (el) {
          el.removeEventListener('drop', handleDrop);
          el.removeEventListener('dragover', handleDragOver);
        }
        ro.disconnect();
        fc.dispose();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Import file helper ────────────────────────────────────────
    const importFileToCanvas = (file: File) => {
      const fc = fcRef.current;
      if (!fc) return;
      const url = URL.createObjectURL(file);
      if (file.type === 'image/svg+xml') {
        fabric.loadSVGFromURL(url).then((result) => {
          const group = fabric.util.groupSVGElements(result.objects.filter(Boolean) as fabric.FabricObject[]);
          group.scaleToWidth(Math.min(400, CANVAS_W / 2));
          fc.add(group);
          fc.setActiveObject(group);
          fc.renderAll();
          saveHistory();
          URL.revokeObjectURL(url);
        });
      } else if (file.type.startsWith('image/')) {
        fabric.FabricImage.fromURL(url).then((img) => {
          img.scaleToWidth(Math.min(400, CANVAS_W / 2));
          fc.add(img);
          fc.setActiveObject(img);
          fc.renderAll();
          saveHistory();
          URL.revokeObjectURL(url);
        });
      }
    };

    // ─── Tool handling ─────────────────────────────────────────────
    useEffect(() => {
      const fc = fcRef.current;
      if (!fc) return;

      // Reset modes
      fc.isDrawingMode = false;
      fc.selection = activeTool === 'select';
      fc.defaultCursor = activeTool === 'select' ? 'default' : 'crosshair';

      // Set all objects selectable only in select mode
      fc.getObjects().forEach((o) => {
        if (!(o as any).excludeFromExport) {
          o.selectable = activeTool === 'select';
          o.evented = activeTool === 'select';
        }
      });

      if (activeTool === 'pencil') {
        fc.isDrawingMode = true;
        fc.freeDrawingBrush = new fabric.PencilBrush(fc);
        fc.freeDrawingBrush.color = fillColor;
        fc.freeDrawingBrush.width = 3;
      }

      // Shape drawing handlers
      const handleMouseDown = (opt: fabric.TPointerEventInfo) => {
        if (activeTool === 'select' || activeTool === 'pencil') {
          // Panning when zoomed
          if (activeTool === 'select' && (opt.e as MouseEvent).altKey) {
            isPanningRef.current = true;
            lastPanPosRef.current = { x: (opt.e as MouseEvent).clientX, y: (opt.e as MouseEvent).clientY };
            return;
          }
          return;
        }
        isDrawingShapeRef.current = true;
        const pointer = fc.getScenePoint(opt.e);
        drawStartRef.current = { x: snapToGrid(pointer.x), y: snapToGrid(pointer.y) };

        let shape: fabric.FabricObject | null = null;
        const common = {
          left: drawStartRef.current.x,
          top: drawStartRef.current.y,
          fill: fillColor,
          stroke: strokeColor,
          strokeWidth: 2,
          selectable: false,
          evented: false,
        };

        switch (activeTool) {
          case 'rectangle':
            shape = new fabric.Rect({ ...common, width: 1, height: 1, rx: 4, ry: 4 });
            break;
          case 'circle':
            shape = new fabric.Circle({ ...common, radius: 1 });
            break;
          case 'triangle':
            shape = new fabric.Triangle({ ...common, width: 1, height: 1 });
            break;
          case 'star': {
            const pts = createStarPoints(0, 0, 5, 1, 0.5);
            shape = new fabric.Polygon(pts, { ...common });
            break;
          }
          case 'line':
            shape = new fabric.Line(
              [drawStartRef.current.x, drawStartRef.current.y, drawStartRef.current.x, drawStartRef.current.y],
              { ...common, fill: undefined },
            );
            break;
          case 'text':
            shape = new fabric.IText('Text', {
              ...common,
              fontSize: 40,
              fontWeight: 'bold',
              fontFamily: 'Arial',
            });
            break;
        }

        if (shape) {
          fc.add(shape);
          tempShapeRef.current = shape;
          if (activeTool === 'text') {
            // Place immediately
            isDrawingShapeRef.current = false;
            shape.selectable = true;
            shape.evented = true;
            fc.setActiveObject(shape);
            (shape as fabric.IText).enterEditing();
            fc.renderAll();
            saveHistory();
          }
        }
      };

      const handleMouseMove = (opt: fabric.TPointerEventInfo) => {
        // Panning
        if (isPanningRef.current && lastPanPosRef.current) {
          const e = opt.e as MouseEvent;
          const vpt = fc.viewportTransform!;
          vpt[4] += e.clientX - lastPanPosRef.current.x;
          vpt[5] += e.clientY - lastPanPosRef.current.y;
          lastPanPosRef.current = { x: e.clientX, y: e.clientY };
          fc.requestRenderAll();
          return;
        }

        if (!isDrawingShapeRef.current || !drawStartRef.current || !tempShapeRef.current) return;
        const pointer = fc.getScenePoint(opt.e);
        const sx = drawStartRef.current.x;
        const sy = drawStartRef.current.y;
        const px = snapToGrid(pointer.x);
        const py = snapToGrid(pointer.y);
        const w = Math.abs(px - sx);
        const h = Math.abs(py - sy);
        const shape = tempShapeRef.current;

        switch (activeTool) {
          case 'rectangle':
            shape.set({ left: Math.min(sx, px), top: Math.min(sy, py), width: w, height: h });
            break;
          case 'circle':
            shape.set({ left: Math.min(sx, px), top: Math.min(sy, py), radius: Math.max(w, h) / 2 });
            break;
          case 'triangle':
            shape.set({ left: Math.min(sx, px), top: Math.min(sy, py), width: w, height: h });
            break;
          case 'star': {
            const r = Math.max(w, h) / 2;
            const pts = createStarPoints(0, 0, 5, r, r * 0.45);
            (shape as fabric.Polygon).set({ points: pts, left: Math.min(sx, px), top: Math.min(sy, py) });
            // Fabric needs dirty flag for polygon recalc
            (shape as any).dirty = true;
            shape.setCoords();
            break;
          }
          case 'line':
            (shape as fabric.Line).set({ x2: px, y2: py });
            break;
        }
        fc.renderAll();
      };

      const handleMouseUp = () => {
        if (isPanningRef.current) {
          isPanningRef.current = false;
          lastPanPosRef.current = null;
          return;
        }
        if (!isDrawingShapeRef.current || !tempShapeRef.current) return;
        isDrawingShapeRef.current = false;
        const shape = tempShapeRef.current;
        shape.selectable = true;
        shape.evented = true;
        shape.setCoords();
        fc.setActiveObject(shape);
        fc.renderAll();
        tempShapeRef.current = null;
        drawStartRef.current = null;
        saveHistory();
        // Auto-switch back to select tool after drawing
        onToolReset?.();
      };

      // Pencil path created
      const handlePathCreated = () => {
        saveHistory();
        onToolReset?.();
      };

      fc.on('mouse:down', handleMouseDown);
      fc.on('mouse:move', handleMouseMove);
      fc.on('mouse:up', handleMouseUp);
      fc.on('path:created', handlePathCreated);

      fc.renderAll();

      return () => {
        fc.off('mouse:down', handleMouseDown);
        fc.off('mouse:move', handleMouseMove);
        fc.off('mouse:up', handleMouseUp);
        fc.off('path:created', handlePathCreated);
      };
    }, [activeTool, fillColor, strokeColor, saveHistory]);

    // ─── Star helper ───────────────────────────────────────────────
    function createStarPoints(
      cx: number,
      cy: number,
      numPoints: number,
      outerR: number,
      innerR: number,
    ): fabric.XY[] {
      const pts: fabric.XY[] = [];
      const step = Math.PI / numPoints;
      for (let i = 0; i < numPoints * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = i * step - Math.PI / 2;
        pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
      }
      return pts;
    }

    // ─── Imperative handle ─────────────────────────────────────────
    useImperativeHandle(
      ref,
      () => ({
        getCanvas: () => fcRef.current,
        undo,
        redo,
        canUndo: () => historyIndexRef.current > 0,
        canRedo: () => historyIndexRef.current < historyRef.current.length - 1,
        clear: () => {
          const fc = fcRef.current;
          if (!fc) return;
          fc.clear();
          fc.backgroundColor = '#ffffff';
          fc.renderAll();
          saveHistory();
          onSelectionChange(null);
        },
        toJSON: () => fcRef.current?.toJSON() || {},
        loadJSON: (json: object) => {
          const fc = fcRef.current;
          if (!fc) return;
          fc.loadFromJSON(json).then(() => {
            fc.renderAll();
            saveHistory();
          });
        },
        deleteSelected: () => {
          const fc = fcRef.current;
          if (!fc) return;
          const active = fc.getActiveObjects();
          active.forEach((o) => fc.remove(o));
          fc.discardActiveObject();
          fc.renderAll();
          saveHistory();
          onSelectionChange(null);
        },
        duplicateSelected: () => {
          const fc = fcRef.current;
          if (!fc) return;
          const active = fc.getActiveObject();
          if (!active) return;
          active.clone().then((cloned: fabric.FabricObject) => {
            cloned.set({ left: (cloned.left || 0) + 20, top: (cloned.top || 0) + 20 });
            fc.add(cloned);
            fc.setActiveObject(cloned);
            fc.renderAll();
            saveHistory();
          });
        },
        groupSelected: () => {
          const fc = fcRef.current;
          if (!fc) return;
          const active = fc.getActiveObject();
          if (!active) return;
          // Check if it's an ActiveSelection (multiple objects selected)
          const isMultiSelect = active instanceof fabric.ActiveSelection;
          if (!isMultiSelect) return;
          const objects = (active as fabric.ActiveSelection).getObjects().slice();
          if (objects.length < 2) return;
          fc.discardActiveObject();
          objects.forEach((o) => fc.remove(o));
          const group = new fabric.Group(objects);
          fc.add(group);
          fc.setActiveObject(group);
          fc.renderAll();
          saveHistory();
          onSelectionChange(group);
        },
        ungroupSelected: () => {
          const fc = fcRef.current;
          if (!fc) return;
          const active = fc.getActiveObject();
          if (!active || !(active instanceof fabric.Group) || active instanceof fabric.ActiveSelection) return;
          const group = active as fabric.Group;
          const matrix = group.calcTransformMatrix();
          const items = group.getObjects().slice();
          fc.remove(group);
          const addedItems: fabric.FabricObject[] = [];
          items.forEach((item) => {
            // Transform child's center point through the group's matrix
            const point = fabric.util.transformPoint(
              new fabric.Point(item.left || 0, item.top || 0),
              matrix,
            );
            item.set({
              left: point.x,
              top: point.y,
              scaleX: (item.scaleX || 1) * (group.scaleX || 1),
              scaleY: (item.scaleY || 1) * (group.scaleY || 1),
              angle: (item.angle || 0) + (group.angle || 0),
            });
            item.setCoords();
            fc.add(item);
            addedItems.push(item);
          });
          fc.discardActiveObject();
          if (addedItems.length > 1) {
            const sel = new fabric.ActiveSelection(addedItems, { canvas: fc });
            fc.setActiveObject(sel);
          } else if (addedItems.length === 1) {
            fc.setActiveObject(addedItems[0]);
          }
          fc.renderAll();
          saveHistory();
          onSelectionChange(fc.getActiveObject() || null);
        },
        setBackgroundColor: (color: string) => {
          const fc = fcRef.current;
          if (!fc) return;
          fc.backgroundColor = color;
          fc.renderAll();
          saveHistory();
        },
        toggleGrid: () => {
          showGridRef.current = !showGridRef.current;
          if (showGridRef.current) {
            drawGrid();
          } else {
            removeGrid();
          }
        },
        importFile: importFileToCanvas,
      }),
      [undo, redo, saveHistory, onSelectionChange, drawGrid, removeGrid],
    );

    // ─── Styles ────────────────────────────────────────────────────
    const styles = {
      container: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        backgroundColor: darkMode ? '#0f3460' : '#E8F0FE',
        position: 'relative' as const,
      },
      canvasWrapper: {
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        borderRadius: '8px',
        overflow: 'hidden',
      },
    };

    return (
      <div ref={containerRef} style={styles.container}>
        <div style={styles.canvasWrapper}>
          <canvas ref={canvasElRef} />
        </div>
      </div>
    );
  },
);

CanvasEditor.displayName = 'CanvasEditor';
export default CanvasEditor;
