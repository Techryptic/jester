import type { Hand, HandLandmark, Point } from '../types';

/**
 * Applies exponential moving average (EMA) smoothing to hand landmarks
 * to reduce jitter in hand tracking
 */
export class LandmarkSmoother {
  private smoothedHands: Map<string, HandLandmark[]> = new Map();
  private alpha: number;

  constructor(smoothingFactor: number = 0.4) {
    // Alpha determines how much weight the new value gets
    // Higher alpha = more responsive but jittery
    // Lower alpha = smoother but more latency
    this.alpha = smoothingFactor;
  }

  setAlpha(alpha: number): void {
    this.alpha = Math.max(0.1, Math.min(1.0, alpha));
  }

  smooth(hands: Hand[]): Hand[] {
    const smoothedHands: Hand[] = [];
    const currentHandKeys = new Set<string>();

    for (const hand of hands) {
      const key = hand.handedness;
      currentHandKeys.add(key);

      const previousLandmarks = this.smoothedHands.get(key);
      let smoothedLandmarks: HandLandmark[];

      if (previousLandmarks) {
        // Apply EMA smoothing
        smoothedLandmarks = hand.landmarks.map((landmark, index) => {
          const prev = previousLandmarks[index];
          return {
            x: this.ema(prev.x, landmark.x),
            y: this.ema(prev.y, landmark.y),
            z: this.ema(prev.z, landmark.z),
            visibility: landmark.visibility,
          };
        });
      } else {
        // First frame for this hand - no smoothing
        smoothedLandmarks = [...hand.landmarks];
      }

      this.smoothedHands.set(key, smoothedLandmarks);
      smoothedHands.push({
        ...hand,
        landmarks: smoothedLandmarks,
      });
    }

    // Remove hands that are no longer present
    for (const key of this.smoothedHands.keys()) {
      if (!currentHandKeys.has(key)) {
        this.smoothedHands.delete(key);
      }
    }

    return smoothedHands;
  }

  private ema(previous: number, current: number): number {
    return this.alpha * current + (1 - this.alpha) * previous;
  }

  /**
   * Smooth a single point value
   */
  smoothPoint(previous: Point | null, current: Point): Point {
    if (!previous) {
      return current;
    }
    return {
      x: this.ema(previous.x, current.x),
      y: this.ema(previous.y, current.y),
    };
  }

  /**
   * Smooth a single numeric value
   */
  smoothValue(previous: number | null, current: number): number {
    if (previous === null) {
      return current;
    }
    return this.ema(previous, current);
  }

  reset(): void {
    this.smoothedHands.clear();
  }
}

/**
 * Utility class for tracking velocity of points (useful for gesture recognition)
 */
export class VelocityTracker {
  private history: Point[] = [];
  private maxHistory: number;

  constructor(maxHistory: number = 5) {
    this.maxHistory = maxHistory;
  }

  addPoint(point: Point): void {
    this.history.push(point);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  getVelocity(): Point {
    if (this.history.length < 2) {
      return { x: 0, y: 0 };
    }

    const first = this.history[0];
    const last = this.history[this.history.length - 1];
    const frames = this.history.length - 1;

    return {
      x: (last.x - first.x) / frames,
      y: (last.y - first.y) / frames,
    };
  }

  getSpeed(): number {
    const velocity = this.getVelocity();
    return Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
  }

  reset(): void {
    this.history = [];
  }
}
