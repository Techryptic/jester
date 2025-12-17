// === Basic Types ===
export type Point = { x: number; y: number };

export type HandLandmark = Point & {
  z: number;
  visibility?: number;
};

export type Hand = {
  landmarks: HandLandmark[];
  handedness: 'Left' | 'Right';
  confidence: number;
};

// === MediaPipe Landmark Indices ===
export const LANDMARK = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

export const FINGERTIPS = [
  LANDMARK.THUMB_TIP,
  LANDMARK.INDEX_TIP,
  LANDMARK.MIDDLE_TIP,
  LANDMARK.RING_TIP,
  LANDMARK.PINKY_TIP,
];

// === Gesture Events ===
export type GestureEventType = 
  | 'DRAW_START' 
  | 'DRAW_MOVE' 
  | 'DRAW_END' 
  | 'ERASE' 
  | 'PAN' 
  | 'ZOOM' 
  | 'IDLE';

export type DrawStartEvent = { type: 'DRAW_START'; position: Point };
export type DrawMoveEvent = { type: 'DRAW_MOVE'; position: Point };
export type DrawEndEvent = { type: 'DRAW_END'; position: Point };
export type EraseEvent = { type: 'ERASE'; position: Point; radius: number };
export type PanEvent = { type: 'PAN'; delta: Point };
export type ZoomEvent = { type: 'ZOOM'; factor: number; center: Point };
export type IdleEvent = { type: 'IDLE' };

export type GestureEvent = 
  | DrawStartEvent 
  | DrawMoveEvent 
  | DrawEndEvent 
  | EraseEvent 
  | PanEvent 
  | ZoomEvent 
  | IdleEvent;

export type ActiveGesture = 'IDLE' | 'DRAWING' | 'PANNING' | 'ZOOMING' | 'ERASING';

export type GestureState = {
  currentGesture: ActiveGesture;
  rightPinching: boolean;
  leftPinching: boolean;
  rightPalmOpen: boolean;
  leftPalmOpen: boolean;
  lastRightPinchPos: Point | null;
  lastLeftPinchPos: Point | null;
  lastRightPalmPos: Point | null;
  lastLeftPalmPos: Point | null;
  lastPinchDistance: number | null;
  activationFrames: number;
  deactivationFrames: number;
};

// === Whiteboard State ===
export type Stroke = {
  id: string;
  points: Point[];
  color: string;
  thickness: number;
  timestamp: number;
};

export type TemplateType = 'image' | 'grid' | 'dots' | 'lines';

export type GridConfig = {
  spacing: number;
  color: string;
  lineWidth: number;
};

export type TemplateLayer = {
  id: string;
  name: string;
  type: TemplateType;
  src?: string;
  visible: boolean;
  transform: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
  };
  gridConfig?: GridConfig;
};

export type Camera = {
  x: number;
  y: number;
  zoom: number;
};

export type BoardState = {
  strokes: Stroke[];
  templates: TemplateLayer[];
  camera: Camera;
  activeStrokeId: string | null;
};

// Image layer for uploaded images
export type ImageLayer = {
  id: string;
  src: string;  // Base64 data URL
  x: number;    // World position
  y: number;
  width: number;
  height: number;
  opacity: number;
};

// === Configuration ===
export type GestureConfig = {
  pinchThreshold: number;
  palmOpenThreshold: number;
  eraseRadius: number;
  zoomSensitivity: number;
  smoothingFactor: number;
  activationFrames: number;
  deactivationFrames: number;
  panSensitivity: number;
  leftHandedMode: boolean;
};

export type PenConfig = {
  color: string;
  thickness: number;
};

export type DebugConfig = {
  showLandmarks: boolean;
  showGestureState: boolean;
  showFPS: boolean;
  showCamera: boolean;
  showDebugOverlay: boolean;  // Master toggle for the debug box
};

export type GestureToggles = {
  draw: boolean;
  erase: boolean;
  pan: boolean;
  zoom: boolean;
};

export type AspectRatioOption = 'none' | '16:9' | '16:10' | '4:3' | 'custom';

export type AppConfig = {
  gesture: GestureConfig;
  pen: PenConfig;
  debug: DebugConfig;
  gesturesEnabled: boolean;
  gestureToggles: GestureToggles;
  backgroundOpacity: number;
  aspectRatio: AspectRatioOption;  // Aspect ratio lock
  customAspectRatio?: { width: number; height: number };  // For custom ratio
  presentationMode: boolean;  // Hide control panel
};

// === Default Configurations ===
export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  pinchThreshold: 0.05,
  palmOpenThreshold: 0.2,
  eraseRadius: 40,
  zoomSensitivity: 1.5,
  smoothingFactor: 0.4,
  activationFrames: 2,
  deactivationFrames: 2,
  panSensitivity: 2.0,
  leftHandedMode: true,
};

export const DEFAULT_PEN_CONFIG: PenConfig = {
  color: '#ff4444',
  thickness: 4,
};

export const DEFAULT_DEBUG_CONFIG: DebugConfig = {
  showLandmarks: true,
  showGestureState: true,
  showFPS: true,
  showCamera: false,
  showDebugOverlay: true,
};

export const DEFAULT_GESTURE_TOGGLES: GestureToggles = {
  draw: true,
  erase: true,
  pan: true,
  zoom: true,
};

export const DEFAULT_APP_CONFIG: AppConfig = {
  gesture: DEFAULT_GESTURE_CONFIG,
  pen: DEFAULT_PEN_CONFIG,
  debug: DEFAULT_DEBUG_CONFIG,
  gesturesEnabled: true,
  gestureToggles: DEFAULT_GESTURE_TOGGLES,
  backgroundOpacity: 0.9,
  aspectRatio: 'none',
  presentationMode: false,
};

export const DEFAULT_CAMERA: Camera = {
  x: 0,
  y: 0,
  zoom: 1,
};

export const DEFAULT_BOARD_STATE: BoardState = {
  strokes: [],
  templates: [],
  camera: { ...DEFAULT_CAMERA },
  activeStrokeId: null,
};
