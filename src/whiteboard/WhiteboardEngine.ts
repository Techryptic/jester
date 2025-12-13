import type {
  BoardState,
  Stroke,
  Point,
  Camera,
  GestureEvent,
  TemplateLayer,
  PenConfig,
} from '../types';
import { DEFAULT_BOARD_STATE, DEFAULT_PEN_CONFIG } from '../types';

export class WhiteboardEngine {
  private state: BoardState;
  private penConfig: PenConfig;
  private canvasWidth: number = 1280;
  private canvasHeight: number = 720;

  constructor() {
    this.state = this.createInitialState();
    this.penConfig = { ...DEFAULT_PEN_CONFIG };
  }

  private createInitialState(): BoardState {
    return {
      ...DEFAULT_BOARD_STATE,
      strokes: [],
      templates: this.createDefaultTemplates(),
      camera: { x: 0, y: 0, zoom: 1 },
      activeStrokeId: null,
    };
  }

  private createDefaultTemplates(): TemplateLayer[] {
    return [
      {
        id: 'blank',
        name: 'Blank',
        type: 'image',
        visible: true,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      },
      {
        id: 'grid',
        name: 'Grid',
        type: 'grid',
        visible: false,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        gridConfig: {
          spacing: 50,
          color: '#e0e0e0',
          lineWidth: 1,
        },
      },
      {
        id: 'dots',
        name: 'Dot Grid',
        type: 'dots',
        visible: false,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        gridConfig: {
          spacing: 30,
          color: '#cccccc',
          lineWidth: 3,
        },
      },
      {
        id: 'lines',
        name: 'Lined',
        type: 'lines',
        visible: false,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        gridConfig: {
          spacing: 40,
          color: '#d0d0ff',
          lineWidth: 1,
        },
      },
    ];
  }

  setCanvasSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  handleGestureEvent(event: GestureEvent): void {
    switch (event.type) {
      case 'DRAW_START':
        this.startStroke(this.normalizedToScreen(event.position));
        break;
      case 'DRAW_MOVE':
        this.continueStroke(this.normalizedToScreen(event.position));
        break;
      case 'DRAW_END':
        this.endStroke();
        break;
      case 'ERASE':
        this.eraseAtPoint(
          this.normalizedToScreen(event.position),
          event.radius
        );
        break;
      case 'PAN':
        this.pan(event.delta);
        break;
      case 'ZOOM':
        this.zoom(event.factor, this.normalizedToScreen(event.center));
        break;
      case 'IDLE':
        // Nothing to do
        break;
    }
  }

  // Convert normalized coordinates (0-1) to screen pixels
  private normalizedToScreen(point: Point): Point {
    return {
      x: point.x * this.canvasWidth,
      y: point.y * this.canvasHeight,
    };
  }

  // Convert screen coordinates to world coordinates
  screenToWorld(screenPoint: Point): Point {
    const { x: camX, y: camY, zoom } = this.state.camera;
    return {
      x: (screenPoint.x - this.canvasWidth / 2) / zoom + camX,
      y: (screenPoint.y - this.canvasHeight / 2) / zoom + camY,
    };
  }

  // Convert world coordinates to screen coordinates
  worldToScreen(worldPoint: Point): Point {
    const { x: camX, y: camY, zoom } = this.state.camera;
    return {
      x: (worldPoint.x - camX) * zoom + this.canvasWidth / 2,
      y: (worldPoint.y - camY) * zoom + this.canvasHeight / 2,
    };
  }

  // Start a new stroke
  startStroke(screenPoint: Point): void {
    const worldPoint = this.screenToWorld(screenPoint);
    const id = this.generateId();

    const stroke: Stroke = {
      id,
      points: [worldPoint],
      color: this.penConfig.color,
      thickness: this.penConfig.thickness,
      timestamp: Date.now(),
    };

    this.state.strokes.push(stroke);
    this.state.activeStrokeId = id;
  }

  // Continue the active stroke
  continueStroke(screenPoint: Point): void {
    if (!this.state.activeStrokeId) return;

    const stroke = this.state.strokes.find(
      (s) => s.id === this.state.activeStrokeId
    );
    if (!stroke) return;

    const worldPoint = this.screenToWorld(screenPoint);

    // Only add point if it's far enough from the last point (avoid duplicates)
    const lastPoint = stroke.points[stroke.points.length - 1];
    const distance = Math.sqrt(
      Math.pow(worldPoint.x - lastPoint.x, 2) +
        Math.pow(worldPoint.y - lastPoint.y, 2)
    );

    if (distance > 1) {
      stroke.points.push(worldPoint);
    }
  }

  // End the active stroke
  endStroke(): void {
    if (!this.state.activeStrokeId) return;

    const stroke = this.state.strokes.find(
      (s) => s.id === this.state.activeStrokeId
    );

    // Remove stroke if it has less than 2 points
    if (stroke && stroke.points.length < 2) {
      this.state.strokes = this.state.strokes.filter(
        (s) => s.id !== this.state.activeStrokeId
      );
    }

    this.state.activeStrokeId = null;
  }

  // Erase strokes at a given screen position
  eraseAtPoint(screenPoint: Point, radiusScreen: number): void {
    const worldPoint = this.screenToWorld(screenPoint);
    // Convert radius to world space
    const radiusWorld = radiusScreen / this.state.camera.zoom;

    this.state.strokes = this.state.strokes.filter((stroke) => {
      // Check if any point of the stroke is within the erase radius
      for (const point of stroke.points) {
        const distance = Math.sqrt(
          Math.pow(point.x - worldPoint.x, 2) +
            Math.pow(point.y - worldPoint.y, 2)
        );
        if (distance < radiusWorld) {
          return false; // Remove this stroke
        }
      }
      return true; // Keep this stroke
    });
  }

  // Pan the camera
  pan(deltaNormalized: Point): void {
    // Convert normalized delta to world space movement
    const deltaWorld = {
      x: -deltaNormalized.x * this.canvasWidth / this.state.camera.zoom,
      y: -deltaNormalized.y * this.canvasHeight / this.state.camera.zoom,
    };

    this.state.camera.x += deltaWorld.x;
    this.state.camera.y += deltaWorld.y;
  }

  // Zoom around a screen point
  zoom(factor: number, screenCenter: Point): void {
    // Get world point before zoom
    const worldCenter = this.screenToWorld(screenCenter);

    // Apply zoom with limits
    const newZoom = this.state.camera.zoom * factor;
    this.state.camera.zoom = Math.max(0.1, Math.min(10, newZoom));

    // Adjust camera position to keep worldCenter at screenCenter
    const newWorldCenter = this.screenToWorld(screenCenter);
    this.state.camera.x += worldCenter.x - newWorldCenter.x;
    this.state.camera.y += worldCenter.y - newWorldCenter.y;
  }

  // Reset the camera to default view
  resetCamera(): void {
    this.state.camera = { x: 0, y: 0, zoom: 1 };
  }

  // Clear all strokes
  clearStrokes(): void {
    this.state.strokes = [];
    this.state.activeStrokeId = null;
  }

  // Template management
  setTemplateVisible(templateId: string, visible: boolean): void {
    const template = this.state.templates.find((t) => t.id === templateId);
    if (template) {
      // Set all templates to not visible first (single selection for now)
      this.state.templates.forEach((t) => (t.visible = false));
      template.visible = visible;
    }
  }

  getActiveTemplate(): TemplateLayer | undefined {
    return this.state.templates.find((t) => t.visible);
  }

  // Pen configuration
  setPenColor(color: string): void {
    this.penConfig.color = color;
  }

  setPenThickness(thickness: number): void {
    this.penConfig.thickness = Math.max(1, Math.min(50, thickness));
  }

  getPenConfig(): PenConfig {
    return { ...this.penConfig };
  }

  // State access
  getState(): BoardState {
    return this.state;
  }

  getCamera(): Camera {
    return { ...this.state.camera };
  }

  getStrokes(): Stroke[] {
    return this.state.strokes;
  }

  getTemplates(): TemplateLayer[] {
    return this.state.templates;
  }

  // Utility
  private generateId(): string {
    return `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
