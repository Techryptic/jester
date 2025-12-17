import type {
  BoardState,
  Hand,
  GestureState,
  AppConfig,
  Stroke,
  Camera,
  TemplateLayer,
  Point,
  ImageLayer,
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
  
  // Cache for loaded images
  private imageCache: Map<string, HTMLImageElement> = new Map();

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
    config: AppConfig,
    images: ImageLayer[] = []
  ): void {
    // Update FPS
    this.updateFPS();

    const { ctx, canvas } = this;
    const { camera } = boardState;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Check if webcam-only mode is active
    const activeTemplate = boardState.templates.find(t => t.visible);
    const isWebcamOnly = activeTemplate?.id === 'webcam';

    // Draw video as background (mirrored based on config)
    this.drawVideo(isWebcamOnly, config.mirrorOutput);

    // Draw whiteboard content (templates + strokes + images) with camera transform
    this.drawWhiteboardContent(boardState, camera, config.backgroundOpacity, images);

    // Draw debug overlays (on top, in screen space) - only if master toggle is on
    if (config.debug.showDebugOverlay) {
      this.drawDebugOverlay(hands, gestureState, camera, config);
    } else if (config.debug.showLandmarks) {
      // Still draw hand landmarks if enabled, even when debug overlay is off
      for (const hand of hands) {
        this.drawHandLandmarks(hand, config.mirrorOutput);
      }
    }

    // Draw erase cursor if erasing (swap palm position for left-handed mode)
    const erasePalmPos = config.gesture.leftHandedMode 
      ? gestureState.lastRightPalmPos 
      : gestureState.lastLeftPalmPos;
    if (gestureState.currentGesture === 'ERASING' && erasePalmPos) {
      const pos = config.mirrorOutput ? erasePalmPos : { x: 1 - erasePalmPos.x, y: erasePalmPos.y };
      this.drawEraseCursor(pos, config.gesture.eraseRadius);
    }

    // Draw draw cursor if drawing (swap pinch position for left-handed mode)
    const drawPinchPos = config.gesture.leftHandedMode 
      ? gestureState.lastLeftPinchPos 
      : gestureState.lastRightPinchPos;
    if (gestureState.currentGesture === 'DRAWING' && drawPinchPos) {
      const pos = config.mirrorOutput ? drawPinchPos : { x: 1 - drawPinchPos.x, y: drawPinchPos.y };
      this.drawDrawCursor(pos, config.pen.thickness, config.pen.color);
    }
  }

  private drawVideo(isWebcamOnly: boolean = false, mirror: boolean = true): void {
    const { ctx, canvas, videoElement } = this;

    if (videoElement.readyState < 2) return;

    ctx.save();
    
    if (mirror) {
      // Mirror the video horizontally (natural self-view)
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    // Draw video scaled to fit canvas
    // Full opacity for webcam-only mode, semi-transparent for whiteboard mode
    ctx.globalAlpha = isWebcamOnly ? 1.0 : 0.3;
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawWhiteboardContent(boardState: BoardState, camera: Camera, backgroundOpacity: number, images: ImageLayer[]): void {
    const { ctx, canvas } = this;

    ctx.save();

    // Apply camera transform
    // Translate to center, scale, then translate back with camera offset
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // Draw templates
    this.drawTemplates(boardState.templates, backgroundOpacity);

    // Draw uploaded images
    this.drawImages(images);

    // Draw strokes
    this.drawStrokes(boardState.strokes);

    ctx.restore();
  }

  private drawImages(images: ImageLayer[]): void {
    const { ctx } = this;

    for (const img of images) {
      // Get or create cached image element
      let imgEl = this.imageCache.get(img.id);
      
      if (!imgEl) {
        imgEl = new Image();
        imgEl.src = img.src;
        this.imageCache.set(img.id, imgEl);
      }

      // Only draw if image is loaded
      if (imgEl.complete && imgEl.naturalWidth > 0) {
        ctx.save();
        ctx.globalAlpha = img.opacity;
        
        // Draw centered at position
        ctx.drawImage(
          imgEl,
          img.x - img.width / 2,
          img.y - img.height / 2,
          img.width,
          img.height
        );
        
        ctx.restore();
      }
    }
  }

  private drawTemplates(templates: TemplateLayer[], backgroundOpacity: number): void {
    const { ctx, canvas } = this;

    for (const template of templates) {
      if (!template.visible) continue;

      switch (template.type) {
        case 'grid':
          this.drawBlankBackground(backgroundOpacity);
          this.drawGrid(template);
          break;
        case 'dots':
          this.drawBlankBackground(backgroundOpacity);
          this.drawDots(template);
          break;
        case 'lines':
          this.drawBlankBackground(backgroundOpacity);
          this.drawLines(template);
          break;
        case 'image':
          // Webcam-only template - no background drawn, just pure webcam
          if (template.id === 'webcam') {
            // Do nothing - let webcam video show through
          }
          // Blank template - draw a white background in world space
          else if (template.id === 'blank') {
            this.drawBlankBackground(backgroundOpacity);
          }
          break;
      }
    }
  }

  private drawBlankBackground(opacity: number): void {
    // Skip drawing if opacity is 0 (fully transparent)
    if (opacity <= 0) return;
    
    const { ctx, canvas } = this;
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.fillRect(-canvas.width * 5, -canvas.height * 5, canvas.width * 10, canvas.height * 10);
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
        this.drawHandLandmarks(hand, config.mirrorOutput);
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

  private drawHandLandmarks(hand: Hand, mirror: boolean = true): void {
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
      const x1 = mirror ? p1.x : (1 - p1.x);
      const x2 = mirror ? p2.x : (1 - p2.x);
      ctx.beginPath();
      ctx.moveTo(x1 * canvas.width, p1.y * canvas.height);
      ctx.lineTo(x2 * canvas.width, p2.y * canvas.height);
      ctx.stroke();
    }

    // Draw landmarks as circles
    ctx.globalAlpha = 1;
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      const x = mirror ? lm.x * canvas.width : (1 - lm.x) * canvas.width;
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
    const wristX = mirror ? wrist.x * canvas.width : (1 - wrist.x) * canvas.width;
    ctx.fillStyle = color;
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(
      hand.handedness,
      wristX - 20,
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
