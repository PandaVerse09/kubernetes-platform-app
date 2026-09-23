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
