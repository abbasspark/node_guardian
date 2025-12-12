import { EventLoopMonitor } from './core/eventLoopMonitor';
import { PromiseTracker } from './core/promiseTracker';
import { MemoryMonitor } from './core/memoryMonitor';
import { UnawaitedPromiseDetector } from './instrumentation/unawaitedPromiseDetector';
import { eventStore, EventType } from './collector/eventStore';
import { ConfigValidator } from './utils/configValidator';
import { errorHandler } from './utils/errorHandler';

export interface GuardianConfig {
  mode?: 'production' | 'development' | 'debug';  // NEW: Quick mode selection
  eventLoop?: {
    enabled?: boolean;
    stallThreshold?: number;
    sampleInterval?: number;
  };
  promises?: {
    enabled?: boolean;
    deadlockThreshold?: number;
    checkInterval?: number;
    maxTracked?: number;  // NEW: Limit tracked promises
  };
  memory?: {
    enabled?: boolean;
    checkInterval?: number;
    leakThreshold?: number;
    maxSnapshots?: number;  // NEW: Limit snapshots
  };
  unawaitedPromises?: {
    enabled?: boolean;
    checkInterval?: number;
    warningThreshold?: number;
  };
}

// Mode presets - use these for quick setup!
const MODE_DEFAULTS: Record<string, GuardianConfig> = {
  production: {
    eventLoop: {
      enabled: true,
      stallThreshold: 300,    // 300ms - less sensitive
      sampleInterval: 30000   // Check every 30s - very light
    },
    promises: {
      enabled: false,  // Disabled in production (expensive!)
      deadlockThreshold: 120000,  // 2 minutes
      checkInterval: 60000,
      maxTracked: 20
    },
    memory: {
      enabled: true,
      checkInterval: 30000,  // Check every 30s
      leakThreshold: 50,     // 50MB threshold
      maxSnapshots: 5        // Keep only 5 snapshots
    },
    unawaitedPromises: {
      enabled: false  // Too expensive for production!
    }
  },
  development: {
    eventLoop: {
      enabled: true,
      stallThreshold: 150,
      sampleInterval: 10000
    },
    promises: {
      enabled: true,
      deadlockThreshold: 45000,
      checkInterval: 15000,
      maxTracked: 50
    },
    memory: {
      enabled: true,
      checkInterval: 15000,
      leakThreshold: 20,
      maxSnapshots: 20
    },
    unawaitedPromises: {
      enabled: true,
      checkInterval: 10000,
      warningThreshold: 10000
    }
  },
  debug: {
    eventLoop: {
      enabled: true,
      stallThreshold: 100,
      sampleInterval: 5000
    },
    promises: {
      enabled: true,
      deadlockThreshold: 30000,
      checkInterval: 10000,
      maxTracked: 100
    },
    memory: {
      enabled: true,
      checkInterval: 10000,
      leakThreshold: 10,
      maxSnapshots: 50
    },
    unawaitedPromises: {
      enabled: true,
      checkInterval: 5000,
      warningThreshold: 5000
    }
  }
};

function applyModeDefaults(config: GuardianConfig): GuardianConfig {
  if (config.mode && MODE_DEFAULTS[config.mode]) {
    const defaults = MODE_DEFAULTS[config.mode];
    return {
      ...defaults,
      // User overrides take precedence
      eventLoop: { ...defaults.eventLoop, ...config.eventLoop },
      promises: { ...defaults.promises, ...config.promises },
      memory: { ...defaults.memory, ...config.memory },
      unawaitedPromises: { ...defaults.unawaitedPromises, ...config.unawaitedPromises }
    };
  }
  // If no mode specified, use production defaults for safety
  return {
    ...MODE_DEFAULTS.production,
    ...config
  };
}

export class Guardian {
  private static instance: Guardian | null = null;
  private eventLoopMonitor: EventLoopMonitor;
  private promiseTracker: PromiseTracker;
  private memoryMonitor: MemoryMonitor;
  private unawaitedPromiseDetector: UnawaitedPromiseDetector;
  private isRunning = false;
  private startTime = 0;

  private constructor(config: GuardianConfig = {}) {
    // Validate configuration
    try {
      ConfigValidator.validate(config);
    } catch (error) {
      console.error('[Guardian] Invalid configuration:', error);
      throw error;
    }

    // Apply mode defaults if specified
    const finalConfig = applyModeDefaults(config);
    
    // Initialize with error handling
    try {
      this.eventLoopMonitor = new EventLoopMonitor(finalConfig.eventLoop);
      this.promiseTracker = new PromiseTracker(finalConfig.promises);
      this.memoryMonitor = new MemoryMonitor(finalConfig.memory);
      this.unawaitedPromiseDetector = new UnawaitedPromiseDetector(finalConfig.unawaitedPromises);
    } catch (error) {
      console.error('[Guardian] Failed to initialize monitors:', error);
      throw error;
    }
    
    // Log the mode for transparency
    const mode = config.mode || 'production (default)';
    console.log(`🛡️  Guardian initialized in ${mode} mode`);
  }

  static getInstance(config?: GuardianConfig): Guardian {
    if (!Guardian.instance) {
      Guardian.instance = new Guardian(config);
    }
    return Guardian.instance;
  }

  static create(config?: GuardianConfig): Guardian {
    Guardian.instance = new Guardian(config);
    return Guardian.instance;
  }

  start(): void {
    if (this.isRunning) {
      console.warn('Guardian is already running');
      return;
    }

    this.startTime = Date.now();
    this.isRunning = true;

    // Start all monitors
    this.eventLoopMonitor.start();
    this.promiseTracker.start();
    this.memoryMonitor.start();
    this.unawaitedPromiseDetector.start();

    eventStore.emit(EventType.SYSTEM_INFO, {
      message: '🛡️ Guardian monitoring started',
      timestamp: new Date().toISOString(),
      pid: process.pid,
      nodeVersion: process.version,
    });

    // Register process event handlers
    this.registerProcessHandlers();
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.eventLoopMonitor.stop();
    this.promiseTracker.stop();
    this.memoryMonitor.stop();
    this.unawaitedPromiseDetector.stop();

    this.isRunning = false;

    eventStore.emit(EventType.SYSTEM_INFO, {
      message: '🛡️ Guardian monitoring stopped',
      uptime: Date.now() - this.startTime,
    });
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      uptime: this.isRunning ? Date.now() - this.startTime : 0,
      pid: process.pid,
      nodeVersion: process.version,
      monitors: {
        eventLoop: this.eventLoopMonitor.getStats(),
        promises: this.promiseTracker.getStats(),
        memory: this.memoryMonitor.getStats(),
        unawaitedPromises: this.unawaitedPromiseDetector.getStats(),
      },
      events: eventStore.getEventStats(),
    };
  }

  getEvents(filter?: {
    type?: EventType;
    severity?: string;
    since?: number;
  }) {
    return eventStore.getEvents(filter);
  }

  getEventStore() {
    return eventStore;
  }

  getPendingPromises() {
    return this.promiseTracker.getPendingPromises();
  }

  getMemorySnapshots() {
    return this.memoryMonitor.getSnapshots();
  }

  forceGC(): boolean {
    return this.memoryMonitor.forceGC();
  }

  private registerProcessHandlers(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      eventStore.emit(
        EventType.SYSTEM_INFO,
        {
          type: 'uncaughtException',
          message: error.message,
          stack: error.stack,
        },
        {
          severity: 'critical',
        }
      );
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      eventStore.emit(
        EventType.SYSTEM_INFO,
        {
          type: 'unhandledRejection',
          reason: String(reason),
          promise: String(promise),
        },
        {
          severity: 'critical',
        }
      );
    });

    // Handle exit
    process.on('exit', (code) => {
      this.stop();
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      this.stop();
      process.exit(0);
    });
  }
}

// Export singleton getter
export const getGuardian = (config?: GuardianConfig): Guardian => {
  return Guardian.getInstance(config);
};

// Export utilities
export { healthChecker, HealthChecker, HealthStatus } from './utils/healthChecker';
export { alertRouter, AlertRouter, AlertRoute, WebhookConfig } from './utils/alertRouter';
export { customMetrics, CustomMetrics, Metric, MetricType } from './utils/customMetrics';
export { GracefulShutdown, ShutdownOptions } from './utils/gracefulShutdown';
export { ConfigValidator } from './utils/configValidator';
export { errorHandler, GuardianErrorHandler } from './utils/errorHandler';

// Export integrations
export { guardianMiddleware, guardianErrorHandler as expressErrorHandler, trackSlowRequests } from './integrations/express';

// Export event types
export { GuardianEvent } from './collector/eventStore';
