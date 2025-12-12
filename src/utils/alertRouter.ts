/**
 * Guardian Alert Router
 * Routes alerts to external systems (Slack, PagerDuty, webhooks, etc.)
 */

import { GuardianEvent } from '../collector/eventStore';

export interface AlertRoute {
  name: string;
  filter?: (event: GuardianEvent) => boolean;
  handler: (event: GuardianEvent) => Promise<void> | void;
  enabled?: boolean;
  rateLimit?: {
    maxPerMinute: number;
    maxPerHour: number;
  };
}

export interface WebhookConfig {
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
  transform?: (event: GuardianEvent) => any;
}

export class AlertRouter {
  private routes: AlertRoute[] = [];
  private alertCounts = new Map<string, { perMinute: number[]; perHour: number[] }>();
  private deduplicationCache = new Map<string, number>();

  addRoute(route: AlertRoute): void {
    this.routes.push({
      ...route,
      enabled: route.enabled !== false,
    });
  }

  removeRoute(name: string): void {
    this.routes = this.routes.filter(r => r.name !== name);
  }

  async route(event: GuardianEvent): Promise<void> {
    const eventKey = this.getEventKey(event);
    
    // Deduplication: Don't send same alert within 5 minutes
    const lastSent = this.deduplicationCache.get(eventKey);
    if (lastSent && Date.now() - lastSent < 300000) {
      return;
    }

    for (const route of this.routes) {
      if (!route.enabled) continue;

      // Apply filter
      if (route.filter && !route.filter(event)) continue;

      // Check rate limits
      if (route.rateLimit && !this.checkRateLimit(route.name, route.rateLimit)) {
        console.warn(`[Guardian] Alert route "${route.name}" rate limit exceeded`);
        continue;
      }

      // Execute handler
      try {
        await route.handler(event);
        this.deduplicationCache.set(eventKey, Date.now());
      } catch (error) {
        console.error(`[Guardian] Alert route "${route.name}" failed:`, error);
      }
    }
  }

  private getEventKey(event: GuardianEvent): string {
    return `${event.type}:${event.data.file || 'unknown'}:${event.data.line || 0}`;
  }

  private checkRateLimit(routeName: string, limit: { maxPerMinute: number; maxPerHour: number }): boolean {
    const now = Date.now();
    const counts = this.alertCounts.get(routeName) || { perMinute: [], perHour: [] };

    // Clean old timestamps
    counts.perMinute = counts.perMinute.filter(t => now - t < 60000);
    counts.perHour = counts.perHour.filter(t => now - t < 3600000);

    // Check limits
    if (counts.perMinute.length >= limit.maxPerMinute) return false;
    if (counts.perHour.length >= limit.maxPerHour) return false;

    // Record this alert
    counts.perMinute.push(now);
    counts.perHour.push(now);
    this.alertCounts.set(routeName, counts);

    return true;
  }

  // Built-in webhook helper
  static createWebhookRoute(config: WebhookConfig): AlertRoute {
    return {
      name: 'webhook-' + config.url,
      handler: async (event) => {
        const payload = config.transform ? config.transform(event) : {
          type: event.type,
          severity: event.severity,
          message: event.data.message || event.type,
          file: event.file,
          line: event.line,
          timestamp: event.timestamp,
        };

        const response = await fetch(config.url, {
          method: config.method || 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...config.headers,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
        }
      },
    };
  }

  // Built-in Slack helper
  static createSlackRoute(webhookUrl: string, channel?: string): AlertRoute {
    return {
      name: 'slack',
      filter: (event) => event.severity === 'critical',
      handler: async (event) => {
        const color = event.severity === 'critical' ? 'danger' : 'warning';
        const emoji = event.severity === 'critical' ? ':rotating_light:' : ':warning:';

        const payload = {
          channel,
          attachments: [
            {
              color,
              title: `${emoji} Guardian Alert: ${event.type}`,
              fields: [
                {
                  title: 'Type',
                  value: event.type,
                  short: true,
                },
                {
                  title: 'Severity',
                  value: event.severity || 'unknown',
                  short: true,
                },
                {
                  title: 'Location',
                  value: `${event.file || 'unknown'}:${event.line || '?'}`,
                  short: false,
                },
                {
                  title: 'Message',
                  value: event.data.message || 'No details',
                  short: false,
                },
              ],
              footer: 'Node Guardian',
              ts: Math.floor(event.timestamp / 1000),
            },
          ],
        };

        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`Slack webhook failed: ${response.status}`);
        }
      },
      rateLimit: {
        maxPerMinute: 5,
        maxPerHour: 50,
      },
    };
  }

  // Built-in PagerDuty helper
  static createPagerDutyRoute(integrationKey: string): AlertRoute {
    return {
      name: 'pagerduty',
      filter: (event) => event.severity === 'critical',
      handler: async (event) => {
        const payload = {
          routing_key: integrationKey,
          event_action: 'trigger',
          payload: {
            summary: `Guardian: ${event.type}`,
            severity: 'critical',
            source: 'async-guardian',
            custom_details: {
              type: event.type,
              file: event.file,
              line: event.line,
              message: event.data.message,
            },
          },
        };

        const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`PagerDuty API failed: ${response.status}`);
        }
      },
      rateLimit: {
        maxPerMinute: 3,
        maxPerHour: 20,
      },
    };
  }
}

export const alertRouter = new AlertRouter();
