/**
 * Guardian Error Handler
 * Ensures Guardian errors don't crash the user's application
 */

import { eventStore, EventType } from '../collector/eventStore';

export interface ErrorHandlerConfig {
  maxErrors?: number;
  errorWindow?: number; // milliseconds
  onMaxErrors?: () => void;
}

export class GuardianErrorHandler {
  private errorCount = 0;
  private errors: Array<{ timestamp: number; context: string }> = [];
  private config: Required<ErrorHandlerConfig>;
  private isDisabled = false;

  constructor(config: ErrorHandlerConfig = {}) {
    this.config = {
      maxErrors: config.maxErrors || 100,
      errorWindow: config.errorWindow || 60000, // 1 minute
      onMaxErrors: config.onMaxErrors || (() => {}),
    };
  }

  handle(context: string, error: Error): void {
    if (this.isDisabled) return;

    const now = Date.now();
    
    // Clean up old errors outside the window
    this.errors = this.errors.filter(e => now - e.timestamp < this.config.errorWindow);
    
    // Add new error
    this.errors.push({ timestamp: now, context });
    this.errorCount++;

    // Log error without crashing
    console.error(`[Guardian Error] ${context}:`, error.message);
    if (process.env.GUARDIAN_DEBUG) {
      console.error(error.stack);
    }

    // Check if we've exceeded error threshold
    if (this.errors.length > this.config.maxErrors) {
      console.error(
        `[Guardian] Too many errors (${this.errors.length} in ${this.config.errorWindow}ms), disabling Guardian...`
      );
      this.isDisabled = true;
      this.config.onMaxErrors();
      return;
    }

    // Emit error event for monitoring
    try {
      eventStore.emit(EventType.SYSTEM_INFO, {
        type: 'guardian_error',
        context,
        message: error.message,
        count: this.errorCount,
      });
    } catch (emitError) {
      // Even error reporting failed - just log
      console.error('[Guardian] Failed to emit error event:', emitError);
    }
  }

  getStats() {
    return {
      totalErrors: this.errorCount,
      recentErrors: this.errors.length,
      isDisabled: this.isDisabled,
    };
  }

  reset(): void {
    this.errorCount = 0;
    this.errors = [];
    this.isDisabled = false;
  }
}

// Global error handler instance
export const errorHandler = new GuardianErrorHandler();
