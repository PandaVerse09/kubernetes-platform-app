const { app } = require('./app');

const PORT = parseInt(process.env.PORT, 10) || 8080;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: `Server started successfully`,
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '1.0.0',
  }));
});

// Graceful shutdown handling for Kubernetes SIGTERM/SIGINT
function handleGracefulShutdown(signal) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'warn',
    message: `Received ${signal}. Starting graceful shutdown...`,
  }));

  // Stop accepting new connections
  server.close(() => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'All HTTP connections closed. Process terminating cleanly.',
    }));
    process.exit(0);
  });

  // Force exit after timeout if connections hang
  setTimeout(() => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: 'Forced shutdown after timeout expiration.',
    }));
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
