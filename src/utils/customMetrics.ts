/**
 * Guardian Custom Metrics
 * Allow users to track custom application metrics
 */

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

export interface Metric {
  name: string;
  type: MetricType;
  value: number;
  labels?: Record<string, string>;
  timestamp: number;
}

export interface HistogramBucket {
  le: number; // Less than or equal to
  count: number;
}

export class CustomMetrics {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();
  private labels = new Map<string, Record<string, string>>();

  /**
   * Increment a counter
   */
  incrementCounter(name: string, value: number = 1, labels?: Record<string, string>): void {
    const key = this.getKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
    if (labels) this.labels.set(key, labels);
  }

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getKey(name, labels);
    this.gauges.set(key, value);
    if (labels) this.labels.set(key, labels);
  }

  /**
   * Record a histogram value (for timing, sizes, etc.)
   */
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getKey(name, labels);
    const values = this.histograms.get(key) || [];
    values.push(value);
    
    // Keep last 1000 values
    if (values.length > 1000) {
      values.shift();
    }
    
    this.histograms.set(key, values);
    if (labels) this.labels.set(key, labels);
  }

  /**
   * Get counter value
   */
  getCounter(name: string, labels?: Record<string, string>): number {
    const key = this.getKey(name, labels);
    return this.counters.get(key) || 0;
  }

  /**
   * Get gauge value
   */
  getGauge(name: string, labels?: Record<string, string>): number {
    const key = this.getKey(name, labels);
    return this.gauges.get(key) || 0;
  }

  /**
   * Get histogram statistics
   */
  getHistogramStats(name: string, labels?: Record<string, string>): {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const key = this.getKey(name, labels);
    const values = this.histograms.get(key);
    
    if (!values || values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      count: sorted.length,
      sum,
      avg: sum / sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Metric[] {
    const metrics: Metric[] = [];
    const now = Date.now();

    // Counters
    for (const [key, value] of this.counters.entries()) {
      const { name, labels } = this.parseKey(key);
      metrics.push({
        name,
        type: 'counter',
        value,
        labels,
        timestamp: now,
      });
    }

    // Gauges
    for (const [key, value] of this.gauges.entries()) {
      const { name, labels } = this.parseKey(key);
      metrics.push({
        name,
        type: 'gauge',
        value,
        labels,
        timestamp: now,
      });
    }

    // Histograms (as summary)
    for (const [key, values] of this.histograms.entries()) {
      const { name, labels } = this.parseKey(key);
      const stats = this.getHistogramStats(name, labels);
      if (stats) {
        metrics.push({
          name: name + '_count',
          type: 'summary',
          value: stats.count,
          labels,
          timestamp: now,
        });
        metrics.push({
          name: name + '_sum',
          type: 'summary',
          value: stats.sum,
          labels,
          timestamp: now,
        });
      }
    }

    return metrics;
  }

  /**
   * Export metrics in Prometheus format
   */
  toPrometheus(): string {
    const lines: string[] = [];
    const processedMetrics = new Set<string>();

    // Counters
    for (const [key, value] of this.counters.entries()) {
      const { name, labels } = this.parseKey(key);
      
      if (!processedMetrics.has(name)) {
        lines.push(`# HELP ${name} Custom counter metric`);
        lines.push(`# TYPE ${name} counter`);
        processedMetrics.add(name);
      }
      
      const labelStr = labels ? this.formatLabels(labels) : '';
      lines.push(`${name}${labelStr} ${value}`);
    }

    // Gauges
    for (const [key, value] of this.gauges.entries()) {
      const { name, labels } = this.parseKey(key);
      
      if (!processedMetrics.has(name)) {
        lines.push(`# HELP ${name} Custom gauge metric`);
        lines.push(`# TYPE ${name} gauge`);
        processedMetrics.add(name);
      }
      
      const labelStr = labels ? this.formatLabels(labels) : '';
      lines.push(`${name}${labelStr} ${value}`);
    }

    // Histograms
    for (const [key, values] of this.histograms.entries()) {
      const { name, labels } = this.parseKey(key);
      const stats = this.getHistogramStats(name, labels);
      
      if (!stats) continue;

      if (!processedMetrics.has(name)) {
        lines.push(`# HELP ${name} Custom histogram metric`);
        lines.push(`# TYPE ${name} histogram`);
        processedMetrics.add(name);
      }

      const labelStr = labels ? this.formatLabels(labels) : '';
      
      // Histogram buckets
      const buckets = [10, 50, 100, 500, 1000, 5000, 10000];
      for (const bucket of buckets) {
        const count = values.filter(v => v <= bucket).length;
        lines.push(`${name}_bucket{le="${bucket}"${labels ? ',' + this.formatLabels(labels, false) : ''}} ${count}`);
      }
      
      lines.push(`${name}_bucket{le="+Inf"${labels ? ',' + this.formatLabels(labels, false) : ''}} ${stats.count}`);
      lines.push(`${name}_sum${labelStr} ${stats.sum}`);
      lines.push(`${name}_count${labelStr} ${stats.count}`);
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.labels.clear();
  }

  private getKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  private parseKey(key: string): { name: string; labels?: Record<string, string> } {
    const match = key.match(/^([^{]+)(\{(.+)\})?$/);
    if (!match) return { name: key };

    const name = match[1];
    if (!match[3]) return { name };

    const labels: Record<string, string> = {};
    const labelPairs = match[3].split(',');
    for (const pair of labelPairs) {
      const [k, v] = pair.split('=');
      labels[k] = v.replace(/^"|"$/g, '');
    }

    return { name, labels };
  }

  private formatLabels(labels: Record<string, string>, includeBraces: boolean = true): string {
    const formatted = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return includeBraces ? `{${formatted}}` : formatted;
  }
}

export const customMetrics = new CustomMetrics();

/**
 * Usage examples:
 * 
 * ```typescript
 * import { customMetrics } from 'node-guardian';
 * 
 * // Counter
 * customMetrics.incrementCounter('api_requests_total', 1, { endpoint: '/users', method: 'GET' });
 * 
 * // Gauge
 * customMetrics.setGauge('active_connections', 42);
 * 
 * // Histogram (for timing)
 * const start = Date.now();
 * await doWork();
 * customMetrics.recordHistogram('request_duration_ms', Date.now() - start, { endpoint: '/api' });
 * 
 * // Get metrics
 * console.log(customMetrics.getCounter('api_requests_total'));
 * console.log(customMetrics.getHistogramStats('request_duration_ms'));
 * 
 * // Export for Prometheus
 * app.get('/metrics', (req, res) => {
 *   res.type('text/plain');
 *   res.send(customMetrics.toPrometheus());
 * });
 * ```
 */
