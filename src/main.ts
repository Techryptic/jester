import { HandTracker } from './handTracking/HandTracker';
import { GestureEngine } from './gestures/GestureEngine';
import { WhiteboardEngine } from './whiteboard/WhiteboardEngine';
import { Renderer } from './rendering/Renderer';
import { UIManager } from './ui/UIManager';
import type { Hand } from './types';
import './style.css';

class GestureWhiteboardApp {
  private handTracker: HandTracker;
  private gestureEngine: GestureEngine;
  private whiteboard: WhiteboardEngine;
  private renderer: Renderer;
  private ui: UIManager;

  private videoElement!: HTMLVideoElement;
  private canvasElement!: HTMLCanvasElement;
  private latestHands: Hand[] = [];
  private running = false;

  constructor() {
    this.handTracker = new HandTracker();
    this.gestureEngine = new GestureEngine();
    this.whiteboard = new WhiteboardEngine();
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

      // Wire up gesture events to whiteboard
      this.gestureEngine.onGesture((event) => {
        if (this.ui.isGesturesEnabled()) {
          this.whiteboard.handleGestureEvent(event);
        }
      });

      // Initialize renderer
      this.renderer = new Renderer(this.canvasElement, this.videoElement);

      // Initialize UI
      this.ui = new UIManager(this.whiteboard, this.gestureEngine);
      this.ui.initialize();

      // Set initial canvas size
      this.handleResize();
      window.addEventListener('resize', () => this.handleResize());

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

    const width = container.clientWidth;
    const height = container.clientHeight;

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
        this.ui.getConfig()
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
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new GestureWhiteboardApp();
  app.initialize().catch(console.error);
});
