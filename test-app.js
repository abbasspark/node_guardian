/**
 * Simple test application to verify Guardian works
 * 
 * Run with: node test-app.js
 */

const { Guardian } = require('./dist/index');
const { DashboardServer } = require('./dist/dashboard/server');

async function main() {
  console.log('🛡️  Starting Guardian Test App\n');

  // Create and start Guardian
  const guardian = Guardian.getInstance({
    eventLoop: { stallThreshold: 50 },
    promises: { deadlockThreshold: 10000 },
    memory: { leakThreshold: 5 },
  });

  guardian.start();

  // Start dashboard
  const dashboard = new DashboardServer(guardian, { port: 4600 });
  await dashboard.start();

  console.log('✅ Guardian is running!');
  console.log('📊 Dashboard: http://localhost:4600\n');

  // Simulate various issues

  // 1. Memory leak
  const leakyCache = [];
  setInterval(() => {
    leakyCache.push(new Array(1000).fill('leak'));
    console.log('💾 Cache size:', leakyCache.length);
  }, 2000);

  // 2. Unawaited promise
  setInterval(() => {
    someAsyncFunction(); // Missing await!
  }, 5000);

  // 3. Long-running promise (potential deadlock)
  setTimeout(async () => {
    console.log('🔄 Starting long promise...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    console.log('✅ Long promise completed');
  }, 3000);

  // 4. Event loop blocking
  setTimeout(() => {
    console.log('⚡ Blocking event loop...');
    const start = Date.now();
    while (Date.now() - start < 200) {
      // Block for 200ms
    }
    console.log('✅ Event loop unblocked');
  }, 8000);

  console.log('🔍 Watch the dashboard for real-time detection!\n');
  console.log('Issues to watch for:');
  console.log('  - Memory leak (growing cache)');
  console.log('  - Unawaited promise warnings');
  console.log('  - Long-running promise');
  console.log('  - Event loop stall\n');
  console.log('Press Ctrl+C to stop\n');
}

async function someAsyncFunction() {
  await new Promise(resolve => setTimeout(resolve, 100));
  return 'done';
}

main().catch(console.error);
