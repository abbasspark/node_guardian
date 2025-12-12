/**
 * Guardian Config Validator
 * Validates configuration to catch errors early
 */

import { GuardianConfig } from '../index';

export class ConfigValidator {
  static validate(config: GuardianConfig): void {
    // Mode validation
    if (config.mode && !['production', 'development', 'debug'].includes(config.mode)) {
      throw new Error(
        `Invalid mode: "${config.mode}". Must be "production", "development", or "debug".`
      );
    }

    // Event loop validation
    if (config.eventLoop) {
      this.validatePositive(
        config.eventLoop.sampleInterval,
        'eventLoop.sampleInterval',
        1000
      );
      this.validatePositive(
        config.eventLoop.stallThreshold,
        'eventLoop.stallThreshold',
        10
      );
    }

    // Promise validation
    if (config.promises) {
      this.validatePositive(
        config.promises.checkInterval,
        'promises.checkInterval',
        1000
      );
      this.validatePositive(
        config.promises.deadlockThreshold,
        'promises.deadlockThreshold',
        5000
      );
      if (config.promises.maxTracked !== undefined) {
        if (config.promises.maxTracked < 10) {
          throw new Error('promises.maxTracked must be >= 10');
        }
        if (config.promises.maxTracked > 100000) {
          throw new Error('promises.maxTracked must be <= 100000 (memory safety)');
        }
      }
    }

    // Memory validation
    if (config.memory) {
      this.validatePositive(
        config.memory.checkInterval,
        'memory.checkInterval',
        5000
      );
      this.validatePositive(
        config.memory.leakThreshold,
        'memory.leakThreshold',
        1
      );
      if (config.memory.maxSnapshots !== undefined) {
        if (config.memory.maxSnapshots < 3) {
          throw new Error('memory.maxSnapshots must be >= 3');
        }
        if (config.memory.maxSnapshots > 1000) {
          throw new Error('memory.maxSnapshots must be <= 1000 (memory safety)');
        }
      }
    }

    // Unawaited promises validation
    if (config.unawaitedPromises) {
      this.validatePositive(
        config.unawaitedPromises.checkInterval,
        'unawaitedPromises.checkInterval',
        1000
      );
      this.validatePositive(
        config.unawaitedPromises.warningThreshold,
        'unawaitedPromises.warningThreshold',
        1000
      );
    }
  }

  private static validatePositive(
    value: number | undefined,
    name: string,
    minimum?: number
  ): void {
    if (value === undefined) return;

    if (typeof value !== 'number') {
      throw new Error(`${name} must be a number, got ${typeof value}`);
    }

    if (!isFinite(value)) {
      throw new Error(`${name} must be a finite number`);
    }

    if (value <= 0) {
      throw new Error(`${name} must be positive, got ${value}`);
    }

    if (minimum !== undefined && value < minimum) {
      throw new Error(`${name} must be >= ${minimum}ms, got ${value}ms`);
    }
  }

  static validateSafe(config: GuardianConfig): { valid: boolean; error?: string } {
    try {
      this.validate(config);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
