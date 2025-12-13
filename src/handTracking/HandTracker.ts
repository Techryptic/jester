import { Hands } from '@mediapipe/hands';
import type { Results, NormalizedLandmark } from '@mediapipe/hands';
import type { Hand, HandLandmark } from '../types';

export class HandTracker {
  private hands: Hands | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private latestHands: Hand[] = [];
  private onResultsCallback: ((hands: Hand[]) => void) | null = null;
  private isProcessing = false;

  async initialize(videoElement: HTMLVideoElement): Promise<void> {
    this.videoElement = videoElement;

    this.hands = new Hands({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      },
    });

    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });

    this.hands.onResults((results: Results) => {
      this.processResults(results);
    });

    // Wait for the model to load
    await this.hands.initialize();
  }

  setResultsCallback(callback: (hands: Hand[]) => void): void {
    this.onResultsCallback = callback;
  }

  private processResults(results: Results): void {
    const hands: Hand[] = [];

    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];
        const handedness = results.multiHandedness[i];

        // MediaPipe reports handedness from the camera's perspective
        // We mirror the video, so we need to swap left/right
        const actualHandedness = handedness.label === 'Left' ? 'Right' : 'Left';

        const handLandmarks: HandLandmark[] = landmarks.map((lm: NormalizedLandmark) => ({
          // Mirror the x coordinate since video is mirrored
          x: 1 - lm.x,
          y: lm.y,
          z: lm.z,
          visibility: lm.visibility,
        }));

        hands.push({
          landmarks: handLandmarks,
          handedness: actualHandedness as 'Left' | 'Right',
          confidence: handedness.score,
        });
      }
    }

    this.latestHands = hands;

    if (this.onResultsCallback) {
      this.onResultsCallback(hands);
    }
  }

  async processFrame(): Promise<void> {
    if (!this.hands || !this.videoElement || this.isProcessing) {
      return;
    }

    if (this.videoElement.readyState < 2) {
      return;
    }

    this.isProcessing = true;
    try {
      await this.hands.send({ image: this.videoElement });
    } catch (error) {
      console.error('Error processing frame:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  getHands(): Hand[] {
    return this.latestHands;
  }

  destroy(): void {
    if (this.hands) {
      this.hands.close();
      this.hands = null;
    }
    this.videoElement = null;
    this.latestHands = [];
    this.onResultsCallback = null;
  }
}
