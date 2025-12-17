import { HandTracker } from './handTracking/HandTracker';
import { GestureEngine } from './gestures/GestureEngine';
import { WhiteboardEngine } from './whiteboard/WhiteboardEngine';
import { Renderer } from './rendering/Renderer';
import { UIManager } from './ui/UIManager';
import { SyncClient } from './sync/SyncClient';
import type { Hand, Point } from './types';
import './style.css';

class GestureWhiteboardApp {
  private handTracker: HandTracker;
  private gestureEngine: GestureEngine;
  private whiteboard: WhiteboardEngine;
  private renderer: Renderer;
  private ui: UIManager;
  private syncClient: SyncClient;

  private videoElement!: HTMLVideoElement;
  private canvasElement!: HTMLCanvasElement;
  private latestHands: Hand[] = [];
  private running = false;
  private syncConnected = false;

  constructor() {
    this.handTracker = new HandTracker();
    this.gestureEngine = new GestureEngine();
    this.whiteboard = new WhiteboardEngine();
    this.syncClient = new SyncClient();
    // Renderer and UI will be initialized after DOM elements are created
    this.renderer = null as any;
    this.ui = null as any;
  }

  async initialize(): Promise<void> {
    try {
      this.showStatus('Initializing...');

      // Create DOM elements
      this.createDOMElements();

      // Setup webcam
      this.showStatus('Requesting camera access...');
      await this.setupWebcam();

      // Initialize hand tracking
      this.showStatus('Loading hand tracking model...');
      await this.handTracker.initialize(this.videoElement);

      // Setup hand tracking callback
      this.handTracker.setResultsCallback((hands) => {
        this.latestHands = hands;
        if (this.ui.isGesturesEnabled()) {
          this.gestureEngine.processHands(hands);
        }
      });

      // Wire up gesture events to whiteboard, respecting individual toggles
      this.gestureEngine.onGesture((event) => {
        if (!this.ui.isGesturesEnabled()) return;
        
        const toggles = this.ui.getConfig().gestureToggles;
        
        // Check if the specific gesture type is enabled
        if (event.type === 'DRAW_START' || event.type === 'DRAW_MOVE' || event.type === 'DRAW_END') {
          if (!toggles.draw) return;
        } else if (event.type === 'ERASE') {
          if (!toggles.erase) return;
        } else if (event.type === 'PAN') {
          if (!toggles.pan) return;
        } else if (event.type === 'ZOOM') {
          if (!toggles.zoom) return;
        }
        
        this.whiteboard.handleGestureEvent(event);
      });

      // Initialize renderer
      this.renderer = new Renderer(this.canvasElement, this.videoElement);

      // Initialize UI
      this.ui = new UIManager(this.whiteboard, this.gestureEngine);
      this.ui.initialize();

      // Update webcam info in UI
      this.ui.updateWebcamInfo(
        this.videoElement.videoWidth,
        this.videoElement.videoHeight
      );

      // Set initial canvas size
      this.handleResize();
      window.addEventListener('resize', () => this.handleResize());

      // Initialize sync client for iPad drawing
      this.setupSync();

      // Hide status and start
      this.hideStatus();
      this.showStatus('Ready! Show your hands to start.', 'success');
      setTimeout(() => this.hideStatus(), 3000);

      // Start the main loop
      this.start();

    } catch (error) {
      console.error('Initialization error:', error);
      this.showStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  }

  private createDOMElements(): void {
    const app = document.getElementById('app');
    if (!app) {
      throw new Error('App container not found');
    }

    app.innerHTML = `
      <div id="status-overlay">
        <div class="status-content">
          <div class="spinner"></div>
          <p id="status-text">Loading...</p>
        </div>
      </div>
      <video id="video" autoplay playsinline></video>
      <canvas id="canvas"></canvas>
    `;

    this.videoElement = document.getElementById('video') as HTMLVideoElement;
    this.canvasElement = document.getElementById('canvas') as HTMLCanvasElement;

    if (!this.videoElement || !this.canvasElement) {
      throw new Error('Failed to create video or canvas elements');
    }
  }

  private async setupWebcam(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      });

      this.videoElement.srcObject = stream;

      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        this.videoElement.onloadedmetadata = () => {
          this.videoElement.play()
            .then(() => resolve())
            .catch(reject);
        };
        this.videoElement.onerror = () => reject(new Error('Video failed to load'));
      });

    } catch (error) {
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          throw new Error('Camera access denied. Please allow camera access and refresh.');
        } else if (error.name === 'NotFoundError') {
          throw new Error('No camera found. Please connect a webcam and refresh.');
        }
      }
      throw error;
    }
  }

  private handleResize(): void {
    const container = document.getElementById('app');
    if (!container) return;

    let width = container.clientWidth;
    let height = container.clientHeight;

    // Check if aspect ratio lock is enabled
    const config = this.ui?.getConfig();
    if (config?.aspectRatio && config.aspectRatio !== 'none') {
      let targetRatio: number;

      switch (config.aspectRatio) {
        case '16:9':
          targetRatio = 16 / 9;
          break;
        case '16:10':
          targetRatio = 16 / 10;
          break;
        case '4:3':
          targetRatio = 4 / 3;
          break;
        case 'custom':
          if (config.customAspectRatio) {
            targetRatio = config.customAspectRatio.width / config.customAspectRatio.height;
          } else {
            targetRatio = 16 / 10; // Default custom
          }
          break;
        default:
          targetRatio = width / height; // No change
      }

      const currentRatio = width / height;

      if (currentRatio > targetRatio) {
        // Window is wider than target, reduce width
        width = height * targetRatio;
      } else {
        // Window is taller than target, reduce height
        height = width / targetRatio;
      }
    }

    this.canvasElement.width = width;
    this.canvasElement.height = height;
    this.canvasElement.style.width = `${width}px`;
    this.canvasElement.style.height = `${height}px`;

    this.whiteboard.setCanvasSize(width, height);
  }

  private start(): void {
    this.running = true;
    this.loop();
  }

  private stop(): void {
    this.running = false;
  }

  private async loop(): Promise<void> {
    if (!this.running) return;

    try {
      // Process hand tracking
      await this.handTracker.processFrame();

      // Render
      this.renderer.render(
        this.whiteboard.getState(),
        this.latestHands,
        this.gestureEngine.getState(),
        this.ui.getConfig(),
        this.whiteboard.getImages()
      );
    } catch (error) {
      console.error('Loop error:', error);
    }

    requestAnimationFrame(() => this.loop());
  }

  private showStatus(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
    const overlay = document.getElementById('status-overlay');
    const text = document.getElementById('status-text');
    const spinner = overlay?.querySelector('.spinner');

    if (overlay && text) {
      overlay.style.display = 'flex';
      text.textContent = message;
      text.className = type;

      if (spinner) {
        (spinner as HTMLElement).style.display = type === 'info' ? 'block' : 'none';
      }
    }
  }

  private hideStatus(): void {
    const overlay = document.getElementById('status-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  private setupSync(): void {
    // Connect to sync server
    this.syncClient.connect();

    // Handle sync messages
    this.syncClient.onMessage((message) => {
      if (message.type === 'connection') {
        const data = message.data as { connected?: boolean; totalClients?: number };
        this.syncConnected = data.connected ?? this.syncConnected;
        if (data.totalClients !== undefined) {
          console.log(`[Sync] Total connected clients: ${data.totalClients}`);
        }
      } else if (message.type === 'stroke') {
        // New stroke started from iPad
        const data = message.data as { id: string; points: Point[]; color: string; thickness: number };
        this.whiteboard.addRemoteStroke(data.id, data.points, data.color, data.thickness);
      } else if (message.type === 'stroke_update') {
        // Stroke continues
        const data = message.data as { id: string; point: Point };
        this.whiteboard.updateRemoteStroke(data.id, data.point);
      } else if (message.type === 'stroke_end') {
        // Stroke finished
        const data = message.data as { id: string };
        this.whiteboard.finalizeRemoteStroke(data.id);
      } else if (message.type === 'clear') {
        // Clear all strokes
        this.whiteboard.clearStrokes();
      } else if (message.type === 'undo') {
        // Undo last stroke
        this.whiteboard.undo();
      } else if (message.type === 'toggle_gesture') {
        // Toggle individual gesture from remote client (iPad)
        const data = message.data as { gesture: string; enabled: boolean };
        const config = this.ui.getConfig();
        
        if (data.gesture === 'draw') {
          config.gestureToggles.draw = data.enabled;
        } else if (data.gesture === 'erase') {
          config.gestureToggles.erase = data.enabled;
        } else if (data.gesture === 'pan') {
          config.gestureToggles.pan = data.enabled;
        } else if (data.gesture === 'zoom') {
          config.gestureToggles.zoom = data.enabled;
        }
        
        // Update the UI checkboxes to reflect the change
        this.updateGestureToggleUI(data.gesture, data.enabled);
      }
    });
  }

  private updateGestureToggleUI(gesture: string, enabled: boolean): void {
    const checkboxId = `toggle-${gesture}`;
    const checkbox = document.getElementById(checkboxId) as HTMLInputElement;
    if (checkbox) {
      checkbox.checked = enabled;
    }
  }
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new GestureWhiteboardApp();
  app.initialize().catch(console.error);
});
