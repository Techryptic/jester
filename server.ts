import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { networkInterfaces } from 'os';
import path from 'path';

const app = express();
const PORT = 3000;

// Serve static files from dist folder
app.use(express.static(path.join(process.cwd(), 'dist')));

// Serve the iPad draw page
app.get('/draw', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'dist', 'draw.html'));
});

// Fallback to index.html for SPA routing (Express 5 syntax)
app.get('/{*path}', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
});

const server = createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server });

// Track connected clients
const clients = new Set<WebSocket>();

// Message types
interface SyncMessage {
  type: 'stroke' | 'stroke_update' | 'stroke_end' | 'clear' | 'ping' | 'connection';
  data?: unknown;
  clientId?: string;
}

wss.on('connection', (ws: WebSocket) => {
  clients.add(ws);
  
  const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log(`Client connected: ${clientId} (Total: ${clients.size})`);
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connection',
    data: { clientId, totalClients: clients.size }
  }));

  // Broadcast new client count to all
  broadcast({
    type: 'connection',
    data: { totalClients: clients.size }
  }, ws);

  ws.on('message', (message: Buffer) => {
    try {
      const parsed: SyncMessage = JSON.parse(message.toString());
      
      // Add client ID to message
      parsed.clientId = clientId;
      
      // Broadcast to all OTHER clients
      broadcast(parsed, ws);
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`Client disconnected: ${clientId} (Total: ${clients.size})`);
    
    // Broadcast updated client count
    broadcast({
      type: 'connection',
      data: { totalClients: clients.size }
    });
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// Broadcast message to all clients except sender
function broadcast(message: SyncMessage, exclude?: WebSocket): void {
  const messageStr = JSON.stringify(message);
  clients.forEach((client) => {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

// Get local IP address for display
function getLocalIP(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    const netInfo = nets[name];
    if (!netInfo) continue;
    for (const net of netInfo) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('\n🖐️  Gesture Whiteboard Server Started!\n');
  console.log('📱 Desktop (main app):');
  console.log(`   http://localhost:${PORT}`);
  console.log(`   http://${localIP}:${PORT}\n`);
  console.log('✏️  iPad/Tablet (drawing):');
  console.log(`   http://${localIP}:${PORT}/draw\n`);
  console.log('Make sure both devices are on the same WiFi network.\n');
});
