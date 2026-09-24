const request = require('supertest');
const { app } = require('../src/app');

describe('API Health and Observability Endpoints', () => {
  it('GET /health returns 200 and healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.uptime).toBeDefined();
  });

  it('GET /ready returns 200 when ready', async () => {
    const res = await request(app).get('/ready');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  it('GET /metrics returns Prometheus formatted metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('node_app_');
    expect(res.text).toContain('http_requests_total');
  });

  it('GET /api/v1/info returns system metadata', async () => {
    const res = await request(app).get('/api/v1/info');
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('kubernetes-platform-app');
    expect(res.body.version).toBeDefined();
  });

  it('GET / returns 200 and HTML dashboard', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Kubernetes Platform');
  });

  it('GET / with Accept: application/json returns system summary JSON', async () => {
    const res = await request(app)
      .get('/')
      .set('Accept', 'application/json');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('online');
    expect(res.body.name).toBe('kubernetes-platform-app');
  });
});

describe('CRUD Operations (/api/v1/todos)', () => {
  it('GET /api/v1/todos returns array of todos', async () => {
    const res = await request(app).get('/api/v1/todos');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /api/v1/todos creates a new todo item', async () => {
    const res = await request(app)
      .post('/api/v1/todos')
      .send({ title: 'Write automated unit tests' });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Write automated unit tests');
    expect(res.body.data.completed).toBe(false);
  });

  it('POST /api/v1/todos fails with 400 when title is missing', async () => {
    const res = await request(app).post('/api/v1/todos').send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('PUT /api/v1/todos/:id updates an existing todo', async () => {
    const res = await request(app)
      .put('/api/v1/todos/1')
      .send({ completed: true });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.completed).toBe(true);
  });

  it('DELETE /api/v1/todos/:id removes an item', async () => {
    const res = await request(app).delete('/api/v1/todos/2');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Failure Simulation Endpoints', () => {
  it('POST /api/v1/admin/toggle-ready toggles readiness to not_ready', async () => {
    const res = await request(app).post('/api/v1/admin/toggle-ready');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('not_ready');

    const checkReady = await request(app).get('/ready');
    expect(checkReady.statusCode).toBe(503);

    // Toggle back to ready
    const restore = await request(app).post('/api/v1/admin/toggle-ready');
    expect(restore.body.status).toBe('ready');
  });
});
