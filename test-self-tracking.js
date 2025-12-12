#!/usr/bin/env node

/**
 * Verification Test: Guardian Should NOT Track Its Own Code
 * 
 * This test verifies that Guardian doesn't report false positives
 * from its own internal operations.
 */

const { Guardian } = require('../dist/index');

console.log('🧪 Testing: Guardian Self-Tracking Bug Fix\n');

let guardianErrors = 0;
let userErrors = 0;

const guardian = Guardian.create({
  mode: 'development' // Enable promise tracking for this test
});

// Listen for all events
guardian.on('event', (event) => {
  if (event.file) {
    // Check if the error is from Guardian's own code
    if (event.file.includes('dist/core') ||
        event.file.includes('dist/collector') ||
        event.file.includes('dist/dashboard') ||
        event.file.includes('dist/instrumentation') ||
        event.file.includes('promiseTracker') ||
        event.file.includes('eventLoopMonitor') ||
        event.file.includes('memoryMonitor')) {
      guardianErrors++;
      console.error('❌ FAIL: Guardian detected its own code!');
      console.error('   File:', event.file);
      console.error('   Type:', event.type);
    } else {
      userErrors++;
      console.log('✅ User code event:', event.type, 'in', event.file);
    }
  }
});

guardian.start();

// Create some user code issues for testing
console.log('Creating test scenarios...\n');

// 1. Create a long-running promise (should be detected)
const longPromise = new Promise((resolve) => {
  setTimeout(resolve, 60000); // 60 seconds
});

// 2. Create some normal promises (should not be reported)
Promise.resolve('test1');
Promise.resolve('test2');

// 3. Simulate some async work
async function userWork() {
  await new Promise(resolve => setTimeout(resolve, 100));
  return 'done';
}

userWork();

// Check results after 35 seconds
setTimeout(() => {
  console.log('\n📊 Test Results:');
  console.log('================');
  console.log('Guardian self-detections:', guardianErrors);
  console.log('User code detections:', userErrors);
  console.log('');
  
  if (guardianErrors === 0) {
    console.log('✅ SUCCESS! Guardian is NOT tracking its own code!');
    console.log('   The self-tracking bug is fixed! 🎉\n');
  } else {
    console.log('❌ FAILURE! Guardian detected its own code', guardianErrors, 'times');
    console.log('   The self-tracking bug still exists! 🐛\n');
    process.exit(1);
  }
  
  guardian.stop();
  process.exit(0);
}, 35000);

console.log('⏰ Waiting 35 seconds to check for issues...');
console.log('   (Guardian should NOT report its own monitoring code)\n');
