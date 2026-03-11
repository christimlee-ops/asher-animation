import {
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import * as fabric from 'fabric';
import { ensureAnimId } from '../../lib/animationState';
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
  loadJSON: (json: object) => Promise<void> | void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  setBackgroundColor: (color: string) => void;
  toggleGrid: () => void;
  importFile: (file: File) => void;
  flipHorizontalSelected: () => void;
  flipVerticalSelected: () => void;
  copySelected: () => void;
  pasteClipboard: () => void;
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
const CANVAS_PAD = 40; // small padding so objects aren't clipped at edges
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
    const clipboardRef = useRef<fabric.FabricObject | null>(null);

    // Custom properties to always include in serialization
    const CUSTOM_PROPS = ['_animId', 'customName', '_locked'];

    // ─── History helpers ───────────────────────────────────────────
    const saveHistory = useCallback(() => {
      const fc = fcRef.current;
      if (!fc) return;
      const json = JSON.stringify(fc.toObject(CUSTOM_PROPS));
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
      // Fill the entire container
      fc.setDimensions({ width: cw, height: ch });
      // Scale the logical canvas to fit with small padding
      const scaleX = (cw - CANVAS_PAD * 2) / CANVAS_W;
      const scaleY = (ch - CANVAS_PAD * 2) / CANVAS_H;
      const scale = Math.min(scaleX, scaleY, 1);
      // Center the canvas in the container
      const offsetX = (cw - CANVAS_W * scale) / 2;
      const offsetY = (ch - CANVAS_H * scale) / 2;
      fc.setViewportTransform([scale, 0, 0, scale, offsetX, offsetY]);
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

      // ─── Custom pivot point control ─────────────────────────────
      // Visual-only: shows where the pivot is. Change pivot via Properties panel.
      const pivotControl = new fabric.Control({
        x: 0,
        y: 0,
        cursorStyle: 'pointer',
        sizeX: 16,
        sizeY: 16,
        // Position the control at the object's current origin point
        positionHandler: function (dim, finalMatrix, fabricObject) {
          const ox = fabricObject.originX;
          const oy = fabricObject.originY;
          // Convert origin to -0.5..0.5 range (center-relative)
          let px: number, py: number;
          if (typeof ox === 'number') { px = ox - 0.5; } else { px = ox === 'left' ? -0.5 : ox === 'right' ? 0.5 : 0; }
          if (typeof oy === 'number') { py = oy - 0.5; } else { py = oy === 'top' ? -0.5 : oy === 'bottom' ? 0.5 : 0; }
          return new fabric.Point(
            px * dim.x + (this.offsetX ?? 0),
            py * dim.y + (this.offsetY ?? 0),
          ).transform(finalMatrix);
        },
        // Click to cycle: center → top-left → top → top-right → right → bottom-right → bottom → bottom-left → left → center
        actionHandler: function (_eventData, transformData) {
          const obj = transformData.target;
          const origins: Array<[string, string]> = [
            ['center', 'center'],
            ['left', 'top'],
            ['center', 'top'],
            ['right', 'top'],
            ['right', 'center'],
            ['right', 'bottom'],
            ['center', 'bottom'],
            ['left', 'bottom'],
            ['left', 'center'],
          ];

          const curOx = String(obj.originX);
          const curOy = String(obj.originY);
          let curIdx = origins.findIndex(([ox, oy]) => ox === curOx && oy === curOy);
          if (curIdx === -1) curIdx = 0;
          const nextIdx = (curIdx + 1) % origins.length;
          const [newOx, newOy] = origins[nextIdx];

          // Use fabric's translateToGivenOrigin to convert left/top
          // from the current origin to the new origin — works in local
          // coordinate space so it's correct for group children too
          const pos = new fabric.Point(obj.left || 0, obj.top || 0);
          const newPos = obj.translateToGivenOrigin(pos, curOx as any, curOy as any, newOx as any, newOy as any);

          obj.originX = newOx as any;
          obj.originY = newOy as any;
          obj.left = newPos.x;
          obj.top = newPos.y;
          obj.setCoords();

          // Re-render — handle both grouped and ungrouped objects
          if (obj.group) {
            obj.group.dirty = true;
            obj.group.setCoords();
            obj.group.canvas?.renderAll();
          } else {
            obj.canvas?.renderAll();
          }
          return true;
        },
        render: function (ctx, left, top) {
          const size = 14;
          ctx.save();
          ctx.translate(left, top);
          // Outer circle
          ctx.beginPath();
          ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 107, 107, 0.3)';
          ctx.fill();
          ctx.strokeStyle = '#FF6B6B';
          ctx.lineWidth = 2;
          ctx.stroke();
          // Crosshair lines
          ctx.beginPath();
          ctx.moveTo(-size / 2, 0);
          ctx.lineTo(size / 2, 0);
          ctx.moveTo(0, -size / 2);
          ctx.lineTo(0, size / 2);
          ctx.strokeStyle = '#FF6B6B';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          // Center dot
          ctx.beginPath();
          ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = '#FF6B6B';
          ctx.fill();
          ctx.restore();
        },
        actionName: 'pivotPoint',
      });

      // Custom rotation cursor (SVG rotate icon as data URL)
      const rotateCursorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%234ECDC4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M21 8A9 9 0 0 0 5.64 5.64"/><path d="M3 22v-6h6"/><path d="M3 16a9 9 0 0 0 15.36 2.36"/></svg>`;
      const rotateCursor = `url('data:image/svg+xml,${rotateCursorSvg}') 12 12, crosshair`;

      // Custom rotation control that renders a rotate icon
      const rotateControl = new fabric.Control({
        x: 0,
        y: -0.5,
        offsetY: -30,
        cursorStyle: rotateCursor,
        actionName: 'rotate',
        actionHandler: fabric.controlsUtils.rotationWithSnapping,
        render: function (ctx, left, top) {
          const size = 20;
          ctx.save();
          ctx.translate(left, top);
          // Background circle
          ctx.beginPath();
          ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
          ctx.fillStyle = '#4ECDC4';
          ctx.fill();
          ctx.strokeStyle = '#2D3436';
          ctx.lineWidth = 1;
          ctx.stroke();
          // Rotate arrow icon
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          // Arc arrow
          ctx.beginPath();
          ctx.arc(0, 0, 5, -Math.PI * 0.8, Math.PI * 0.5);
          ctx.stroke();
          // Arrowhead
          const tipX = 5 * Math.cos(Math.PI * 0.5);
          const tipY = 5 * Math.sin(Math.PI * 0.5);
          ctx.beginPath();
          ctx.moveTo(tipX - 3, tipY - 2);
          ctx.lineTo(tipX, tipY);
          ctx.lineTo(tipX + 3, tipY - 1);
          ctx.stroke();
          ctx.restore();
        },
        sizeX: 20,
        sizeY: 20,
      });

      // Style selection handles and add pivot + rotation controls on each object
      const styleHandles = (obj: fabric.FabricObject) => {
        obj.set({
          transparentCorners: false,
          cornerColor: '#4ECDC4',
          cornerStrokeColor: '#2D3436',
          cornerSize: 10,
          cornerStyle: 'circle',
          centeredRotation: false, // rotate around origin (pivot), not center
          objectCaching: false, // prevent clipping of strokes/rotation
        });
        // Set diagonal resize cursors on corner controls
        if (obj.controls.tl) obj.controls.tl.cursorStyle = 'nwse-resize';
        if (obj.controls.tr) obj.controls.tr.cursorStyle = 'nesw-resize';
        if (obj.controls.bl) obj.controls.bl.cursorStyle = 'nesw-resize';
        if (obj.controls.br) obj.controls.br.cursorStyle = 'nwse-resize';
        // Add the pivot control and override rotation control
        obj.controls.pivot = pivotControl;
        obj.controls.mtr = rotateControl;
        // Recursively style children inside groups
        if (obj instanceof fabric.Group && !(obj instanceof fabric.ActiveSelection)) {
          obj.getObjects().forEach((child) => styleHandles(child));
        }
      };
      fc.on('object:added', (e) => { if (e.target) styleHandles(e.target); });

      // Override rotation transform origin to use object's pivot (originX/originY)
      fc.on('before:transform', (opt: any) => {
        const t = opt.transform;
        if (t && t.action === 'rotate') {
          // Force transform to use the object's actual origin as the rotation anchor
          t.originX = t.target.originX;
          t.originY = t.target.originY;
        }
      });

      // Draw dotted border on every render using after:render event
      // This ensures the border is always visible regardless of JSON load/undo/redo
      fc.on('after:render', () => {
        const ctx = fc.getContext();
        const vpt = fc.viewportTransform || [1, 0, 0, 1, 0, 0];
        ctx.save();
        ctx.setTransform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);

        // Dotted border
        ctx.strokeStyle = '#FF6B6B';
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 8]);
        ctx.strokeRect(-4, -4, CANVAS_W + 8, CANVAS_H + 8);

        // Label above the border
        ctx.setLineDash([]);
        ctx.fillStyle = '#FF6B6B';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${CANVAS_W} × ${CANVAS_H} — video export area`, CANVAS_W / 2, -8);

        ctx.restore();
      });

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
            ((containerRef.current?.clientWidth || 800) - CANVAS_PAD * 2) / CANVAS_W,
            ((containerRef.current?.clientHeight || 600) - CANVAS_PAD * 2) / CANVAS_H,
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
        // Copy
        if (e.ctrlKey && e.key === 'c') {
          const active = fc.getActiveObject();
          if (active) {
            e.preventDefault();
            active.clone().then((cloned: fabric.FabricObject) => {
              clipboardRef.current = cloned;
            });
          }
        }
        // Paste
        if (e.ctrlKey && e.key === 'v') {
          if (clipboardRef.current) {
            e.preventDefault();
            clipboardRef.current.clone().then((cloned: fabric.FabricObject) => {
              cloned.set({
                left: (cloned.left || 0) + 20,
                top: (cloned.top || 0) + 20,
              });
              // Ungroup ActiveSelection items when pasting multi-select
              if (cloned instanceof fabric.ActiveSelection) {
                cloned.forEachObject((obj: fabric.FabricObject) => {
                  fc.add(obj);
                });
                fc.setActiveObject(cloned);
              } else {
                fc.add(cloned);
                fc.setActiveObject(cloned);
              }
              // Update clipboard position so successive pastes cascade
              clipboardRef.current!.set({
                left: (clipboardRef.current!.left || 0) + 20,
                top: (clipboardRef.current!.top || 0) + 20,
              });
              fc.renderAll();
              saveHistory();
            });
          }
        }
        // Duplicate shortcut (Ctrl+D)
        if (e.ctrlKey && e.key === 'd') {
          e.preventDefault();
          const active = fc.getActiveObject();
          if (active) {
            active.clone().then((cloned: fabric.FabricObject) => {
              cloned.set({ left: (cloned.left || 0) + 20, top: (cloned.top || 0) + 20 });
              if (cloned instanceof fabric.ActiveSelection) {
                cloned.forEachObject((obj: fabric.FabricObject) => {
                  fc.add(obj);
                });
                fc.setActiveObject(cloned);
              } else {
                fc.add(cloned);
                fc.setActiveObject(cloned);
              }
              fc.renderAll();
              saveHistory();
            });
          }
        }
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
      let exitInteractiveTimer: ReturnType<typeof setTimeout> | null = null;
      fc.on('selection:cleared', () => {
        // Delay exiting interactive mode so touch users can tap children after double-tap
        if (exitInteractiveTimer) clearTimeout(exitInteractiveTimer);
        exitInteractiveTimer = setTimeout(() => {
          fc.getObjects().forEach((obj) => {
            if (obj instanceof fabric.Group && !(obj instanceof fabric.ActiveSelection) && obj.interactive) {
              obj.interactive = false;
            }
          });
          fc.renderAll();
        }, 300);
        onSelectionChange(null);
      });
      fc.on('selection:created', () => {
        // Cancel the delayed exit if user selected something
        if (exitInteractiveTimer) { clearTimeout(exitInteractiveTimer); exitInteractiveTimer = null; }
      });
      fc.on('selection:updated', () => {
        if (exitInteractiveTimer) { clearTimeout(exitInteractiveTimer); exitInteractiveTimer = null; }
      });

      // Save history on object modified
      fc.on('object:modified', () => saveHistory());

      // Double-click/double-tap a group to enter interactive mode (edit children individually)
      const enterGroupInteractive = (target: fabric.FabricObject | null | undefined) => {
        if (target && target instanceof fabric.Group && !(target instanceof fabric.ActiveSelection)) {
          target.interactive = true;
          target.subTargetCheck = true;
          fc.renderAll();
        }
      };
      fc.on('mouse:dblclick', (opt) => enterGroupInteractive(opt.target));

      // Double-tap support for touch/tablet devices
      let lastTapTime = 0;
      let lastTapTarget: fabric.FabricObject | null = null;
      fc.on('mouse:down', (opt) => {
        if (!(opt.e as any)?.touches && opt.e?.type !== 'touchstart') return; // only touch
        const now = Date.now();
        const target = opt.target || null;
        if (now - lastTapTime < 400 && target === lastTapTarget) {
          enterGroupInteractive(target);
          lastTapTime = 0;
          lastTapTarget = null;
        } else {
          lastTapTime = now;
          lastTapTarget = target;
        }
      });

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

    // ─── Convert file to persistent data URL ───────────────────────
    const fileToDataURL = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

    // ─── Import file helper ────────────────────────────────────────
    const importFileToCanvas = async (file: File) => {
      const fc = fcRef.current;
      if (!fc) return;
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isSvg = file.type === 'image/svg+xml' || ext === 'svg';
      const isImage = file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext);

      // Use data URL instead of blob URL so images survive JSON serialization
      const dataUrl = await fileToDataURL(file);

      if (isSvg) {
        fabric.loadSVGFromURL(dataUrl).then((result) => {
          const objs = result.objects.filter(Boolean) as fabric.FabricObject[];
          if (objs.length === 0) return;
          const group = objs.length === 1 ? objs[0] : fabric.util.groupSVGElements(objs);
          group.scaleToWidth(Math.min(400, CANVAS_W / 2));
          group.set({ left: CANVAS_W / 2, top: CANVAS_H / 2, originX: 'center', originY: 'center' });
          fc.add(group);
          fc.setActiveObject(group);
          fc.renderAll();
          saveHistory();
        }).catch(() => {});
      } else if (isImage) {
        fabric.FabricImage.fromURL(dataUrl).then((img) => {
          img.scaleToWidth(Math.min(400, CANVAS_W / 2));
          img.set({ left: CANVAS_W / 2, top: CANVAS_H / 2, originX: 'center', originY: 'center' });
          fc.add(img);
          fc.setActiveObject(img);
          fc.renderAll();
          saveHistory();
        }).catch(() => {});
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

      // Set all objects selectable only in select mode (respect locked objects)
      fc.getObjects().forEach((o) => {
        if (!(o as any).excludeFromExport) {
          const locked = (o as any)._locked;
          o.selectable = activeTool === 'select' && !locked;
          o.evented = activeTool === 'select' && !locked;
        }
      });

      if (activeTool === 'pencil') {
        fc.isDrawingMode = true;
        fc.freeDrawingBrush = new fabric.PencilBrush(fc);
        fc.freeDrawingBrush.color = fillColor;
        fc.freeDrawingBrush.width = 3;
      }

      if (activeTool === 'brush') {
        fc.isDrawingMode = true;
        const brush = new fabric.PencilBrush(fc);
        brush.color = fillColor;
        brush.width = 12;
        brush.strokeLineCap = 'round';
        brush.strokeLineJoin = 'round';
        fc.freeDrawingBrush = brush;
      }

      // Disable default context menu on canvas so right-click drag works
      const canvasEl = fc.getSelectionElement();
      const preventContext = (e: Event) => e.preventDefault();
      canvasEl.addEventListener('contextmenu', preventContext);

      // Shape drawing handlers
      const handleMouseDown = (opt: fabric.TPointerEventInfo) => {
        const me = opt.e as MouseEvent;
        // Right-click or Alt+click = pan (works in any tool)
        if (me.button === 2 || me.altKey) {
          isPanningRef.current = true;
          lastPanPosRef.current = { x: me.clientX, y: me.clientY };
          return;
        }
        if (activeTool === 'select' || activeTool === 'pencil' || activeTool === 'brush') {
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
          stroke: 'transparent',
          strokeWidth: 0,
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
            const pts = createStarPoints(0, 0, 5, 50, 22.5);
            shape = new fabric.Polygon(pts, { ...common, scaleX: 0.02, scaleY: 0.02 });
            break;
          }
          case 'line':
            shape = new fabric.Line(
              [drawStartRef.current.x, drawStartRef.current.y, drawStartRef.current.x, drawStartRef.current.y],
              { ...common, fill: undefined, stroke: strokeColor, strokeWidth: 3 },
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
            const scale = Math.max(r / 50, 0.02);
            shape.set({ left: Math.min(sx, px), top: Math.min(sy, py), scaleX: scale, scaleY: scale });
            shape.setCoords();
            break;
          }
          case 'line':
            (shape as fabric.Line).set({ x2: px, y2: py });
            break;
          case 'text': {
            // Scale font size based on drag height, reposition to top-left
            const fontSize = Math.max(12, h);
            shape.set({ left: Math.min(sx, px), top: Math.min(sy, py), fontSize });
            break;
          }
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
        canvasEl.removeEventListener('contextmenu', preventContext);
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
          // Border is drawn via after:render event, no objects needed
          fc.renderAll();
          saveHistory();
          onSelectionChange(null);
        },
        toJSON: () => fcRef.current?.toObject(CUSTOM_PROPS) || {},
        loadJSON: (json: object) => {
          const fc = fcRef.current;
          if (!fc) return Promise.resolve();
          return fc.loadFromJSON(json).then(() => {
            // Restore locked state on loaded objects
            fc.getObjects().forEach((obj) => {
              if ((obj as any)._locked) {
                obj.selectable = false;
                obj.evented = false;
              }
            });
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
          const group = new fabric.Group(objects, {
            subTargetCheck: true,
            interactive: false,
          });
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
          // Capture transform data BEFORE any mutations
          const groupMatrix = group.calcTransformMatrix();
          const items = group.getObjects().slice();
          if (items.length === 0) return;
          // Collect item data while group is still intact
          const itemData = items.map((item) => ({
            item,
            point: fabric.util.transformPoint(
              new fabric.Point(item.left || 0, item.top || 0),
              groupMatrix,
            ),
            scaleX: (item.scaleX || 1) * (group.scaleX || 1),
            scaleY: (item.scaleY || 1) * (group.scaleY || 1),
            angle: (item.angle || 0) + (group.angle || 0),
          }));
          // Clone all items, then remove group and add clones
          // Preserve _animId so animation timelines stay linked
          Promise.all(
            itemData.map((d) =>
              d.item.clone().then((cloned: fabric.FabricObject) => {
                cloned.set({
                  left: d.point.x,
                  top: d.point.y,
                  scaleX: d.scaleX,
                  scaleY: d.scaleY,
                  angle: d.angle,
                });
                // Preserve animation ID and custom name
                if ((d.item as any)._animId) {
                  (cloned as any)._animId = (d.item as any)._animId;
                }
                if ((d.item as any).customName) {
                  (cloned as any).customName = (d.item as any).customName;
                }
                cloned.setCoords();
                return cloned;
              }),
            ),
          ).then((clonedItems) => {
            fc.discardActiveObject();
            fc.remove(group);
            clonedItems.forEach((c) => fc.add(c));
            if (clonedItems.length > 1) {
              const sel = new fabric.ActiveSelection(clonedItems, { canvas: fc });
              fc.setActiveObject(sel);
            } else if (clonedItems.length === 1) {
              fc.setActiveObject(clonedItems[0]);
            }
            fc.renderAll();
            saveHistory();
            onSelectionChange(fc.getActiveObject() || null);
          });
        },
        flipHorizontalSelected: () => {
          const fc = fcRef.current;
          if (!fc) return;
          const active = fc.getActiveObjects();
          if (!active.length) return;
          active.forEach((obj) => {
            obj.set({ flipX: !obj.flipX });
            obj.setCoords();
          });
          fc.renderAll();
          saveHistory();
        },
        flipVerticalSelected: () => {
          const fc = fcRef.current;
          if (!fc) return;
          const active = fc.getActiveObjects();
          if (!active.length) return;
          active.forEach((obj) => {
            obj.set({ flipY: !obj.flipY });
            obj.setCoords();
          });
          fc.renderAll();
          saveHistory();
        },
        copySelected: () => {
          const fc = fcRef.current;
          if (!fc) return;
          const active = fc.getActiveObject();
          if (!active) return;
          active.clone().then((cloned: fabric.FabricObject) => {
            clipboardRef.current = cloned;
          });
        },
        pasteClipboard: () => {
          const fc = fcRef.current;
          if (!fc || !clipboardRef.current) return;
          clipboardRef.current.clone().then((cloned: fabric.FabricObject) => {
            // Assign fresh anim IDs so the pasted object is immediately selectable in the timeline
            const assignAnimIds = (obj: fabric.FabricObject) => {
              (obj as any)._animId = undefined; // clear copied ID to get a fresh one
              ensureAnimId(obj);
              if (obj instanceof fabric.Group && !(obj instanceof fabric.ActiveSelection)) {
                obj.getObjects().forEach(assignAnimIds);
              }
            };
            assignAnimIds(cloned);
            cloned.set({
              left: (cloned.left || 0) + 20,
              top: (cloned.top || 0) + 20,
            });
            if (cloned instanceof fabric.ActiveSelection) {
              cloned.forEachObject((obj: fabric.FabricObject) => {
                fc.add(obj);
              });
              fc.setActiveObject(cloned);
            } else {
              fc.add(cloned);
              fc.setActiveObject(cloned);
            }
            clipboardRef.current!.set({
              left: (clipboardRef.current!.left || 0) + 20,
              top: (clipboardRef.current!.top || 0) + 20,
            });
            fc.renderAll();
            saveHistory();
          });
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
    return (
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          backgroundColor: darkMode ? '#0f3460' : '#E8F0FE',
          position: 'relative' as const,
          touchAction: 'none',
        }}
      >
        <canvas ref={canvasElRef} />
      </div>
    );
  },
);

CanvasEditor.displayName = 'CanvasEditor';
export default CanvasEditor;
