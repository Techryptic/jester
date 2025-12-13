import type {
  BoardState,
  Hand,
  GestureState,
  AppConfig,
  Stroke,
  Camera,
  TemplateLayer,
  Point,
} from '../types';
import { LANDMARK } from '../types';

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private videoElement: HTMLVideoElement;
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private fps: number = 0;
  private fpsUpdateInterval: number = 500; // Update FPS every 500ms
  private lastFpsUpdate: number = 0;

  constructor(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
    this.canvas = canvas;
    this.videoElement = video;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get canvas 2D context');
    }
    this.ctx = ctx;
  }

  render(
    boardState: BoardState,
    hands: Hand[],
    gestureState: GestureState,
    config: AppConfig
  ): void {
    // Update FPS
    this.updateFPS();

    const { ctx, canvas } = this;
    const { camera } = boardState;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw mirrored video as background
    this.drawVideo();

    // Draw whiteboard content (templates + strokes) with camera transform
    this.drawWhiteboardContent(boardState, camera);

    // Draw debug overlays (on top, in screen space)
    if (config.debug.showLandmarks || config.debug.showGestureState || config.debug.showFPS) {
      this.drawDebugOverlay(hands, gestureState, camera, config);
    }

    // Draw erase cursor if erasing
    if (gestureState.currentGesture === 'ERASING' && gestureState.lastLeftPalmPos) {
      this.drawEraseCursor(gestureState.lastLeftPalmPos, config.gesture.eraseRadius);
    }

    // Draw draw cursor if drawing
    if (gestureState.currentGesture === 'DRAWING' && gestureState.lastRightPinchPos) {
      this.drawDrawCursor(gestureState.lastRightPinchPos, config.pen.thickness, config.pen.color);
    }
  }

  private drawVideo(): void {
    const { ctx, canvas, videoElement } = this;

    if (videoElement.readyState < 2) return;

    ctx.save();
    // Mirror the video horizontally
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    // Draw video scaled to fit canvas
    ctx.globalAlpha = 0.3; // Semi-transparent background
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawWhiteboardContent(boardState: BoardState, camera: Camera): void {
    const { ctx, canvas } = this;

    ctx.save();

    // Apply camera transform
    // Translate to center, scale, then translate back with camera offset
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // Draw templates
    this.drawTemplates(boardState.templates);

    // Draw strokes
    this.drawStrokes(boardState.strokes);

    ctx.restore();
  }

  private drawTemplates(templates: TemplateLayer[]): void {
    const { ctx, canvas } = this;
    const camera = { x: 0, y: 0, zoom: 1 }; // Templates are drawn in world space

    for (const template of templates) {
      if (!template.visible) continue;

      switch (template.type) {
        case 'grid':
          this.drawGrid(template);
          break;
        case 'dots':
          this.drawDots(template);
          break;
        case 'lines':
          this.drawLines(template);
          break;
        case 'image':
          // Blank template - just draw a white background in world space
          if (template.id === 'blank') {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillRect(-canvas.width * 5, -canvas.height * 5, canvas.width * 10, canvas.height * 10);
          }
          break;
      }
    }
  }

  private drawGrid(template: TemplateLayer): void {
    const { ctx, canvas } = this;
    if (!template.gridConfig) return;

    const { spacing, color, lineWidth } = template.gridConfig;
    const extent = Math.max(canvas.width, canvas.height) * 10;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();

    // Vertical lines
    for (let x = -extent; x <= extent; x += spacing) {
      ctx.moveTo(x, -extent);
      ctx.lineTo(x, extent);
    }

    // Horizontal lines
    for (let y = -extent; y <= extent; y += spacing) {
      ctx.moveTo(-extent, y);
      ctx.lineTo(extent, y);
    }

    ctx.stroke();
  }

  private drawDots(template: TemplateLayer): void {
    const { ctx, canvas } = this;
    if (!template.gridConfig) return;

    const { spacing, color, lineWidth } = template.gridConfig;
    const extent = Math.max(canvas.width, canvas.height) * 10;
    const dotRadius = lineWidth;

    ctx.fillStyle = color;

    for (let x = -extent; x <= extent; x += spacing) {
      for (let y = -extent; y <= extent; y += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawLines(template: TemplateLayer): void {
    const { ctx, canvas } = this;
    if (!template.gridConfig) return;

    const { spacing, color, lineWidth } = template.gridConfig;
    const extent = Math.max(canvas.width, canvas.height) * 10;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();

    // Horizontal lines only
    for (let y = -extent; y <= extent; y += spacing) {
      ctx.moveTo(-extent, y);
      ctx.lineTo(extent, y);
    }

    ctx.stroke();
  }

  private drawStrokes(strokes: Stroke[]): void {
    const { ctx } = this;

    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;

      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.thickness;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

      // Use quadratic curves for smoother lines
      for (let i = 1; i < stroke.points.length; i++) {
        const current = stroke.points[i];
        const previous = stroke.points[i - 1];

        // Midpoint for smooth curve
        const midX = (previous.x + current.x) / 2;
        const midY = (previous.y + current.y) / 2;

        ctx.quadraticCurveTo(previous.x, previous.y, midX, midY);
      }

      // Draw to the last point
      const lastPoint = stroke.points[stroke.points.length - 1];
      ctx.lineTo(lastPoint.x, lastPoint.y);

      ctx.stroke();
    }
  }

  private drawEraseCursor(position: Point, radius: number): void {
    const { ctx, canvas } = this;

    // Convert normalized position to screen coordinates
    const screenX = position.x * canvas.width;
    const screenY = position.y * canvas.height;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawDrawCursor(position: Point, thickness: number, color: string): void {
    const { ctx, canvas } = this;

    // Convert normalized position to screen coordinates
    const screenX = position.x * canvas.width;
    const screenY = position.y * canvas.height;

    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(screenX, screenY, thickness / 2, 0, Math.PI * 2);
    ctx.fill();

    // Outer ring
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  private drawDebugOverlay(
    hands: Hand[],
    gestureState: GestureState,
    camera: Camera,
    config: AppConfig
  ): void {
    const { ctx, canvas } = this;

    // Draw hand landmarks
    if (config.debug.showLandmarks) {
      for (const hand of hands) {
        this.drawHandLandmarks(hand);
      }
    }

    // Draw debug text panel
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, 220, 130);

    ctx.fillStyle = 'white';
    ctx.font = '14px monospace';
    let y = 30;

    if (config.debug.showFPS) {
      ctx.fillText(`FPS: ${this.fps}`, 20, y);
      y += 20;
    }

    if (config.debug.showGestureState) {
      ctx.fillText(`Gesture: ${gestureState.currentGesture}`, 20, y);
      y += 20;
      ctx.fillText(`R-Pinch: ${gestureState.rightPinching}`, 20, y);
      y += 20;
      ctx.fillText(`L-Palm: ${gestureState.leftPalmOpen}`, 20, y);
      y += 20;
    }

    if (config.debug.showCamera) {
      ctx.fillText(`Camera: (${camera.x.toFixed(0)}, ${camera.y.toFixed(0)})`, 20, y);
      y += 20;
      ctx.fillText(`Zoom: ${camera.zoom.toFixed(2)}x`, 20, y);
    }

    ctx.restore();
  }

  private drawHandLandmarks(hand: Hand): void {
    const { ctx, canvas } = this;
    const landmarks = hand.landmarks;

    // Colors for different hands
    const color = hand.handedness === 'Right' ? '#00ff00' : '#ff6600';

    ctx.save();

    // Draw connections
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;

    const connections = [
      // Thumb
      [LANDMARK.WRIST, LANDMARK.THUMB_CMC],
      [LANDMARK.THUMB_CMC, LANDMARK.THUMB_MCP],
      [LANDMARK.THUMB_MCP, LANDMARK.THUMB_IP],
      [LANDMARK.THUMB_IP, LANDMARK.THUMB_TIP],
      // Index
      [LANDMARK.WRIST, LANDMARK.INDEX_MCP],
      [LANDMARK.INDEX_MCP, LANDMARK.INDEX_PIP],
      [LANDMARK.INDEX_PIP, LANDMARK.INDEX_DIP],
      [LANDMARK.INDEX_DIP, LANDMARK.INDEX_TIP],
      // Middle
      [LANDMARK.WRIST, LANDMARK.MIDDLE_MCP],
      [LANDMARK.MIDDLE_MCP, LANDMARK.MIDDLE_PIP],
      [LANDMARK.MIDDLE_PIP, LANDMARK.MIDDLE_DIP],
      [LANDMARK.MIDDLE_DIP, LANDMARK.MIDDLE_TIP],
      // Ring
      [LANDMARK.WRIST, LANDMARK.RING_MCP],
      [LANDMARK.RING_MCP, LANDMARK.RING_PIP],
      [LANDMARK.RING_PIP, LANDMARK.RING_DIP],
      [LANDMARK.RING_DIP, LANDMARK.RING_TIP],
      // Pinky
      [LANDMARK.WRIST, LANDMARK.PINKY_MCP],
      [LANDMARK.PINKY_MCP, LANDMARK.PINKY_PIP],
      [LANDMARK.PINKY_PIP, LANDMARK.PINKY_DIP],
      [LANDMARK.PINKY_DIP, LANDMARK.PINKY_TIP],
      // Palm
      [LANDMARK.INDEX_MCP, LANDMARK.MIDDLE_MCP],
      [LANDMARK.MIDDLE_MCP, LANDMARK.RING_MCP],
      [LANDMARK.RING_MCP, LANDMARK.PINKY_MCP],
    ];

    for (const [start, end] of connections) {
      const p1 = landmarks[start];
      const p2 = landmarks[end];
      ctx.beginPath();
      ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
      ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
      ctx.stroke();
    }

    // Draw landmarks as circles
    ctx.globalAlpha = 1;
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      const x = lm.x * canvas.width;
      const y = lm.y * canvas.height;

      // Different size for fingertips
      const isFingertip = [4, 8, 12, 16, 20].includes(i);
      const radius = isFingertip ? 8 : 5;

      ctx.fillStyle = isFingertip ? '#ffffff' : color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw hand label
    const wrist = landmarks[LANDMARK.WRIST];
    ctx.fillStyle = color;
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(
      hand.handedness,
      wrist.x * canvas.width - 20,
      wrist.y * canvas.height + 30
    );

    ctx.restore();
  }

  private updateFPS(): void {
    const now = performance.now();
    this.frameCount++;

    if (now - this.lastFpsUpdate >= this.fpsUpdateInterval) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }

    this.lastFrameTime = now;
  }

  resize(): void {
    // Match canvas size to its display size
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;

    // Scale the context to account for device pixel ratio
    this.ctx.scale(dpr, dpr);
  }

  getCanvasSize(): { width: number; height: number } {
    return {
      width: this.canvas.width,
      height: this.canvas.height,
    };
  }

  getFPS(): number {
    return this.fps;
  }
}
