#!/usr/bin/env node

/**
 * Complete Production Example
 * Shows all features of Guardian v1.0
 */

const express = require('express');
const { 
  Guardian,
  GracefulShutdown,
  guardianMiddleware,
  expressErrorHandler,
  trackSlowRequests,
  alertRouter,
  AlertRouter,
  customMetrics
} = require('../dist/index');

console.log('🚀 Starting Production App with Guardian v1.0...\n');

// ===== 1. Initialize Guardian =====
const guardian = Guardian.create({ mode: 'production' });
guardian.start();

console.log('✅ Guardian started in production mode');
console.log('   Expected overhead: < 1% CPU, < 10MB memory\n');

// ===== 2. Setup Alert Routing =====
// Console logger for demo (replace with Slack in production)
alertRouter.addRoute({
  name: 'console-logger',
  filter: (event) => event.severity === 'critical',
  handler: (event) => {
    console.error('\n🚨 CRITICAL ALERT:', {
      type: event.type,
      file: event.file,
      line: event.line,
      severity: event.severity
    });
  }
});

// Log warnings too
alertRouter.addRoute({
  name: 'warning-logger',
  filter: (event) => event.severity === 'warning',
  handler: (event) => {
    console.warn('\n⚠️  WARNING:', event.type, 'in', event.file);
  },
  rateLimit: {
    maxPerMinute: 5,
    maxPerHour: 50
  }
});

// Route all Guardian events
guardian.on('event', (event) => {
  alertRouter.route(event);
});

console.log('✅ Alert routing configured\n');

// ===== 3. Setup Express =====
const app = express();
app.use(express.json());

// Guardian middleware
app.use(guardianMiddleware({
  guardian,
  healthCheckPath: '/health',
  metricsPath: '/metrics',
  trackRequests: true,
  trackErrors: true
}));

// Track slow requests
app.use(trackSlowRequests(500));

console.log('✅ Express middleware configured\n');

// ===== 4. API Routes with Custom Metrics =====

app.get('/api/users', async (req, res) => {
  const start = Date.now();
  
  // Track request
  customMetrics.incrementCounter('api_requests_total', 1, {
    endpoint: '/users',
    method: 'GET'
  });
  
  // Simulate work
  await new Promise(resolve => setTimeout(resolve, Math.random() * 200));
  
  // Simulate occasional errors
  if (Math.random() < 0.1) {
    customMetrics.incrementCounter('api_errors_total', 1, {
      endpoint: '/users',
      error: 'random'
    });
    res.status(500).json({ error: 'Random error' });
    return;
  }
  
  // Track duration
  customMetrics.recordHistogram(
    'api_duration_ms',
    Date.now() - start,
    { endpoint: '/users' }
  );
  
  res.json({
    users: [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' }
    ]
  });
});

app.get('/api/slow', async (req, res) => {
  // This will trigger slow request warning
  await new Promise(resolve => setTimeout(resolve, 600));
  res.json({ message: 'Slow endpoint' });
});

app.get('/api/error', (req, res) => {
  // This will be caught by error handler
  throw new Error('Test error');
});

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Guardian v1.0 Production Example',
    endpoints: {
      health: '/health',
      metrics: '/metrics',
      users: '/api/users',
      slow: '/api/slow',
      error: '/api/error'
    }
  });
});

// Error handler
app.use(expressErrorHandler());

// ===== 5. Start Server =====
const PORT = 3000;
const server = app.listen(PORT, () => {
  console.log('🎉 Server started!\n');
  console.log('Endpoints:');
  console.log(`  Main:    http://localhost:${PORT}/`);
  console.log(`  Health:  http://localhost:${PORT}/health`);
  console.log(`  Metrics: http://localhost:${PORT}/metrics`);
  console.log(`  Users:   http://localhost:${PORT}/api/users`);
  console.log('');
  console.log('Try these commands:');
  console.log('  curl http://localhost:3000/health');
  console.log('  curl http://localhost:3000/metrics');
  console.log('  curl http://localhost:3000/api/users');
  console.log('');
});

// ===== 6. Update Metrics Periodically =====
setInterval(() => {
  const connections = server._connections || 0;
  customMetrics.setGauge('active_connections', connections);
  
  const memoryUsage = process.memoryUsage();
  customMetrics.setGauge('nodejs_memory_heap_used_bytes', memoryUsage.heapUsed);
  customMetrics.setGauge('nodejs_memory_heap_total_bytes', memoryUsage.heapTotal);
}, 5000);

// ===== 7. Graceful Shutdown =====
const shutdown = new GracefulShutdown(guardian, {
  timeout: 30000,
  onShutdown: async () => {
    console.log('\n🛑 Shutting down gracefully...');
    
    // Stop accepting new requests
    server.close();
    
    // Wait for existing requests to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('✅ Server closed');
    console.log('✅ Guardian stopped');
    console.log('👋 Goodbye!');
  }
});

// ===== 8. Simulate Some Activity =====
let requestCount = 0;
const simulateTraffic = setInterval(async () => {
  requestCount++;
  
  // Simulate requests
  try {
    const response = await fetch(`http://localhost:${PORT}/api/users`);
    if (!response.ok) {
      console.log('Request', requestCount, 'failed');
    }
  } catch (error) {
    // Server might be shutting down
    if (error.code !== 'ECONNREFUSED') {
      console.error('Fetch error:', error.message);
    }
  }
  
  // Stop after 100 requests
  if (requestCount >= 100) {
    clearInterval(simulateTraffic);
    console.log('\n✅ Simulation complete (100 requests)');
    console.log('\nCheck metrics: curl http://localhost:3000/metrics');
    console.log('Press Ctrl+C to stop\n');
  }
}, 500);

// ===== 9. Memory Leak Simulation (Optional) =====
// Uncomment to test memory leak detection
/*
const leakyArray = [];
setInterval(() => {
  // Allocate 1MB every second
  leakyArray.push(new Array(125000).fill('x'));
  console.log('💧 Leaking memory... array size:', leakyArray.length);
}, 1000);
*/

// ===== 10. Long Promise Simulation (Optional) =====
// Uncomment to test promise deadlock detection
/*
setTimeout(() => {
  // Create a promise that never resolves
  new Promise(() => {
    console.log('🔒 Created long-running promise (will trigger deadlock warning after 30s)');
  });
}, 5000);
*/

console.log('💡 Tips:');
console.log('   - Watch for slow request warnings');
console.log('   - Check /health endpoint for Guardian status');
console.log('   - Check /metrics for Prometheus metrics');
console.log('   - Uncomment leak simulation to test detection');
console.log('');
