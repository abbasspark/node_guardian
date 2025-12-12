import { eventStore, EventType } from '../collector/eventStore';

export interface UnawaitedPromiseConfig {
  enabled: boolean;
  checkInterval: number;
  warningThreshold: number; // ms before warning about unawaited promise
}

interface TrackedPromiseCreation {
  id: number;
  promise: Promise<any>;
  stack: string;
  createdAt: number;
  file?: string;
  line?: number;
  isAwaited: boolean;
}

export class UnawaitedPromiseDetector {
  private config: UnawaitedPromiseConfig;
  private promiseCounter = 0;
  private trackedPromises = new Map<number, TrackedPromiseCreation>();
  private intervalHandle: NodeJS.Timeout | null = null;
  private originalPromise: PromiseConstructor;
  private isPatched = false;

  constructor(config: Partial<UnawaitedPromiseConfig> = {}) {
    this.config = {
      enabled: true,
      checkInterval: 3000,
      warningThreshold: 5000, // warn if promise not awaited after 5s
      ...config,
    };
    
    this.originalPromise = Promise;
  }

  start(): void {
    if (!this.config.enabled || this.isPatched) {
      return;
    }

    this.patchPromiseConstructor();
    
    this.intervalHandle = setInterval(() => {
      this.checkUnawaitedPromises();
    }, this.config.checkInterval);

    eventStore.emit(EventType.SYSTEM_INFO, {
      message: 'Unawaited promise detection started',
    });
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    this.restorePromiseConstructor();
    this.trackedPromises.clear();
  }

  getStats() {
    const now = Date.now();
    const promises = Array.from(this.trackedPromises.values());
    
    return {
      total: promises.length,
      unawaited: promises.filter(p => !p.isAwaited).length,
      suspicious: promises.filter(
        p => !p.isAwaited && (now - p.createdAt) > this.config.warningThreshold
      ).length,
    };
  }

  private patchPromiseConstructor(): void {
    const self = this;
    const OriginalPromise = this.originalPromise;

    // Monkey-patch Promise constructor
    (global as any).Promise = function GuardianPromise(
      executor: (resolve: any, reject: any) => void
    ) {
      const stack = new Error().stack || '';
      const { file, line } = self.parseStack(stack);

      const promise = new OriginalPromise((resolve, reject) => {
        // Wrap executor to track resolution
        executor(
          (value: any) => {
            resolve(value);
          },
          (error: any) => {
            reject(error);
          }
        );
      });

      // CRITICAL FIX: Don't track Guardian's own promises!
      const isGuardianInternal = file && (
        file.includes('/node-guardian/') ||
        file.includes('/dist/core/') ||
        file.includes('/dist/collector/') ||
        file.includes('/dist/dashboard/') ||
        file.includes('/dist/instrumentation/') ||
        file.includes('promiseTracker') ||
        file.includes('eventLoopMonitor') ||
        file.includes('memoryMonitor') ||
        file.includes('unawaitedPromiseDetector') ||
        file.includes('eventStore')
      );

      if (!isGuardianInternal) {
        // Track this promise only if it's not Guardian's own code
        const id = ++self.promiseCounter;
        self.trackedPromises.set(id, {
          id,
          promise,
          stack,
          createdAt: Date.now(),
          file,
          line,
          isAwaited: false,
        });

        // Watch for .then/.catch/.finally calls (indicates it's being handled)
        const originalThen = promise.then.bind(promise);
        const originalCatch = promise.catch.bind(promise);
        const originalFinally = promise.finally?.bind(promise);

        promise.then = function (...args: any[]) {
          const tracked = self.trackedPromises.get(id);
          if (tracked) {
            tracked.isAwaited = true;
          }
          return originalThen(...args);
        };

        promise.catch = function (...args: any[]) {
          const tracked = self.trackedPromises.get(id);
          if (tracked) {
            tracked.isAwaited = true;
          }
          return originalCatch(...args);
        };

        if (originalFinally) {
          promise.finally = function (...args: any[]) {
            const tracked = self.trackedPromises.get(id);
            if (tracked) {
              tracked.isAwaited = true;
            }
            return originalFinally(...args);
          };
        }

        // Clean up after promise settles
        promise.then(
          () => self.cleanupPromise(id),
          () => self.cleanupPromise(id)
        );
      }

      return promise;
    };

    // Copy static methods
    Object.setPrototypeOf(Promise, OriginalPromise);
    Object.keys(OriginalPromise).forEach(key => {
      (Promise as any)[key] = (OriginalPromise as any)[key];
    });

    this.isPatched = true;
  }

  private restorePromiseConstructor(): void {
    if (!this.isPatched) return;
    
    (global as any).Promise = this.originalPromise;
    this.isPatched = false;
  }

  private checkUnawaitedPromises(): void {
    const now = Date.now();

    for (const [id, tracked] of this.trackedPromises) {
      if (tracked.isAwaited) continue;

      const age = now - tracked.createdAt;

      if (age > this.config.warningThreshold) {
        const suggestion = this.generateSuggestion(tracked);

        eventStore.emit(
          EventType.UNAWAITED_PROMISE,
          {
            id,
            age: Math.round(age / 1000),
            file: tracked.file,
            line: tracked.line,
            stack: this.cleanStack(tracked.stack),
          },
          {
            severity: 'warning',
            file: tracked.file,
            line: tracked.line,
            suggestion,
          }
        );

        // Remove to avoid spam
        this.trackedPromises.delete(id);
      }
    }
  }

  private cleanupPromise(id: number): void {
    // Keep for a bit to allow detection
    setTimeout(() => {
      this.trackedPromises.delete(id);
    }, this.config.warningThreshold + 1000);
  }

  private generateSuggestion(tracked: TrackedPromiseCreation): string {
    return `⚠️ UNAWAITED PROMISE\n\n` +
      `A promise was created but never awaited at:\n` +
      `${tracked.file}:${tracked.line}\n\n` +
      `This can lead to:\n` +
      `- Unhandled rejections\n` +
      `- Race conditions\n` +
      `- Silent failures\n\n` +
      `Fix: Add 'await' keyword or .then()/.catch()\n\n` +
      `Example:\n` +
      `❌ someAsyncFunction();\n` +
      `✅ await someAsyncFunction();\n` +
      `✅ someAsyncFunction().catch(err => ...);`;
  }

  private parseStack(stack: string): { file?: string; line?: number } {
    const lines = stack.split('\n');
    
    for (const line of lines) {
      const match = line.match(/\(([^)]+):(\d+):\d+\)/);
      if (match && 
          !match[1].includes('node_modules') && 
          !match[1].includes('node:internal') &&
          !match[1].includes('unawaitedPromiseDetector')) {
        return {
          file: match[1],
          line: parseInt(match[2], 10),
        };
      }
    }

    return {};
  }

  private cleanStack(stack: string): string {
    return stack
      .split('\n')
      .filter(line => 
        !line.includes('node_modules') && 
        !line.includes('node:internal') &&
        !line.includes('unawaitedPromiseDetector')
      )
      .slice(0, 8)
      .join('\n');
  }
}
