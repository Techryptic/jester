# Gesture-Controlled Whiteboard

A local-only, browser-based application that lets you interact with an infinite 2D whiteboard using hand gestures captured from your webcam.

![Gesture Whiteboard](https://img.shields.io/badge/MediaPipe-Hands-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue) ![Vite](https://img.shields.io/badge/Vite-7.0-purple)

## Features

- **✋ Hand Gesture Control** - Draw, erase, pan, and zoom using natural hand gestures
- **🎨 Drawing Tools** - Customizable pen color and thickness
- **📐 Template Backgrounds** - Choose from blank, grid, dot grid, or lined backgrounds
- **🔍 Infinite Canvas** - Pan and zoom to use as much space as you need
- **🖥️ Fully Local** - All processing happens in your browser, no cloud APIs
- **🐛 Debug Mode** - Visualize hand tracking and gesture recognition

## Gestures

| Gesture | Action |
|---------|--------|
| **Right Hand Pinch** | Draw on the whiteboard |
| **Left Palm Open** | Erase strokes |
| **Right Palm Open** | Pan the canvas |
| **Both Hands Pinch** | Zoom in/out |

## Getting Started

### Prerequisites

- Node.js 18+ 
- A webcam
- Chrome, Edge, or another Chromium-based browser

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd gesture-whiteboard

# Install dependencies
npm install

# Start development server
npm run dev
```

### Production Build

```bash
# Build for production
npm run build

# Preview the production build
npm run preview
```

The built files will be in the `dist/` folder and can be served from any static file server.

## Project Structure

```
src/
├── types/
│   └── index.ts              # TypeScript type definitions
├── handTracking/
│   ├── HandTracker.ts        # MediaPipe Hands wrapper
│   └── LandmarkSmoother.ts   # EMA smoothing for landmarks
├── gestures/
│   └── GestureEngine.ts      # Gesture detection with hysteresis
├── whiteboard/
│   └── WhiteboardEngine.ts   # Board state, camera, strokes
├── rendering/
│   └── Renderer.ts           # Canvas rendering
├── ui/
│   └── UIManager.ts          # Control panel UI
├── main.ts                   # Application entry point
└── style.css                 # Global styles
```

## Architecture

### Hand Tracking
Uses MediaPipe Hands for real-time hand landmark detection. The model runs entirely in the browser using WebAssembly and WebGL.

### Gesture Engine
Processes hand landmarks to detect gestures:
- **Pinch Detection**: Measures distance between thumb and index finger tips
- **Palm Open Detection**: Checks if all fingers are extended
- **Hysteresis**: Prevents flickering by requiring gestures to be stable for multiple frames

### Whiteboard Engine
Manages the canvas state:
- **Strokes**: Vector-based drawings stored as arrays of points
- **Camera**: Handles pan and zoom with coordinate transforms
- **Templates**: Programmatic grid/dot/line backgrounds

### Coordinate Systems
- **Normalized Space (0-1)**: From MediaPipe hand tracking
- **Screen Space**: Canvas pixel coordinates
- **World Space**: Infinite logical coordinates for the whiteboard

## Configuration

The control panel provides access to all configuration options:

### Pen Settings
- Color picker for stroke color
- Thickness slider (1-30px)

### Background Templates
- Blank (white)
- Grid
- Dot Grid
- Lined

### Debug Options
- Show/hide hand landmarks
- Show/hide gesture state
- Show/hide FPS counter
- Show/hide camera info

### Advanced Tuning
- Pinch threshold (gesture sensitivity)
- Palm threshold
- Erase radius
- Smoothing factor

## Technical Details

### Performance Targets
- Hand tracking: ≥15 FPS
- Rendering: ≥30 FPS
- Gesture latency: ~150-250ms

### Browser Requirements
- WebGL 2.0 support
- WebAssembly support
- getUserMedia API (webcam access)

## Future Improvements

These features are out of scope for the MVP but could be added:

- [ ] Undo/Redo functionality
- [ ] Save/Load boards to local storage
- [ ] Export to PNG/SVG
- [ ] Virtual camera output
- [ ] Multiple pen tools (highlighter, shapes)
- [ ] Collaborative mode

## License

MIT License - feel free to use and modify as needed.

## Acknowledgments

- [MediaPipe](https://mediapipe.dev/) for the hand tracking model
- [Vite](https://vitejs.dev/) for the blazing fast build tool
