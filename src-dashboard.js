import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class DashboardServer {
  constructor(port = 3000) {
    this.port = port;
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.clients = new Set();
    this.setupRoutes();
    this.setupWebSocket();
  }

  setupRoutes() {
    // Serve static files
    this.app.use(express.static(path.join(__dirname, 'dashboard')));

    // API routes
    this.app.get('/api/status', (req, res) => {
      res.json({
        status: 'running',
        timestamp: new Date().toISOString()
      });
    });

    this.app.get('/api/metrics', (req, res) => {
      res.json({
        pages: 0,
        assets: 0,
        bandwidth: 0,
        memory: 0
      });
    });

    // HTML dashboard
    this.app.get('/', (req, res) => {
      res.send(this.getDashboardHTML());
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      
      ws.on('message', (data) => {
        // Handle client messages
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });
    });
  }

  broadcast(data) {
    const message = JSON.stringify(data);
    for (const client of this.clients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    }
  }

  updateMetrics(metrics) {
    this.broadcast({
      type: 'metrics',
      data: metrics
    });
  }

  updateProgress(progress) {
    this.broadcast({
      type: 'progress',
      data: progress
    });
  }

  start() {
    this.server.listen(this.port, () => {
      console.log(`\n📊 Dashboard available at http://localhost:${this.port}\n`);
    });
  }

  stop() {
    this.server.close();
  }

  getDashboardHTML() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zygor Scarper Dashboard</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #333;
      min-height: 100vh;
      padding: 20px;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
    }

    header {
      background: white;
      border-radius: 8px;
      padding: 30px;
      margin-bottom: 30px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    h1 {
      color: #667eea;
      margin-bottom: 10px;
    }

    .status-badge {
      display: inline-block;
      background: #10b981;
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }

    .metric-card {
      background: white;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .metric-label {
      color: #999;
      font-size: 14px;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .metric-value {
      font-size: 32px;
      font-weight: 700;
      color: #667eea;
    }

    .progress-section {
      background: white;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .progress-bar {
      width: 100%;
      height: 8px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
      margin: 20px 0;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      width: 0%;
      transition: width 0.3s ease;
    }

    .activity-log {
      background: white;
      border-radius: 8px;
      padding: 20px;
      margin-top: 30px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      max-height: 400px;
      overflow-y: auto;
    }

    .log-entry {
      padding: 12px;
      border-left: 4px solid #667eea;
      margin-bottom: 8px;
      background: #f9fafb;
      border-radius: 4px;
    }

    .log-time {
      color: #999;
      font-size: 12px;
    }

    .log-message {
      margin-top: 4px;
      color: #333;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid #e5e7eb;
      border-top-color: #667eea;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    .status-online::before {
      content: '';
      display: inline-block;
      width: 8px;
      height: 8px;
      background: #10b981;
      border-radius: 50%;
      margin-right: 8px;
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🔥 Zygor Scarper Dashboard</h1>
      <div class="status-badge status-online">Live Monitoring</div>
    </header>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Pages Downloaded</div>
        <div class="metric-value" id="pages">0</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Assets Downloaded</div>
        <div class="metric-value" id="assets">0</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Data Size</div>
        <div class="metric-value" id="dataSize">0 MB</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Speed</div>
        <div class="metric-value" id="speed">0 MB/s</div>
      </div>
    </div>

    <div class="progress-section">
      <h2>Progress</h2>
      <p>Pages: <span id="progressText">0/500</span></p>
      <div class="progress-bar">
        <div class="progress-fill" id="progressBar"></div>
      </div>
      <p>Errors: <span id="errors">0</span> | ETA: <span id="eta">Calculating...</span></p>
    </div>

    <div class="activity-log">
      <h2>Activity Log</h2>
      <div id="logContainer"></div>
    </div>
  </div>

  <script>
    const ws = new WebSocket('ws://' + window.location.host);
    const logContainer = document.getElementById('logContainer');

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'metrics') {
        updateMetrics(message.data);
      } else if (message.type === 'progress') {
        updateProgress(message.data);
      }
    };

    function updateMetrics(data) {
      document.getElementById('pages').textContent = data.pages || 0;
      document.getElementById('assets').textContent = data.assets || 0;
      document.getElementById('dataSize').textContent = formatBytes(data.totalBytes) || '0 MB';
      document.getElementById('speed').textContent = formatBytes(data.bandwidth) + '/s' || '0 MB/s';
      document.getElementById('errors').textContent = data.errors || 0;
    }

    function updateProgress(data) {
      const percent = (data.current / data.total) * 100;
      document.getElementById('progressBar').style.width = percent + '%';
      document.getElementById('progressText').textContent = data.current + '/' + data.total;
      document.getElementById('eta').textContent = data.eta + 's' || 'Calculating...';
    }

    function addLogEntry(message, level = 'info') {
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      entry.innerHTML = \`
        <div class="log-time">\${new Date().toLocaleTimeString()}</div>
        <div class="log-message">\${message}</div>
      \`;
      logContainer.insertBefore(entry, logContainer.firstChild);
      
      // Keep only last 50 entries
      while (logContainer.children.length > 50) {
        logContainer.removeChild(logContainer.lastChild);
      }
    }

    function formatBytes(bytes) {
      if (!bytes) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
    }

    // Initial log message
    addLogEntry('Dashboard connected and ready for monitoring...');
  </script>
</body>
</html>
    `;
  }
}

export default DashboardServer;
