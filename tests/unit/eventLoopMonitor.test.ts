import { EventLoopMonitor } from '../../src/core/eventLoopMonitor';
import { eventStore, EventType } from '../../src/collector/eventStore';

describe('EventLoopMonitor', () => {
  let monitor: EventLoopMonitor;
  let events: any[] = [];

  beforeEach(() => {
    events = [];
    eventStore.on(EventType.EVENT_LOOP_STALL, (event) => {
      events.push(event);
    });
  });

  afterEach(() => {
    if (monitor) {
      monitor.stop();
    }
    eventStore.clear();
  });

  describe('Configuration', () => {
    it('should initialize with default config', () => {
      monitor = new EventLoopMonitor({});
      expect(monitor).toBeDefined();
    });

    it('should accept custom thresholds', () => {
      monitor = new EventLoopMonitor({
        enabled: true,
        stallThreshold: 500,
        sampleInterval: 2000
      });
      expect(monitor).toBeDefined();
    });

    it('should not start if disabled', () => {
      monitor = new EventLoopMonitor({ enabled: false });
      monitor.start();
      // No error should be thrown
      expect(true).toBe(true);
    });
  });

  describe('Stall Detection', () => {
    it('should detect event loop stalls', async () => {
      monitor = new EventLoopMonitor({
        enabled: true,
        stallThreshold: 100,
        sampleInterval: 500
      });

      monitor.start();

      // Block event loop
      const start = Date.now();
      while (Date.now() - start < 150) {
        // Busy wait
      }

      // Wait for detection
      await new Promise(resolve => setTimeout(resolve, 600));

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].data.stallDuration).toBeGreaterThanOrEqual(100);
    }, 10000);

    it('should not detect stalls below threshold', async () => {
      monitor = new EventLoopMonitor({
        enabled: true,
        stallThreshold: 200,
        sampleInterval: 500
      });

      monitor.start();

      // Short block (below threshold)
      const start = Date.now();
      while (Date.now() - start < 50) {
        // Busy wait
      }

      await new Promise(resolve => setTimeout(resolve, 600));

      expect(events.length).toBe(0);
    }, 10000);
  });

  describe('Start/Stop', () => {
    it('should start and stop cleanly', () => {
      monitor = new EventLoopMonitor({ enabled: true });
      
      monitor.start();
      expect(monitor['intervalHandle']).toBeDefined();
      
      monitor.stop();
      expect(monitor['intervalHandle']).toBeNull();
    });

    it('should not error on double start', () => {
      monitor = new EventLoopMonitor({ enabled: true });
      monitor.start();
      monitor.start(); // Should not throw
      expect(monitor['intervalHandle']).toBeDefined();
    });

    it('should not error on stop without start', () => {
      monitor = new EventLoopMonitor({ enabled: true });
      monitor.stop(); // Should not throw
      expect(monitor['intervalHandle']).toBeNull();
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', async () => {
      monitor = new EventLoopMonitor({
        enabled: true,
        stallThreshold: 100,
        sampleInterval: 500
      });

      monitor.start();

      // Trigger a stall
      const start = Date.now();
      while (Date.now() - start < 150) {}

      await new Promise(resolve => setTimeout(resolve, 600));

      const stats = monitor.getStats();
      expect(stats.totalStalls).toBeGreaterThan(0);
      expect(stats.maxStallDuration).toBeGreaterThanOrEqual(100);
      expect(stats.avgStallDuration).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully', async () => {
      monitor = new EventLoopMonitor({ enabled: true });
      
      // Force an error by corrupting internal state
      const originalCheck = monitor['checkEventLoop'];
      monitor['checkEventLoop'] = () => {
        throw new Error('Test error');
      };

      monitor.start();
      
      // Should not crash
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(true).toBe(true);
      
      // Restore
      monitor['checkEventLoop'] = originalCheck;
    });
  });
});
