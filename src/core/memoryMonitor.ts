import { eventStore, EventType } from '../collector/eventStore';

export interface MemoryConfig {
  enabled: boolean;
  checkInterval: number;
  leakThreshold: number; // MB growth
  consecutiveGrowth: number; // How many consecutive growth periods before alert
}

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

export class MemoryMonitor {
  private intervalHandle: NodeJS.Timeout | null = null;
  private config: MemoryConfig;
  private snapshots: MemorySnapshot[] = [];
  private consecutiveGrowthCount = 0;
  private leakDetectedCount = 0;
  private maxSnapshots = 100;

  constructor(config: Partial<MemoryConfig> = {}) {
    this.config = {
      enabled: true,
      checkInterval: 5000, // check every 5 seconds
      leakThreshold: 10, // 10MB growth is suspicious
      consecutiveGrowth: 3, // 3 consecutive growths = leak
      ...config,
    };
  }

  start(): void {
    if (!this.config.enabled || this.intervalHandle) {
      return;
    }

    // Take initial snapshot
    this.takeSnapshot();

    this.intervalHandle = setInterval(() => {
      this.checkMemory();
    }, this.config.checkInterval);

    eventStore.emit(EventType.SYSTEM_INFO, {
      message: 'Memory monitoring started',
      threshold: this.config.leakThreshold,
    });
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  getStats() {
    const current = process.memoryUsage();
    const snapshots = this.snapshots;

    if (snapshots.length === 0) {
      return {
        current: this.formatMemory(current),
        growth: 0,
        leakDetectedCount: this.leakDetectedCount,
        snapshotCount: 0,
      };
    }

    const first = snapshots[0];
    const growth = (current.heapUsed - first.heapUsed) / (1024 * 1024);

    return {
      current: this.formatMemory(current),
      growth: Math.round(growth * 100) / 100,
      leakDetectedCount: this.leakDetectedCount,
      snapshotCount: snapshots.length,
      trend: this.calculateTrend(),
    };
  }

  getSnapshots(): MemorySnapshot[] {
    return [...this.snapshots];
  }

  forceGC(): boolean {
    if (global.gc) {
      global.gc();
      return true;
    }
    return false;
  }

  private takeSnapshot(): void {
    const mem = process.memoryUsage();
    
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      rss: mem.rss,
    };

    this.snapshots.push(snapshot);

    // Keep only recent snapshots
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  private checkMemory(): void {
    this.takeSnapshot();

    if (this.snapshots.length < 2) {
      return;
    }

    const current = this.snapshots[this.snapshots.length - 1];
    const previous = this.snapshots[this.snapshots.length - 2];

    const growthMB = (current.heapUsed - previous.heapUsed) / (1024 * 1024);

    if (growthMB > this.config.leakThreshold) {
      this.consecutiveGrowthCount++;

      if (this.consecutiveGrowthCount >= this.config.consecutiveGrowth) {
        this.detectLeak(growthMB);
        this.consecutiveGrowthCount = 0; // Reset to avoid spam
      }
    } else if (growthMB < 0) {
      // Memory decreased (GC happened)
      this.consecutiveGrowthCount = 0;
    }
  }

  private detectLeak(recentGrowthMB: number): void {
    this.leakDetectedCount++;

    const trend = this.calculateTrend();
    const totalGrowth = this.calculateTotalGrowth();
    const suggestion = this.generateLeakSuggestion(totalGrowth, trend);

    eventStore.emit(
      EventType.MEMORY_LEAK,
      {
        recentGrowth: Math.round(recentGrowthMB * 100) / 100,
        totalGrowth: Math.round(totalGrowth * 100) / 100,
        current: Math.round(this.snapshots[this.snapshots.length - 1].heapUsed / (1024 * 1024)),
        trend,
        leakCount: this.leakDetectedCount,
      },
      {
        severity: totalGrowth > 100 ? 'critical' : 'error',
        suggestion,
      }
    );
  }

  private calculateTrend(): 'growing' | 'stable' | 'decreasing' {
    if (this.snapshots.length < 5) return 'stable';

    const recent = this.snapshots.slice(-5);
    const increases = recent.filter((snap, i) => 
      i > 0 && snap.heapUsed > recent[i - 1].heapUsed
    ).length;

    if (increases >= 4) return 'growing';
    if (increases <= 1) return 'decreasing';
    return 'stable';
  }

  private calculateTotalGrowth(): number {
    if (this.snapshots.length < 2) return 0;

    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];

    return (last.heapUsed - first.heapUsed) / (1024 * 1024);
  }

  private generateLeakSuggestion(totalGrowthMB: number, trend: string): string {
    let suggestion = `🔴 MEMORY LEAK DETECTED\n\n`;
    suggestion += `Heap growth: +${Math.round(totalGrowthMB)}MB over ${this.snapshots.length * this.config.checkInterval / 1000}s\n`;
    suggestion += `Trend: ${trend}\n\n`;

    if (totalGrowthMB > 100) {
      suggestion += `⚠️ CRITICAL: Memory growing rapidly!\n\n`;
    }

    suggestion += `Common causes:\n`;
    suggestion += `1. Event listeners not removed (EventEmitter memory leak)\n`;
    suggestion += `2. Timers not cleared (setTimeout/setInterval)\n`;
    suggestion += `3. Caches without size limits (Map/Array growing unbounded)\n`;
    suggestion += `4. Closures holding references to large objects\n`;
    suggestion += `5. Database connections not closed\n\n`;

    suggestion += `Actions:\n`;
    suggestion += `- Run: guardian snapshot (take heap snapshot)\n`;
    suggestion += `- Check for: large arrays, maps, caches\n`;
    suggestion += `- Review: event listeners, timers, DB connections\n`;

    if (!global.gc) {
      suggestion += `\n💡 Tip: Run with --expose-gc flag to allow manual garbage collection`;
    }

    return suggestion;
  }

  private formatMemory(mem: NodeJS.MemoryUsage) {
    return {
      heapUsed: Math.round(mem.heapUsed / (1024 * 1024)),
      heapTotal: Math.round(mem.heapTotal / (1024 * 1024)),
      external: Math.round(mem.external / (1024 * 1024)),
      rss: Math.round(mem.rss / (1024 * 1024)),
    };
  }
}
