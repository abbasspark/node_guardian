/**
 * Guardian Express Integration
 * Middleware for easy Express.js integration
 */

import { Guardian } from '../index';
import { healthChecker } from '../utils/healthChecker';
import { Request, Response, NextFunction } from 'express';

export interface GuardianMiddlewareOptions {
  guardian: Guardian;
  healthCheckPath?: string;
  metricsPath?: string;
  trackRequests?: boolean;
  trackErrors?: boolean;
}

/**
 * Express middleware for Guardian
 * Adds health check and metrics endpoints
 */
export function guardianMiddleware(options: GuardianMiddlewareOptions) {
  const {
    guardian,
    healthCheckPath = '/health',
    metricsPath = '/metrics',
    trackRequests = true,
    trackErrors = true,
  } = options;

  let requestCount = 0;
  let errorCount = 0;
  const requestDurations: number[] = [];

  return (req: Request, res: Response, next: NextFunction) => {
    // Health check endpoint
    if (req.path === healthCheckPath) {
      const health = healthChecker.getHealth();
      const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
      
      res.status(statusCode).json(health);
      return;
    }

    // Metrics endpoint (Prometheus format)
    if (req.path === metricsPath) {
      const metrics = healthChecker.getPrometheusMetrics();
      
      // Add request metrics
      const avgDuration = requestDurations.length > 0
        ? requestDurations.reduce((a, b) => a + b, 0) / requestDurations.length
        : 0;

      const additionalMetrics = `
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total ${requestCount}

# HELP http_errors_total Total HTTP errors
# TYPE http_errors_total counter
http_errors_total ${errorCount}

# HELP http_request_duration_milliseconds Average HTTP request duration
# TYPE http_request_duration_milliseconds gauge
http_request_duration_milliseconds ${avgDuration.toFixed(2)}
`;

      res.setHeader('Content-Type', 'text/plain');
      res.send(metrics + additionalMetrics);
      return;
    }

    // Track requests
    if (trackRequests) {
      requestCount++;
      const startTime = Date.now();

      // Track response
      const originalSend = res.send;
      res.send = function (body: any) {
        const duration = Date.now() - startTime;
        requestDurations.push(duration);
        
        // Keep last 100 durations
        if (requestDurations.length > 100) {
          requestDurations.shift();
        }

        // Track errors
        if (trackErrors && res.statusCode >= 500) {
          errorCount++;
        }

        return originalSend.call(this, body);
      };
    }

    next();
  };
}

/**
 * Error handler middleware for Guardian
 * Tracks errors and sends to Guardian
 */
export function guardianErrorHandler() {
  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    // Log error to Guardian
    console.error('[Guardian] Express error:', {
      error: err.message,
      path: req.path,
      method: req.method,
      stack: err.stack,
    });

    // Pass to next error handler
    next(err);
  };
}

/**
 * Request tracking middleware
 * Tracks slow requests
 */
export function trackSlowRequests(thresholdMs: number = 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      if (duration > thresholdMs) {
        console.warn('[Guardian] Slow request detected:', {
          method: req.method,
          path: req.path,
          duration: `${duration}ms`,
          threshold: `${thresholdMs}ms`,
        });
      }
    });

    next();
  };
}

/**
 * Complete Express integration example:
 * 
 * ```typescript
 * import express from 'express';
 * import { Guardian } from 'async-guardian';
 * import { guardianMiddleware, guardianErrorHandler, trackSlowRequests } from 'async-guardian/express';
 * 
 * const app = express();
 * const guardian = Guardian.create({ mode: 'production' });
 * guardian.start();
 * 
 * // Add Guardian middleware
 * app.use(guardianMiddleware({ guardian }));
 * app.use(trackSlowRequests(500)); // Track requests > 500ms
 * 
 * // Your routes
 * app.get('/', (req, res) => res.send('OK'));
 * 
 * // Guardian error handler (last middleware)
 * app.use(guardianErrorHandler());
 * 
 * app.listen(3000);
 * // Health: http://localhost:3000/health
 * // Metrics: http://localhost:3000/metrics
 * ```
 */
