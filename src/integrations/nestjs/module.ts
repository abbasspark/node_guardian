import { Guardian } from '../../index';
import 'reflect-metadata';

// These interfaces match NestJS types but don't require the dependency
interface DynamicModule {
  module: any;
  global?: boolean;
  providers?: any[];
  exports?: any[];
}

// Type-safe decorator helpers
let nestJsAvailable = false;
try {
  require('@nestjs/common');
  nestJsAvailable = true;
} catch {
  // NestJS not available, that's OK
}

export interface GuardianModuleOptions {
  dashboard?: {
    enabled?: boolean;
    port?: number;
    host?: string;
  };
  monitoring?: {
    eventLoop?: boolean;
    promises?: boolean;
    memory?: boolean;
    unawaitedPromises?: boolean;
  };
}

/**
 * NestJS Integration Module
 * 
 * Note: This requires @nestjs/common to be installed.
 * Install with: npm install @nestjs/common reflect-metadata
 */
export class GuardianModule {
  private static guardian: Guardian;
  private static options: GuardianModuleOptions;

  static forRoot(options: GuardianModuleOptions = {}): DynamicModule {
    if (!nestJsAvailable) {
      console.warn('[Guardian] NestJS not detected. Install @nestjs/common to use GuardianModule.');
    }

    GuardianModule.options = options;

    return {
      module: GuardianModule,
      global: true,
    };
  }

  async onApplicationBootstrap() {
    const { monitoring, dashboard } = GuardianModule.options;

    // Create and start Guardian
    GuardianModule.guardian = Guardian.create({
      eventLoop: { enabled: monitoring?.eventLoop !== false },
      promises: { enabled: monitoring?.promises !== false },
      memory: { enabled: monitoring?.memory !== false },
      unawaitedPromises: { enabled: monitoring?.unawaitedPromises !== false },
    });

    GuardianModule.guardian.start();

    console.log('🛡️  Guardian monitoring enabled');

    // Start dashboard if requested
    if (dashboard?.enabled) {
      const { DashboardServer } = await import('../../dashboard/server');
      const dashboardServer = new DashboardServer(GuardianModule.guardian, {
        port: dashboard.port || 4600,
        host: dashboard.host || 'localhost',
      });
      await dashboardServer.start();
    }
  }

  onApplicationShutdown() {
    if (GuardianModule.guardian) {
      GuardianModule.guardian.stop();
    }
  }

  static getGuardian(): Guardian {
    return GuardianModule.guardian;
  }
}

// Decorator to monitor specific methods
export function MonitorAsync(options: { timeout?: number } = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const timeout = options.timeout || 30000;

    descriptor.value = async function (...args: any[]) {
      const start = Date.now();
      const methodName = `${target.constructor.name}.${propertyKey}`;

      try {
        const promise = originalMethod.apply(this, args);
        
        // Monitor this specific promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            const duration = Date.now() - start;
            reject(new Error(
              `Method ${methodName} exceeded timeout of ${timeout}ms (ran for ${duration}ms)`
            ));
          }, timeout);
        });

        return await Promise.race([promise, timeoutPromise]);
      } catch (error) {
        const duration = Date.now() - start;
        console.error(`[Guardian] ${methodName} failed after ${duration}ms:`, error);
        throw error;
      }
    };

    return descriptor;
  };
}

// Example usage decorator for controllers/services
export function GuardianMonitored() {
  return function (target: Function) {
    // Mark class as monitored using standard metadata
    if (typeof Reflect !== 'undefined' && Reflect.defineMetadata) {
      Reflect.defineMetadata('guardian:monitored', true, target);
    }
    
    console.log(`🛡️  Guardian will monitor: ${target.name}`);
  };
}
