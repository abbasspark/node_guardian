import { monitorEventLoopDelay } from 'perf_hooks';
import { eventStore, EventType } from '../collector/eventStore';

export interface EventLoopConfig {
  enabled: boolean;
  stallThreshold: number; // milliseconds
  sampleInterval: number; // milliseconds
}

export class EventLoopMonitor {
  private histogram: ReturnType<typeof monitorEventLoopDelay> | null = null;
  private intervalHandle: NodeJS.Timeout | null = null;
  private config: EventLoopConfig;
  private lastStallTime = 0;
  private stallCount = 0;

  constructor(config: Partial<EventLoopConfig> = {}) {
    this.config = {
      enabled: true,
      stallThreshold: 100, // 100ms is considered a stall
      sampleInterval: 1000, // check every second
      ...config,
    };
  }

  start(): void {
    if (!this.config.enabled || this.histogram) {
      return;
    }

    // Create histogram with 10ms resolution
    this.histogram = monitorEventLoopDelay({ resolution: 10 });
    this.histogram.enable();

    this.intervalHandle = setInterval(() => {
      this.checkEventLoop();
    }, this.config.sampleInterval);

    eventStore.emit(EventType.SYSTEM_INFO, {
      message: 'Event loop monitoring started',
      threshold: this.config.stallThreshold,
    });
  }

  stop(): void {
    if (this.histogram) {
      this.histogram.disable();
      this.histogram = null;
    }

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  getStats() {
    if (!this.histogram) {
      return null;
    }

    return {
      min: this.histogram.min / 1e6, // convert to ms
      max: this.histogram.max / 1e6,
      mean: this.histogram.mean / 1e6,
      stddev: this.histogram.stddev / 1e6,
      percentile50: this.histogram.percentile(50) / 1e6,
      percentile95: this.histogram.percentile(95) / 1e6,
      percentile99: this.histogram.percentile(99) / 1e6,
      stallCount: this.stallCount,
    };
  }

  private checkEventLoop(): void {
    if (!this.histogram) return;

    const stats = this.getStats();
    if (!stats) return;

    // Check if event loop is stalled
    if (stats.mean > this.config.stallThreshold) {
      const now = Date.now();
      
      // Don't spam events - at most one per 5 seconds
      if (now - this.lastStallTime > 5000) {
        this.stallCount++;
        this.lastStallTime = now;

        const suggestion = this.generateSuggestion(stats);

        eventStore.emit(
          EventType.EVENT_LOOP_STALL,
          {
            duration: Math.round(stats.mean),
            max: Math.round(stats.max),
            p95: Math.round(stats.percentile95),
            p99: Math.round(stats.percentile99),
            stallCount: this.stallCount,
          },
          {
            severity: stats.mean > 500 ? 'critical' : 'error',
            suggestion,
          }
        );
      }
    }

    // Reset histogram to measure next interval
    this.histogram.reset();
  }

  private generateSuggestion(stats: ReturnType<typeof this.getStats>): string {
    if (!stats) return '';

    if (stats.mean > 1000) {
      return `Severe event loop blocking detected (${Math.round(stats.mean)}ms avg). Look for:\n` +
        `- Synchronous I/O operations (fs.readFileSync)\n` +
        `- Heavy CPU computations (large loops, regex, JSON parsing)\n` +
        `- Blocking database queries\n` +
        `Tip: Use worker threads for CPU-intensive tasks`;
    }

    if (stats.mean > 500) {
      return `Significant event loop delay (${Math.round(stats.mean)}ms). Common causes:\n` +
        `- Large synchronous operations\n` +
        `- Inefficient algorithms\n` +
        `- Missing 'await' keywords\n` +
        `Tip: Profile with 'guardian cpu-profile' to find the culprit`;
    }

    return `Event loop delay detected (${Math.round(stats.mean)}ms). ` +
      `Consider breaking down long-running operations or using setImmediate()`;
  }
}
