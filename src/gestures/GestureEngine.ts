import type {
  Hand,
  Point,
  GestureEvent,
  GestureState,
  GestureConfig,
  ActiveGesture,
} from '../types';
import { LANDMARK, FINGERTIPS, DEFAULT_GESTURE_CONFIG } from '../types';
import { LandmarkSmoother } from '../handTracking/LandmarkSmoother';

type GestureListener = (event: GestureEvent) => void;

export class GestureEngine {
  private config: GestureConfig;
  private state: GestureState;
  private smoother: LandmarkSmoother;
  private listeners: GestureListener[] = [];

  // Hysteresis counters for each gesture type
  private pinchRightFrames = 0;
  private pinchLeftFrames = 0;
  private palmRightFrames = 0;
  private palmLeftFrames = 0;

  constructor(config: Partial<GestureConfig> = {}) {
    this.config = { ...DEFAULT_GESTURE_CONFIG, ...config };
    this.smoother = new LandmarkSmoother(this.config.smoothingFactor);
    this.state = this.createInitialState();
  }

  private createInitialState(): GestureState {
    return {
      currentGesture: 'IDLE',
      rightPinching: false,
      leftPinching: false,
      rightPalmOpen: false,
      leftPalmOpen: false,
      lastRightPinchPos: null,
      lastLeftPinchPos: null,
      lastRightPalmPos: null,
      lastLeftPalmPos: null,
      lastPinchDistance: null,
      activationFrames: 0,
      deactivationFrames: 0,
    };
  }

  updateConfig(config: Partial<GestureConfig>): void {
    this.config = { ...this.config, ...config };
    this.smoother.setAlpha(this.config.smoothingFactor);
  }

  onGesture(callback: GestureListener): () => void {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private emit(event: GestureEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  processHands(rawHands: Hand[]): void {
    // Apply smoothing
    const hands = this.smoother.smooth(rawHands);

    // Find right and left hands
    const rightHand = hands.find((h) => h.handedness === 'Right');
    const leftHand = hands.find((h) => h.handedness === 'Left');

    // Detect gestures
    const rightPinchDetected = rightHand ? this.detectPinch(rightHand) : false;
    const leftPinchDetected = leftHand ? this.detectPinch(leftHand) : false;
    const rightPalmDetected = rightHand ? this.detectPalmOpen(rightHand) : false;
    const leftPalmDetected = leftHand ? this.detectPalmOpen(leftHand) : false;

    // Apply hysteresis to determine stable gesture states
    const rightPinching = this.updateWithHysteresis(
      rightPinchDetected,
      this.state.rightPinching,
      this.pinchRightFrames,
      (frames) => { this.pinchRightFrames = frames; }
    );
    const leftPinching = this.updateWithHysteresis(
      leftPinchDetected,
      this.state.leftPinching,
      this.pinchLeftFrames,
      (frames) => { this.pinchLeftFrames = frames; }
    );
    const rightPalmOpen = this.updateWithHysteresis(
      rightPalmDetected,
      this.state.rightPalmOpen,
      this.palmRightFrames,
      (frames) => { this.palmRightFrames = frames; }
    );
    const leftPalmOpen = this.updateWithHysteresis(
      leftPalmDetected,
      this.state.leftPalmOpen,
      this.palmLeftFrames,
      (frames) => { this.palmLeftFrames = frames; }
    );

    // Get positions
    const rightPinchPos = rightHand ? this.getPinchPosition(rightHand) : null;
    const leftPinchPos = leftHand ? this.getPinchPosition(leftHand) : null;
    const rightPalmPos = rightHand ? this.getPalmPosition(rightHand) : null;
    const leftPalmPos = leftHand ? this.getPalmPosition(leftHand) : null;

    // Determine current gesture and emit events
    const previousGesture = this.state.currentGesture;
    let newGesture: ActiveGesture = 'IDLE';

    // Left-handed mode swaps hand roles
    // Draw hand: Right (normal) or Left (left-handed)
    // Erase/Pan hand: Left (normal) or Right (left-handed)
    const isLeftHanded = this.config.leftHandedMode;
    
    const drawPinching = isLeftHanded ? leftPinching : rightPinching;
    const drawPinchPos = isLeftHanded ? leftPinchPos : rightPinchPos;
    const erasePalmOpen = isLeftHanded ? rightPalmOpen : leftPalmOpen;
    const erasePalmPos = isLeftHanded ? rightPalmPos : leftPalmPos;
    const panPalmOpen = isLeftHanded ? leftPalmOpen : rightPalmOpen;
    const panPalmPos = isLeftHanded ? leftPalmPos : rightPalmPos;
    const panPinching = isLeftHanded ? leftPinching : rightPinching;
    const lastPanPalmPos = isLeftHanded ? this.state.lastLeftPalmPos : this.state.lastRightPalmPos;
    const lastDrawPinchPos = isLeftHanded ? this.state.lastLeftPinchPos : this.state.lastRightPinchPos;

    // Priority: ZOOM > DRAW > ERASE > PAN > IDLE
    if (rightPinching && leftPinching && rightPinchPos && leftPinchPos) {
      // Two-hand zoom (works same for both modes)
      newGesture = 'ZOOMING';
      const currentDistance = this.calculateDistance(rightPinchPos, leftPinchPos);
      const center = {
        x: (rightPinchPos.x + leftPinchPos.x) / 2,
        y: (rightPinchPos.y + leftPinchPos.y) / 2,
      };

      if (this.state.lastPinchDistance !== null) {
        const factor = currentDistance / this.state.lastPinchDistance;
        const adjustedFactor = 1 + (factor - 1) * this.config.zoomSensitivity;
        this.emit({ type: 'ZOOM', factor: adjustedFactor, center });
      }

      this.state.lastPinchDistance = currentDistance;
    } else if (drawPinching && drawPinchPos) {
      // Draw hand pinch = DRAW
      newGesture = 'DRAWING';

      if (previousGesture !== 'DRAWING') {
        this.emit({ type: 'DRAW_START', position: drawPinchPos });
      } else {
        this.emit({ type: 'DRAW_MOVE', position: drawPinchPos });
      }
    } else if (erasePalmOpen && erasePalmPos) {
      // Erase hand palm open = ERASE
      newGesture = 'ERASING';
      this.emit({
        type: 'ERASE',
        position: erasePalmPos,
        radius: this.config.eraseRadius,
      });
    } else if (panPalmOpen && panPalmPos && !panPinching) {
      // Pan hand palm open (not pinching) = PAN
      newGesture = 'PANNING';

      if (lastPanPalmPos) {
        const delta = {
          x: (panPalmPos.x - lastPanPalmPos.x) * this.config.panSensitivity,
          y: (panPalmPos.y - lastPanPalmPos.y) * this.config.panSensitivity,
        };
        this.emit({ type: 'PAN', delta });
      }
    }

    // Handle gesture transitions
    if (previousGesture === 'DRAWING' && newGesture !== 'DRAWING') {
      // Draw ended
      if (lastDrawPinchPos) {
        this.emit({ type: 'DRAW_END', position: lastDrawPinchPos });
      }
    }

    if (newGesture === 'IDLE' && previousGesture !== 'IDLE') {
      this.emit({ type: 'IDLE' });
    }

    // Reset zoom distance when not zooming
    if (newGesture !== 'ZOOMING') {
      this.state.lastPinchDistance = null;
    }

    // Update state
    this.state = {
      ...this.state,
      currentGesture: newGesture,
      rightPinching,
      leftPinching,
      rightPalmOpen,
      leftPalmOpen,
      lastRightPinchPos: rightPinchPos,
      lastLeftPinchPos: leftPinchPos,
      lastRightPalmPos: rightPalmPos,
      lastLeftPalmPos: leftPalmPos,
    };
  }

  private updateWithHysteresis(
    detected: boolean,
    currentActive: boolean,
    frameCounter: number,
    setFrames: (frames: number) => void
  ): boolean {
    if (detected && !currentActive) {
      // Trying to activate
      if (frameCounter >= this.config.activationFrames) {
        setFrames(0);
        return true;
      }
      setFrames(frameCounter + 1);
      return false;
    } else if (!detected && currentActive) {
      // Trying to deactivate
      if (frameCounter >= this.config.deactivationFrames) {
        setFrames(0);
        return false;
      }
      setFrames(frameCounter + 1);
      return true;
    }
    setFrames(0);
    return currentActive;
  }

  private detectPinch(hand: Hand): boolean {
    const thumbTip = hand.landmarks[LANDMARK.THUMB_TIP];
    const indexTip = hand.landmarks[LANDMARK.INDEX_TIP];
    
    // Check 2D distance between thumb and index tips
    const distance2D = this.calculateDistance(thumbTip, indexTip);
    
    // Check depth (Z) difference - when actually pinching, Z values are similar
    // When wrist rotates and fingers just LOOK close, Z values differ significantly
    const zDiff = Math.abs(thumbTip.z - indexTip.z);
    const maxZDiff = 0.08; // Allow some Z tolerance
    
    // Both conditions must be met for a valid pinch
    return distance2D < this.config.pinchThreshold && zDiff < maxZDiff;
  }

  private detectPalmOpen(hand: Hand): boolean {
    const wrist = hand.landmarks[LANDMARK.WRIST];
    const palmBase = hand.landmarks[LANDMARK.MIDDLE_MCP];

    // Calculate average distance from palm to fingertips
    let totalDistance = 0;
    for (const tipIndex of FINGERTIPS) {
      const tip = hand.landmarks[tipIndex];
      totalDistance += this.calculateDistance(palmBase, tip);
    }
    const avgDistance = totalDistance / FINGERTIPS.length;

    // Also check that fingers are spread (not in a fist)
    const wristToIndex = this.calculateDistance(wrist, hand.landmarks[LANDMARK.INDEX_TIP]);
    const wristToPinky = this.calculateDistance(wrist, hand.landmarks[LANDMARK.PINKY_TIP]);

    // Palm is open if fingers are extended
    return avgDistance > this.config.palmOpenThreshold && 
           wristToIndex > this.config.palmOpenThreshold * 1.2 &&
           wristToPinky > this.config.palmOpenThreshold * 1.2;
  }

  private getPinchPosition(hand: Hand): Point {
    // Return midpoint between thumb and index finger tips
    const thumbTip = hand.landmarks[LANDMARK.THUMB_TIP];
    const indexTip = hand.landmarks[LANDMARK.INDEX_TIP];
    return {
      x: (thumbTip.x + indexTip.x) / 2,
      y: (thumbTip.y + indexTip.y) / 2,
    };
  }

  private getPalmPosition(hand: Hand): Point {
    // Return palm center (middle MCP)
    const palm = hand.landmarks[LANDMARK.MIDDLE_MCP];
    return { x: palm.x, y: palm.y };
  }

  private calculateDistance(p1: Point, p2: Point): number {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  }

  getState(): GestureState {
    return { ...this.state };
  }

  reset(): void {
    this.state = this.createInitialState();
    this.smoother.reset();
    this.pinchRightFrames = 0;
    this.pinchLeftFrames = 0;
    this.palmRightFrames = 0;
    this.palmLeftFrames = 0;
  }
}
