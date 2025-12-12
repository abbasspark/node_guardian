#!/usr/bin/env node

/**
 * PRODUCTION EXAMPLE - Ultra Low Overhead
 * 
 * This example shows how to use Guardian in production with minimal impact.
 * Expected overhead: < 1% CPU, < 10MB memory
 */

const { Guardian } = require('../dist/index');

console.log('🚀 Starting production application with Guardian monitoring...\n');

// PRODUCTION MODE - Minimal overhead!
const guardian = Guardian.create({
  mode: 'production'
  
  // That's it! No other config needed.
  // Production mode automatically sets:
  // - Event loop checks every 30s (not 1s!)
  // - Memory checks every 30s
  // - Promise tracking DISABLED (too expensive)
  // - Unawaited promise detection DISABLED
  // - High thresholds (300ms event loop, 50MB memory growth)
  // - Keeps only 5 snapshots max
});

guardian.start();

console.log('✅ Guardian running in PRODUCTION mode');
console.log('   Expected overhead: < 1% CPU, < 10MB memory\n');

// Your application code here
function runProductionApp() {
  const cache = [];
  
  setInterval(() => {
    // Simulate some work
    cache.push(new Array(1000).fill('data'));
    
    // Keep cache bounded (your app's normal cleanup)
    if (cache.length > 100) {
      cache.shift();
    }
  }, 5000);
  
  console.log('📦 Production app running...');
  console.log('   (Guardian monitoring in background with minimal overhead)\n');
}

runProductionApp();

// Monitor Guardian's own overhead
let initialMemory = process.memoryUsage().heapUsed;
setInterval(() => {
  const currentMemory = process.memoryUsage().heapUsed;
  const guardianOverhead = ((currentMemory - initialMemory) / 1048576).toFixed(1);
  
  console.log(`📊 Guardian overhead: ~${guardianOverhead}MB (should be < 10MB)`);
}, 60000);

// Only log critical issues
guardian.on('MEMORY_LEAK', (event) => {
  console.error('🔴 CRITICAL:', event);
  // Send to external monitoring service
  // externalLogger.critical(event);
});

guardian.on('PROMISE_DEADLOCK', (event) => {
  console.error('🔴 CRITICAL:', event);
});

console.log('💡 TIP: Run this for 10+ minutes and check memory usage');
console.log('    Expected: Minimal overhead, stable memory\n');

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n⏹️  Shutting down...');
  guardian.stop();
  process.exit(0);
});
