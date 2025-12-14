import type { Point, Stroke } from '../types';

export interface SyncMessage {
  type: 'stroke' | 'stroke_update' | 'stroke_end' | 'clear' | 'connection';
  data?: unknown;
  clientId?: string;
}

export interface StrokeData {
  id: string;
  points: Point[];
  color: string;
  thickness: number;
}

type SyncEventCallback = (event: SyncMessage) => void;

export class SyncClient {
  private ws: WebSocket | null = null;
  private listeners: SyncEventCallback[] = [];
  private reconnectTimeout: number | null = null;
  private isConnected = false;
  private pendingStrokes: Map<string, StrokeData> = new Map();

  connect(): void {
    // Don't connect if already connected or if no WebSocket support
    if (this.ws || typeof WebSocket === 'undefined') return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        console.log('[Sync] Connected to server');
        this.emit({ type: 'connection', data: { connected: true } });
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.ws = null;
        console.log('[Sync] Disconnected from server');
        this.emit({ type: 'connection', data: { connected: false } });

        // Try to reconnect after 3 seconds
        this.reconnectTimeout = window.setTimeout(() => {
          this.connect();
        }, 3000);
      };

      this.ws.onerror = (error) => {
        console.error('[Sync] WebSocket error:', error);
      };

      this.ws.onmessage = (event) => {
        try {
          const message: SyncMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('[Sync] Failed to parse message:', error);
        }
      };
    } catch (error) {
      console.error('[Sync] Failed to connect:', error);
    }
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  private handleMessage(message: SyncMessage): void {
    // Process stroke messages
    if (message.type === 'stroke') {
      const data = message.data as StrokeData;
      this.pendingStrokes.set(data.id, {
        id: data.id,
        points: [...data.points],
        color: data.color,
        thickness: data.thickness,
      });
    } else if (message.type === 'stroke_update') {
      const data = message.data as { id: string; point: Point };
      const stroke = this.pendingStrokes.get(data.id);
      if (stroke) {
        stroke.points.push(data.point);
      }
    } else if (message.type === 'stroke_end') {
      const data = message.data as { id: string };
      // Stroke is complete, it will be picked up by the main app
    }

    // Emit to listeners
    this.emit(message);
  }

  onMessage(callback: SyncEventCallback): () => void {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private emit(message: SyncMessage): void {
    for (const listener of this.listeners) {
      listener(message);
    }
  }

  send(type: string, data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }

  getPendingStroke(id: string): StrokeData | undefined {
    return this.pendingStrokes.get(id);
  }

  getCompletedStrokes(): StrokeData[] {
    return Array.from(this.pendingStrokes.values());
  }

  clearPendingStroke(id: string): void {
    this.pendingStrokes.delete(id);
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}
