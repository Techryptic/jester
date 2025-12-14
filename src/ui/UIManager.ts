import type { AppConfig, GestureConfig, PenConfig, DebugConfig, TemplateLayer } from '../types';
import { DEFAULT_APP_CONFIG } from '../types';
import type { WhiteboardEngine } from '../whiteboard/WhiteboardEngine';
import type { GestureEngine } from '../gestures/GestureEngine';

export class UIManager {
  private config: AppConfig;
  private whiteboard: WhiteboardEngine;
  private gestureEngine: GestureEngine;
  private container: HTMLElement | null = null;

  constructor(whiteboard: WhiteboardEngine, gestureEngine: GestureEngine) {
    this.config = { ...DEFAULT_APP_CONFIG };
    this.whiteboard = whiteboard;
    this.gestureEngine = gestureEngine;
  }

  initialize(): void {
    this.createControlPanel();
    this.setupEventListeners();
  }

  private createControlPanel(): void {
    // Create control panel container
    this.container = document.createElement('div');
    this.container.id = 'control-panel';
    this.container.innerHTML = `
      <div class="panel-header">
        <h3>🖐️ Gesture Whiteboard</h3>
        <button id="toggle-panel" class="icon-btn">−</button>
      </div>
      
      <div class="panel-content">
        <!-- Gesture Controls -->
        <section class="control-section">
          <h4>Gestures</h4>
          <label class="toggle-label">
            <input type="checkbox" id="gestures-enabled" checked />
            <span>Enable Gestures</span>
          </label>
          <div class="gesture-help">
            <small>
              <b>Left Pinch:</b> Draw<br/>
              <b>Right Palm:</b> Erase<br/>
              <b>Left Palm:</b> Pan<br/>
              <b>Both Pinch:</b> Zoom
            </small>
          </div>
        </section>

        <!-- Pen Controls -->
        <section class="control-section">
          <h4>Pen</h4>
          <div class="control-row">
            <label>Color</label>
            <input type="color" id="pen-color" value="#ff4444" />
          </div>
          <div class="control-row">
            <label>Size: <span id="thickness-value">4</span></label>
            <input type="range" id="pen-thickness" min="1" max="30" value="4" />
          </div>
        </section>

        <!-- Template Controls -->
        <section class="control-section">
          <h4>Background</h4>
          <select id="template-select">
            <option value="webcam" selected>📹 Webcam Only</option>
            <option value="blank">Blank (White)</option>
            <option value="grid">Grid</option>
            <option value="dots">Dot Grid</option>
            <option value="lines">Lined</option>
          </select>
        </section>

        <!-- Actions -->
        <section class="control-section">
          <h4>Actions</h4>
          <div class="button-row">
            <button id="clear-canvas" class="action-btn danger">Clear All</button>
            <button id="reset-camera" class="action-btn">Reset View</button>
          </div>
        </section>

        <!-- Debug Controls -->
        <section class="control-section">
          <h4>Debug</h4>
          <label class="toggle-label">
            <input type="checkbox" id="show-landmarks" checked />
            <span>Show Hands</span>
          </label>
          <label class="toggle-label">
            <input type="checkbox" id="show-gesture-state" checked />
            <span>Show Gesture State</span>
          </label>
          <label class="toggle-label">
            <input type="checkbox" id="show-fps" checked />
            <span>Show FPS</span>
          </label>
          <label class="toggle-label">
            <input type="checkbox" id="show-camera" />
            <span>Show Camera Info</span>
          </label>
        </section>

        <!-- Gesture Tuning -->
        <section class="control-section collapsible">
          <h4 class="collapsible-header">⚙️ Advanced Tuning</h4>
          <div class="collapsible-content" style="display: none;">
            <label class="toggle-label" style="margin-bottom: 12px; padding: 8px; background: rgba(74, 144, 217, 0.2); border-radius: 4px;">
              <input type="checkbox" id="left-handed-mode" checked />
              <span>🫲 Left-Handed Mode</span>
            </label>
            <p class="tuning-desc">Swap hand roles: Left pinch draws, Right palm erases</p>
            
            <div class="control-row">
              <label>Background Opacity: <span id="bg-opacity-value">90</span>%</label>
              <input type="range" id="bg-opacity" min="0" max="100" step="5" value="90" />
            </div>
            <p class="tuning-desc">Transparency of the white overlay (0% = pure webcam)</p>
            
            <div class="control-row">
              <label>Pinch Threshold: <span id="pinch-threshold-value">0.05</span></label>
              <input type="range" id="pinch-threshold" min="0.03" max="0.15" step="0.01" value="0.05" />
            </div>
            <p class="tuning-desc">How close thumb & index must be to trigger drawing. Lower = more sensitive</p>
            
            <div class="control-row">
              <label>Palm Threshold: <span id="palm-threshold-value">0.2</span></label>
              <input type="range" id="palm-threshold" min="0.1" max="0.4" step="0.02" value="0.2" />
            </div>
            <p class="tuning-desc">How open your hand must be to trigger erase/pan. Higher = more open</p>
            
            <div class="control-row">
              <label>Erase Radius: <span id="erase-radius-value">40</span></label>
              <input type="range" id="erase-radius" min="10" max="100" step="5" value="40" />
            </div>
            <p class="tuning-desc">Size of the eraser circle in pixels</p>
            
            <div class="control-row">
              <label>Smoothing: <span id="smoothing-value">0.4</span></label>
              <input type="range" id="smoothing" min="0.1" max="0.9" step="0.1" value="0.4" />
            </div>
            <p class="tuning-desc">Reduces hand jitter. Higher = smoother but laggy</p>
          </div>
        </section>
      </div>
    `;

    document.body.appendChild(this.container);
  }

  private setupEventListeners(): void {
    if (!this.container) return;

    // Panel toggle
    const toggleBtn = this.container.querySelector('#toggle-panel');
    const panelContent = this.container.querySelector('.panel-content');
    toggleBtn?.addEventListener('click', () => {
      if (panelContent) {
        const isHidden = panelContent.classList.toggle('hidden');
        if (toggleBtn) toggleBtn.textContent = isHidden ? '+' : '−';
      }
    });

    // Gestures enabled toggle
    const gesturesEnabled = this.container.querySelector('#gestures-enabled') as HTMLInputElement;
    gesturesEnabled?.addEventListener('change', () => {
      this.config.gesturesEnabled = gesturesEnabled.checked;
    });

    // Pen color
    const penColor = this.container.querySelector('#pen-color') as HTMLInputElement;
    penColor?.addEventListener('input', () => {
      this.config.pen.color = penColor.value;
      this.whiteboard.setPenColor(penColor.value);
    });

    // Pen thickness
    const penThickness = this.container.querySelector('#pen-thickness') as HTMLInputElement;
    const thicknessValue = this.container.querySelector('#thickness-value');
    penThickness?.addEventListener('input', () => {
      const value = parseInt(penThickness.value);
      this.config.pen.thickness = value;
      this.whiteboard.setPenThickness(value);
      if (thicknessValue) thicknessValue.textContent = penThickness.value;
    });

    // Template select
    const templateSelect = this.container.querySelector('#template-select') as HTMLSelectElement;
    templateSelect?.addEventListener('change', () => {
      this.whiteboard.setTemplateVisible(templateSelect.value, true);
    });

    // Clear canvas
    const clearBtn = this.container.querySelector('#clear-canvas');
    clearBtn?.addEventListener('click', () => {
      if (confirm('Clear all drawings?')) {
        this.whiteboard.clearStrokes();
      }
    });

    // Reset camera
    const resetCameraBtn = this.container.querySelector('#reset-camera');
    resetCameraBtn?.addEventListener('click', () => {
      this.whiteboard.resetCamera();
    });

    // Debug toggles
    this.setupDebugToggle('#show-landmarks', 'showLandmarks');
    this.setupDebugToggle('#show-gesture-state', 'showGestureState');
    this.setupDebugToggle('#show-fps', 'showFPS');
    this.setupDebugToggle('#show-camera', 'showCamera');

    // Collapsible sections
    const collapsibleHeaders = this.container.querySelectorAll('.collapsible-header');
    collapsibleHeaders.forEach((header) => {
      header.addEventListener('click', () => {
        const content = header.nextElementSibling as HTMLElement;
        if (content) {
          content.style.display = content.style.display === 'none' ? 'block' : 'none';
        }
      });
    });

    // Advanced tuning sliders
    this.setupGestureSlider('#pinch-threshold', 'pinchThreshold', '#pinch-threshold-value');
    this.setupGestureSlider('#palm-threshold', 'palmOpenThreshold', '#palm-threshold-value');
    this.setupGestureSlider('#erase-radius', 'eraseRadius', '#erase-radius-value');
    this.setupGestureSlider('#smoothing', 'smoothingFactor', '#smoothing-value');

    // Left-handed mode toggle
    const leftHandedToggle = this.container.querySelector('#left-handed-mode') as HTMLInputElement;
    const gestureHelp = this.container.querySelector('.gesture-help small');
    leftHandedToggle?.addEventListener('change', () => {
      this.config.gesture.leftHandedMode = leftHandedToggle.checked;
      this.gestureEngine.updateConfig({ leftHandedMode: leftHandedToggle.checked });
      
      // Update gesture help text
      if (gestureHelp) {
        if (leftHandedToggle.checked) {
          gestureHelp.innerHTML = `
            <b>Left Pinch:</b> Draw<br/>
            <b>Right Palm:</b> Erase<br/>
            <b>Left Palm:</b> Pan<br/>
            <b>Both Pinch:</b> Zoom
          `;
        } else {
          gestureHelp.innerHTML = `
            <b>Right Pinch:</b> Draw<br/>
            <b>Left Palm:</b> Erase<br/>
            <b>Right Palm:</b> Pan<br/>
            <b>Both Pinch:</b> Zoom
          `;
        }
      }
    });

    // Background opacity slider
    const bgOpacitySlider = this.container.querySelector('#bg-opacity') as HTMLInputElement;
    const bgOpacityValue = this.container.querySelector('#bg-opacity-value');
    bgOpacitySlider?.addEventListener('input', () => {
      const value = parseInt(bgOpacitySlider.value);
      this.config.backgroundOpacity = value / 100;
      if (bgOpacityValue) bgOpacityValue.textContent = bgOpacitySlider.value;
    });
  }

  private setupDebugToggle(selector: string, configKey: keyof DebugConfig): void {
    if (!this.container) return;
    const input = this.container.querySelector(selector) as HTMLInputElement;
    input?.addEventListener('change', () => {
      this.config.debug[configKey] = input.checked;
    });
  }

  private setupGestureSlider(
    selector: string,
    configKey: keyof GestureConfig,
    valueSelector: string
  ): void {
    if (!this.container) return;
    const slider = this.container.querySelector(selector) as HTMLInputElement;
    const valueDisplay = this.container.querySelector(valueSelector);

    slider?.addEventListener('input', () => {
      const value = parseFloat(slider.value);
      (this.config.gesture as any)[configKey] = value;
      if (valueDisplay) valueDisplay.textContent = slider.value;
      this.gestureEngine.updateConfig({ [configKey]: value });
    });
  }

  getConfig(): AppConfig {
    return this.config;
  }

  updatePenConfig(pen: Partial<PenConfig>): void {
    this.config.pen = { ...this.config.pen, ...pen };
    if (pen.color) this.whiteboard.setPenColor(pen.color);
    if (pen.thickness) this.whiteboard.setPenThickness(pen.thickness);
  }

  isGesturesEnabled(): boolean {
    return this.config.gesturesEnabled;
  }
}
