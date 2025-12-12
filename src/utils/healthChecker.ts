/**
 * Guardian Health Check System
 * Provides health endpoints for Kubernetes, Docker, monitoring systems
 */

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: number;
  version: string;
  monitors: {
    [key: string]: {
      enabled: boolean;
      healthy: boolean;
      lastCheck?: number;
      errors?: number;
    };
  };
  metrics: {
    eventsProcessed: number;
    memoryUsage: number;
    cpuUsage?: number;
  };
}

export class HealthChecker {
  private startTime: number;
  private eventCount = 0;
  private monitorHealth = new Map<string, { healthy: boolean; lastCheck: number; errors: number }>();

  constructor() {
    this.startTime = Date.now();
  }

  recordEvent(): void {
    this.eventCount++;
  }

  recordMonitorCheck(monitorName: string, success: boolean): void {
    const current = this.monitorHealth.get(monitorName) || { healthy: true, lastCheck: 0, errors: 0 };
    this.monitorHealth.set(monitorName, {
      healthy: success,
      lastCheck: Date.now(),
      errors: success ? 0 : current.errors + 1,
    });
  }

  getHealth(): HealthStatus {
    const memoryUsage = process.memoryUsage();
    const uptime = Date.now() - this.startTime;

    // Determine overall health
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    // Check if any monitor has too many errors
    for (const [name, health] of this.monitorHealth.entries()) {
      if (health.errors > 10) {
        status = 'unhealthy';
        break;
      } else if (health.errors > 3) {
        status = 'degraded';
      }
    }

    // Check memory usage
    const memoryMB = memoryUsage.heapUsed / 1048576;
    if (memoryMB > 100) {
      status = 'degraded';
    }
    if (memoryMB > 200) {
      status = 'unhealthy';
    }

    const monitors: any = {};
    for (const [name, health] of this.monitorHealth.entries()) {
      monitors[name] = {
        enabled: true,
        healthy: health.healthy,
        lastCheck: health.lastCheck,
        errors: health.errors,
      };
    }

    return {
      status,
      uptime,
      timestamp: Date.now(),
      version: '1.0.0',
      monitors,
      metrics: {
        eventsProcessed: this.eventCount,
        memoryUsage: memoryMB,
      },
    };
  }

  isHealthy(): boolean {
    const health = this.getHealth();
    return health.status === 'healthy';
  }

  getPrometheusMetrics(): string {
    const health = this.getHealth();
    const lines: string[] = [];

    lines.push('# HELP guardian_up Guardian is running (1 = up, 0 = down)');
    lines.push('# TYPE guardian_up gauge');
    lines.push(`guardian_up ${health.status === 'unhealthy' ? 0 : 1}`);

    lines.push('# HELP guardian_uptime_seconds Guardian uptime in seconds');
    lines.push('# TYPE guardian_uptime_seconds counter');
    lines.push(`guardian_uptime_seconds ${(health.uptime / 1000).toFixed(2)}`);

    lines.push('# HELP guardian_events_total Total events processed');
    lines.push('# TYPE guardian_events_total counter');
    lines.push(`guardian_events_total ${health.metrics.eventsProcessed}`);

    lines.push('# HELP guardian_memory_bytes Guardian memory usage in bytes');
    lines.push('# TYPE guardian_memory_bytes gauge');
    lines.push(`guardian_memory_bytes ${(health.metrics.memoryUsage * 1048576).toFixed(0)}`);

    for (const [name, monitor] of Object.entries(health.monitors)) {
      lines.push(`# HELP guardian_monitor_healthy Monitor health status (1 = healthy, 0 = unhealthy)`);
      lines.push(`# TYPE guardian_monitor_healthy gauge`);
      lines.push(`guardian_monitor_healthy{monitor="${name}"} ${monitor.healthy ? 1 : 0}`);

      lines.push(`# HELP guardian_monitor_errors_total Total monitor errors`);
      lines.push(`# TYPE guardian_monitor_errors_total counter`);
      lines.push(`guardian_monitor_errors_total{monitor="${name}"} ${monitor.errors || 0}`);
    }

    return lines.join('\n') + '\n';
  }
}

export const healthChecker = new HealthChecker();
