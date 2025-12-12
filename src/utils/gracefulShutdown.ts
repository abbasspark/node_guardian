/**
 * Guardian Graceful Shutdown
 * Handles cleanup on process termination
 */

import { Guardian } from '../index';

export interface ShutdownOptions {
  timeout?: number; // ms to wait before force exit
  signals?: string[]; // signals to listen for
  onShutdown?: () => Promise<void> | void;
}

export class GracefulShutdown {
  private isShuttingDown = false;
  private shutdownCallbacks: Array<() => Promise<void> | void> = [];

  constructor(private guardian: Guardian, private options: ShutdownOptions = {}) {
    const signals = options.signals || ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    for (const signal of signals) {
      process.on(signal, () => this.shutdown(signal));
    }

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('[Guardian] Uncaught exception:', error);
      this.shutdown('uncaughtException');
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason) => {
      console.error('[Guardian] Unhandled rejection:', reason);
      this.shutdown('unhandledRejection');
    });
  }

  onShutdown(callback: () => Promise<void> | void): void {
    this.shutdownCallbacks.push(callback);
  }

  private async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log(`\n[Guardian] Received ${signal}, shutting down gracefully...`);

    const timeout = this.options.timeout || 30000;
    const timeoutHandle = setTimeout(() => {
      console.error('[Guardian] Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, timeout);

    try {
      // Call custom shutdown handler
      if (this.options.onShutdown) {
        await this.options.onShutdown();
      }

      // Call registered callbacks
      for (const callback of this.shutdownCallbacks) {
        await callback();
      }

      // Stop Guardian
      this.guardian.stop();

      console.log('[Guardian] Shutdown complete');
      clearTimeout(timeoutHandle);
      process.exit(0);
    } catch (error) {
      console.error('[Guardian] Error during shutdown:', error);
      clearTimeout(timeoutHandle);
      process.exit(1);
    }
  }
}

/**
 * Usage:
 * 
 * ```typescript
 * import { Guardian, GracefulShutdown } from 'node-guardian';
 * 
 * const guardian = Guardian.create({ mode: 'production' });
 * guardian.start();
 * 
 * const shutdown = new GracefulShutdown(guardian, {
 *   timeout: 30000,
 *   onShutdown: async () => {
 *     // Close database connections
 *     await db.close();
 *     
 *     // Close HTTP server
 *     await new Promise(resolve => server.close(resolve));
 *   }
 * });
 * 
 * // Add additional cleanup
 * shutdown.onShutdown(async () => {
 *   console.log('Cleaning up...');
 * });
 * ```
 */
