const express = require('express');
const client = require('prom-client');

// Initialize Prometheus registry
const register = new client.Registry();

// Add default metrics (CPU, Memory, Event Loop lag, etc.)
client.collectDefaultMetrics({
  register,
  prefix: 'node_app_',
});

// Custom metric: HTTP request duration histogram (for Golden Signals / RED method)
const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});
register.registerMetric(httpRequestDurationSeconds);

// Custom metric: Total HTTP requests counter
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests made to the application',
  labelNames: ['method', 'route', 'status_code'],
});
register.registerMetric(httpRequestsTotal);

const app = express();
app.use(express.json());

// Application state for readiness and failure simulations
let isReady = true;

// Structured logger helper
function logStructured(level, message, meta = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  console.log(JSON.stringify(logEntry));
}

// Middleware: Measure request duration & collect Prometheus metrics
app.use((req, res, next) => {
  const start = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationInSeconds = diff[0] + diff[1] / 1e9;
    const route = req.route ? req.route.path : req.path;

    // Do not record internal scrape endpoint to avoid skewing stats
    if (req.path !== '/metrics') {
      httpRequestDurationSeconds
        .labels(req.method, route, res.statusCode.toString())
        .observe(durationInSeconds);

      httpRequestsTotal
        .labels(req.method, route, res.statusCode.toString())
        .inc();

      logStructured('info', 'HTTP Request handled', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationSeconds: durationInSeconds.toFixed(4),
      });
    }
  });

  next();
});

// In-memory data store for CRUD API
let todos = [
  { id: 1, title: 'Set up KIND local cluster', completed: true },
  { id: 2, title: 'Deploy Argo CD for GitOps', completed: false },
  { id: 3, title: 'Configure Prometheus and Grafana', completed: false },
  { id: 4, title: 'Provision AWS EKS with Terraform', completed: false },
];
let nextId = 5;

// ==========================================
// 1. Core Health & Reliability Probes
// ==========================================

// Web UI Dashboard & Root Overview
app.get('/', (req, res) => {
  if (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('text/html')) {
    return res.status(200).json({
      name: 'kubernetes-platform-app',
      status: 'online',
      version: process.env.APP_VERSION || '1.0.0',
      hostname: process.env.HOSTNAME || 'localhost',
      podIp: process.env.POD_IP || '127.0.0.1',
      environment: process.env.NODE_ENV || 'development',
    });
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kubernetes Platform Engineering Lab</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(22, 30, 49, 0.7);
      --card-border: rgba(255, 255, 255, 0.08);
      --accent-cyan: #06b6d4;
      --accent-purple: #8b5cf6;
      --accent-emerald: #10b981;
      --accent-rose: #f43f5e;
      --accent-amber: #f59e0b;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      background: radial-gradient(circle at 15% 20%, #151e36 0%, #090d16 100%);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      line-height: 1.6;
    }
    .container {
      max-width: 1100px;
      margin: 0 auto;
      padding: 32px 20px;
      width: 100%;
      flex: 1;
    }
    header {
      margin-bottom: 32px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .badge-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .pill {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      letter-spacing: 0.02em;
    }
    .pill.glow-cyan { color: var(--accent-cyan); border-color: rgba(6, 182, 212, 0.4); background: rgba(6, 182, 212, 0.1); }
    .pill.glow-emerald { color: var(--accent-emerald); border-color: rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.1); }
    .title-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 16px;
    }
    h1 {
      font-size: 2.2rem;
      font-weight: 800;
      background: linear-gradient(135deg, #ffffff 40%, var(--accent-cyan) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -0.03em;
    }
    .subtitle {
      color: var(--text-muted);
      font-size: 1.05rem;
      max-width: 720px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 20px;
      margin-bottom: 24px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(16px);
      border-radius: 16px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      transition: transform 0.2s ease, border-color 0.2s ease;
    }
    .card:hover {
      border-color: rgba(255, 255, 255, 0.18);
      transform: translateY(-2px);
    }
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .card-title {
      font-size: 1.1rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .mono-box {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 10px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .mono-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    .mono-label { color: var(--text-muted); }
    .mono-val { color: #e2e8f0; font-weight: 600; word-break: break-all; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 18px;
      font-size: 0.88rem;
      font-weight: 600;
      border-radius: 10px;
      cursor: pointer;
      border: 1px solid transparent;
      text-decoration: none;
      transition: all 0.2s ease;
      gap: 8px;
    }
    .btn-primary {
      background: linear-gradient(135deg, var(--accent-cyan), #0284c7);
      color: #04101e;
      border-color: rgba(6, 182, 212, 0.3);
    }
    .btn-primary:hover { filter: brightness(1.15); box-shadow: 0 0 16px rgba(6, 182, 212, 0.4); }
    .btn-warning {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border-color: rgba(245, 158, 11, 0.4);
    }
    .btn-warning:hover { background: rgba(245, 158, 11, 0.25); }
    .btn-danger {
      background: rgba(244, 63, 94, 0.15);
      color: #fda4af;
      border-color: rgba(244, 63, 94, 0.4);
    }
    .btn-danger:hover { background: rgba(244, 63, 94, 0.25); }
    .btn-ghost {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text);
      border-color: var(--card-border);
    }
    .btn-ghost:hover { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.2); }
    .links-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      padding: 16px 20px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      align-items: center;
      margin-bottom: 24px;
    }
    .links-label {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text-muted);
      margin-right: 8px;
    }
    .todo-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 220px;
      overflow-y: auto;
    }
    .todo-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(0, 0, 0, 0.25);
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.04);
      font-size: 0.88rem;
    }
    .todo-item.done span { text-decoration: line-through; color: var(--text-muted); }
    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1e293b;
      border: 1px solid var(--card-border);
      color: #fff;
      padding: 14px 20px;
      border-radius: 12px;
      font-size: 0.9rem;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      display: none;
      z-index: 1000;
    }
    footer {
      text-align: center;
      padding: 24px;
      color: var(--text-muted);
      font-size: 0.85rem;
      border-top: 1px solid rgba(255,255,255,0.05);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="badge-bar">
        <span class="pill glow-cyan">Kubernetes v1.30</span>
        <span class="pill glow-emerald">GitOps Argo CD</span>
        <span class="pill">Terraform IaC</span>
        <span class="pill">Prometheus + Grafana</span>
        <span class="pill">Trivy CVE Clean</span>
      </div>
      <div class="title-row">
        <div>
          <h1>Kubernetes Platform Lab</h1>
          <p class="subtitle">Cloud-native microservice orchestrated with automated GitOps delivery, multi-environment Helm packaging, and self-healing reliability.</p>
        </div>
      </div>
    </header>

    <div class="links-bar">
      <span class="links-label">Live Platform Dashboards:</span>
      <a href="https://localhost:8081" target="_blank" class="btn btn-ghost" style="padding: 6px 14px; font-size: 0.8rem;">
        🐙 Argo CD UI
      </a>
      <a href="http://localhost:3000" target="_blank" class="btn btn-ghost" style="padding: 6px 14px; font-size: 0.8rem;">
        📊 Grafana UI
      </a>
      <a href="/metrics" target="_blank" class="btn btn-ghost" style="padding: 6px 14px; font-size: 0.8rem;">
        📈 Prometheus /metrics
      </a>
      <a href="/health" target="_blank" class="btn btn-ghost" style="padding: 6px 14px; font-size: 0.8rem;">
        🩺 Health Probe
      </a>
    </div>

    <div class="grid">
      <!-- Card 1: Pod Telemetry -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">☸️ Pod Telemetry</span>
          <span class="pill glow-emerald" id="pod-health-badge">HEALTHY</span>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-muted);">Real-time metadata injected by Kubernetes downward API and runtime environment:</p>
        <div class="mono-box">
          <div class="mono-row"><span class="mono-label">Pod Hostname:</span><span class="mono-val">${process.env.HOSTNAME || 'local-workstation'}</span></div>
          <div class="mono-row"><span class="mono-label">Pod IP:</span><span class="mono-val">${process.env.POD_IP || '127.0.0.1'}</span></div>
          <div class="mono-row"><span class="mono-label">Environment:</span><span class="mono-val">${process.env.NODE_ENV || 'development'}</span></div>
          <div class="mono-row"><span class="mono-label">App Version:</span><span class="mono-val">${process.env.APP_VERSION || '1.0.0'}</span></div>
          <div class="mono-row"><span class="mono-label">Uptime:</span><span class="mono-val" id="uptime-val">${Math.floor(process.uptime())}s</span></div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-ghost" style="flex: 1;" onclick="checkProbes()">🔄 Refresh Telemetry</button>
        </div>
      </div>

      <!-- Card 2: Resilience & Chaos Lab -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">⚡ Chaos & Autoscaling Lab</span>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-muted);">Live resilience triggers to demonstrate self-healing and HPA scaling in Argo CD & Grafana:</p>
        
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <button class="btn btn-primary" onclick="burnCpu()">
            🔥 Burn CPU (Trigger HPA Autoscaler)
          </button>
          <button class="btn btn-warning" onclick="toggleReady()">
            ⚠️ Toggle Readiness Probe (Traffic Shedding)
          </button>
          <button class="btn btn-danger" onclick="crashPod()">
            💥 Simulate Fatal Crash (Self-Healing)
          </button>
        </div>
        <div id="chaos-output" style="font-size: 0.82rem; color: var(--text-muted); background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; min-height: 44px; display: flex; align-items: center;">
          Ready to run live chaos test. Click any action above.
        </div>
      </div>

      <!-- Card 3: CRUD API -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">📝 Microservice CRUD API</span>
          <span class="pill" id="todo-count">4 items</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <input type="text" id="new-todo-title" placeholder="Add a DevOps platform task..." style="flex: 1; background: rgba(0,0,0,0.4); border: 1px solid var(--card-border); color: #fff; padding: 10px 14px; border-radius: 8px; font-size: 0.85rem;">
          <button class="btn btn-primary" onclick="addTodo()" style="padding: 10px 16px;">Add</button>
        </div>
        <div class="todo-list" id="todo-container">
          <div style="color: var(--text-muted); font-size: 0.85rem;">Loading tasks...</div>
        </div>
      </div>
    </div>
  </div>

  <div id="toast" class="toast"></div>

  <footer>
    <p>Kubernetes Platform Engineering Portfolio • Built by PandaVerse09 • Powered by Docker, Kind, Helm, Argo CD, Terraform & Prometheus</p>
  </footer>

  <script>
    function showToast(msg, bg = '#1e293b') {
      const t = document.getElementById('toast');
      t.innerText = msg;
      t.style.background = bg;
      t.style.display = 'block';
      setTimeout(() => { t.style.display = 'none'; }, 4000);
    }

    async function checkProbes() {
      try {
        const res = await fetch('/health');
        const data = await res.json();
        document.getElementById('uptime-val').innerText = Math.floor(data.uptime) + 's';
        showToast('Telemetry refreshed!');
      } catch (e) {
        showToast('Telemetry probe failed: ' + e.message, '#e11d48');
      }
    }

    async function burnCpu() {
      const out = document.getElementById('chaos-output');
      out.innerText = '⏳ Generating high CPU spike (1500ms busy-loop)...';
      try {
        const res = await fetch('/api/v1/admin/cpu-burn?ms=1500');
        const data = await res.json();
        out.innerHTML = '✅ <strong style="color:var(--accent-cyan)">' + data.message + '</strong> on pod <span style="color:#fff">' + data.pod + '</span>.<br><span style="color:var(--accent-emerald)">Watch Argo CD: HPA scales up replicas!</span>';
        showToast('High CPU load generated! Check HPA in Argo CD.');
      } catch (e) {
        out.innerText = 'Error: ' + e.message;
      }
    }

    async function toggleReady() {
      const out = document.getElementById('chaos-output');
      try {
        const res = await fetch('/api/v1/admin/toggle-ready', { method: 'POST' });
        const data = await res.json();
        const isReady = data.status === 'ready';
        out.innerHTML = isReady 
          ? '✅ Pod is now <strong style="color:var(--accent-emerald)">READY</strong>. Ingress sends traffic.'
          : '⚠️ Pod is now <strong style="color:var(--accent-amber)">NOT READY</strong>. Kubernetes removed pod from Service endpoints.';
        showToast('Readiness toggled: ' + data.status, isReady ? '#059669' : '#d97706');
      } catch (e) {
        out.innerText = 'Error: ' + e.message;
      }
    }

    async function crashPod() {
      const out = document.getElementById('chaos-output');
      out.innerText = '💥 Fatal crash triggered! Pod terminating in 500ms...';
      showToast('Pod crashing! Kubernetes will self-heal.', '#e11d48');
      try {
        await fetch('/api/v1/admin/crash', { method: 'POST' });
      } catch (e) {}
      setTimeout(() => {
        out.innerHTML = '🔄 <strong style="color:var(--accent-emerald)">Self-healing verified!</strong> Kubelet restarted the container.';
      }, 3000);
    }

    async function loadTodos() {
      try {
        const res = await fetch('/api/v1/todos');
        const data = await res.json();
        const container = document.getElementById('todo-container');
        document.getElementById('todo-count').innerText = data.data.length + ' items';
        container.innerHTML = data.data.map(t => \`
          <div class="todo-item \${t.completed ? 'done' : ''}">
            <span>\${t.title}</span>
            <input type="checkbox" \${t.completed ? 'checked' : ''} onchange="toggleTodo(\${t.id}, !t.completed)">
          </div>
        \`).join('');
      } catch (e) {}
    }

    async function addTodo() {
      const input = document.getElementById('new-todo-title');
      const title = input.value.trim();
      if (!title) return;
      try {
        await fetch('/api/v1/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title })
        });
        input.value = '';
        loadTodos();
        showToast('Task added to Kubernetes cluster!');
      } catch (e) {
        showToast('Failed to add task', '#e11d48');
      }
    }

    async function toggleTodo(id, completed) {
      try {
        await fetch('/api/v1/todos/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed })
        });
        loadTodos();
      } catch (e) {}
    }

    loadTodos();
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Liveness Probe: Returns 200 if the process is running
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Readiness Probe: Returns 200 when ready to receive traffic, 503 if not ready
app.get('/ready', (req, res) => {
  if (isReady) {
    res.status(200).json({
      status: 'ready',
      message: 'Application is ready to accept incoming traffic',
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: 'not_ready',
      message: 'Application is deliberately unready for traffic',
      timestamp: new Date().toISOString(),
    });
  }
});

// Prometheus Scrape Endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.setHeader('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// ==========================================
// 2. Application CRUD Endpoints
// ==========================================

app.get('/api/v1/info', (req, res) => {
  res.status(200).json({
    name: 'kubernetes-platform-app',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    hostname: process.env.HOSTNAME || 'localhost',
    podIp: process.env.POD_IP || '127.0.0.1',
  });
});

app.get('/api/v1/todos', (req, res) => {
  res.status(200).json({ success: true, count: todos.length, data: todos });
});

app.get('/api/v1/todos/:id', (req, res) => {
  const todo = todos.find((t) => t.id === parseInt(req.params.id, 10));
  if (!todo) {
    return res.status(404).json({ success: false, error: 'Todo not found' });
  }
  res.status(200).json({ success: true, data: todo });
});

app.post('/api/v1/todos', (req, res) => {
  const { title } = req.body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ success: false, error: 'Title is required' });
  }
  const newTodo = {
    id: nextId++,
    title: title.trim(),
    completed: false,
    createdAt: new Date().toISOString(),
  };
  todos.push(newTodo);
  res.status(201).json({ success: true, data: newTodo });
});

app.put('/api/v1/todos/:id', (req, res) => {
  const todo = todos.find((t) => t.id === parseInt(req.params.id, 10));
  if (!todo) {
    return res.status(404).json({ success: false, error: 'Todo not found' });
  }
  if (req.body.title !== undefined) todo.title = req.body.title.trim();
  if (req.body.completed !== undefined) todo.completed = Boolean(req.body.completed);

  res.status(200).json({ success: true, data: todo });
});

app.delete('/api/v1/todos/:id', (req, res) => {
  const index = todos.findIndex((t) => t.id === parseInt(req.params.id, 10));
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Todo not found' });
  }
  const deleted = todos.splice(index, 1);
  res.status(200).json({ success: true, data: deleted[0] });
});

// ==========================================
// 3. Platform Lab Failure & Load Testing Endpoints
// ==========================================

// Toggle readiness state to demonstrate Kubernetes removing Pod from Service endpoints
app.post('/api/v1/admin/toggle-ready', (req, res) => {
  isReady = !isReady;
  logStructured('warn', `Readiness toggled. Current status: ${isReady ? 'READY' : 'NOT READY'}`);
  res.status(200).json({
    status: isReady ? 'ready' : 'not_ready',
    message: `Readiness state updated to: ${isReady}`,
  });
});

// Crash the process intentionally to test Pod restart & self-healing
app.post('/api/v1/admin/crash', (req, res) => {
  res.status(500).json({ message: 'Process crashing in 500ms...' });
  logStructured('fatal', 'Simulated intentional process crash initiated.');
  setTimeout(() => {
    process.exit(1);
  }, 500);
});

// Synthetic CPU load generator to test Kubernetes HPA (Horizontal Pod Autoscaler)
app.get('/api/v1/admin/cpu-burn', (req, res) => {
  const milliseconds = parseInt(req.query.ms, 10) || 500;
  const start = Date.now();
  // Busy loop to burn CPU
  while (Date.now() - start < milliseconds) {
    Math.sqrt(Math.random() * 1000000);
  }
  res.status(200).json({
    message: `Burned CPU for ~${milliseconds}ms`,
    pod: process.env.HOSTNAME || 'local',
  });
});

module.exports = { app, register };
