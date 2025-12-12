import { ConfigValidator } from '../../src/utils/configValidator';

describe('ConfigValidator', () => {
  describe('Mode Validation', () => {
    it('should accept valid modes', () => {
      expect(() => ConfigValidator.validate({ mode: 'production' })).not.toThrow();
      expect(() => ConfigValidator.validate({ mode: 'development' })).not.toThrow();
      expect(() => ConfigValidator.validate({ mode: 'debug' })).not.toThrow();
    });

    it('should reject invalid modes', () => {
      expect(() => ConfigValidator.validate({ mode: 'invalid' as any })).toThrow();
      expect(() => ConfigValidator.validate({ mode: 'prod' as any })).toThrow();
    });
  });

  describe('Event Loop Validation', () => {
    it('should accept valid event loop config', () => {
      expect(() => ConfigValidator.validate({
        eventLoop: {
          enabled: true,
          sampleInterval: 1000,
          stallThreshold: 100
        }
      })).not.toThrow();
    });

    it('should reject sampleInterval < 1000ms', () => {
      expect(() => ConfigValidator.validate({
        eventLoop: { sampleInterval: 500 }
      })).toThrow(/sampleInterval must be >= 1000ms/);
    });

    it('should reject stallThreshold < 10ms', () => {
      expect(() => ConfigValidator.validate({
        eventLoop: { stallThreshold: 5 }
      })).toThrow(/stallThreshold must be >= 10ms/);
    });

    it('should reject negative values', () => {
      expect(() => ConfigValidator.validate({
        eventLoop: { sampleInterval: -1000 }
      })).toThrow(/must be positive/);
    });

    it('should reject non-numeric values', () => {
      expect(() => ConfigValidator.validate({
        eventLoop: { sampleInterval: 'fast' as any }
      })).toThrow(/must be a number/);
    });

    it('should reject infinity', () => {
      expect(() => ConfigValidator.validate({
        eventLoop: { sampleInterval: Infinity }
      })).toThrow(/must be a finite number/);
    });
  });

  describe('Promise Validation', () => {
    it('should accept valid promise config', () => {
      expect(() => ConfigValidator.validate({
        promises: {
          enabled: true,
          checkInterval: 5000,
          deadlockThreshold: 30000,
          maxTracked: 1000
        }
      })).not.toThrow();
    });

    it('should reject checkInterval < 1000ms', () => {
      expect(() => ConfigValidator.validate({
        promises: { checkInterval: 500 }
      })).toThrow(/checkInterval must be >= 1000ms/);
    });

    it('should reject deadlockThreshold < 5000ms', () => {
      expect(() => ConfigValidator.validate({
        promises: { deadlockThreshold: 1000 }
      })).toThrow(/deadlockThreshold must be >= 5000ms/);
    });

    it('should reject maxTracked < 10', () => {
      expect(() => ConfigValidator.validate({
        promises: { maxTracked: 5 }
      })).toThrow(/maxTracked must be >= 10/);
    });

    it('should reject maxTracked > 100000 (safety)', () => {
      expect(() => ConfigValidator.validate({
        promises: { maxTracked: 200000 }
      })).toThrow(/maxTracked must be <= 100000/);
    });
  });

  describe('Memory Validation', () => {
    it('should accept valid memory config', () => {
      expect(() => ConfigValidator.validate({
        memory: {
          enabled: true,
          checkInterval: 5000,
          leakThreshold: 50,
          maxSnapshots: 10
        }
      })).not.toThrow();
    });

    it('should reject checkInterval < 5000ms', () => {
      expect(() => ConfigValidator.validate({
        memory: { checkInterval: 1000 }
      })).toThrow(/checkInterval must be >= 5000ms/);
    });

    it('should reject leakThreshold < 1MB', () => {
      expect(() => ConfigValidator.validate({
        memory: { leakThreshold: 0.5 }
      })).toThrow(/leakThreshold must be >= 1/);
    });

    it('should reject maxSnapshots < 3', () => {
      expect(() => ConfigValidator.validate({
        memory: { maxSnapshots: 2 }
      })).toThrow(/maxSnapshots must be >= 3/);
    });

    it('should reject maxSnapshots > 1000 (safety)', () => {
      expect(() => ConfigValidator.validate({
        memory: { maxSnapshots: 2000 }
      })).toThrow(/maxSnapshots must be <= 1000/);
    });
  });

  describe('Unawaited Promise Validation', () => {
    it('should accept valid config', () => {
      expect(() => ConfigValidator.validate({
        unawaitedPromises: {
          enabled: true,
          checkInterval: 5000,
          warningThreshold: 2000
        }
      })).not.toThrow();
    });

    it('should reject checkInterval < 1000ms', () => {
      expect(() => ConfigValidator.validate({
        unawaitedPromises: { checkInterval: 500 }
      })).toThrow(/checkInterval must be >= 1000ms/);
    });

    it('should reject warningThreshold < 1000ms', () => {
      expect(() => ConfigValidator.validate({
        unawaitedPromises: { warningThreshold: 500 }
      })).toThrow(/warningThreshold must be >= 1000ms/);
    });
  });

  describe('validateSafe', () => {
    it('should return valid: true for good config', () => {
      const result = ConfigValidator.validateSafe({
        mode: 'production'
      });
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return valid: false with error message for bad config', () => {
      const result = ConfigValidator.validateSafe({
        mode: 'invalid' as any
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid mode');
    });

    it('should not throw on invalid config', () => {
      expect(() => ConfigValidator.validateSafe({
        eventLoop: { sampleInterval: -1000 }
      })).not.toThrow();
    });
  });

  describe('Complex Configs', () => {
    it('should validate complete config', () => {
      expect(() => ConfigValidator.validate({
        mode: 'production',
        eventLoop: {
          enabled: true,
          sampleInterval: 30000,
          stallThreshold: 300
        },
        promises: {
          enabled: false,
          checkInterval: 60000,
          deadlockThreshold: 120000,
          maxTracked: 20
        },
        memory: {
          enabled: true,
          checkInterval: 30000,
          leakThreshold: 50,
          maxSnapshots: 5
        },
        unawaitedPromises: {
          enabled: false,
          checkInterval: 60000,
          warningThreshold: 5000
        }
      })).not.toThrow();
    });

    it('should allow undefined optional fields', () => {
      expect(() => ConfigValidator.validate({
        eventLoop: {
          enabled: true
          // sampleInterval and stallThreshold are undefined
        }
      })).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty config', () => {
      expect(() => ConfigValidator.validate({})).not.toThrow();
    });

    it('should handle null values gracefully', () => {
      expect(() => ConfigValidator.validate({
        eventLoop: null as any
      })).not.toThrow();
    });

    it('should handle NaN', () => {
      expect(() => ConfigValidator.validate({
        eventLoop: { sampleInterval: NaN }
      })).toThrow(/must be a finite number/);
    });
  });
});
