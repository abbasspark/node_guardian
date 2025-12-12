import { EventEmitter } from 'events';

export interface GuardianEvent {
  id: string;
  type: EventType;
  timestamp: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  source: string;
  data: any;
  stack?: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

export enum EventType {
  EVENT_LOOP_STALL = 'EVENT_LOOP_STALL',
  MEMORY_LEAK = 'MEMORY_LEAK',
  PROMISE_DEADLOCK = 'PROMISE_DEADLOCK',
  UNAWAITED_PROMISE = 'UNAWAITED_PROMISE',
  CPU_BLOCK = 'CPU_BLOCK',
  HANDLE_LEAK = 'HANDLE_LEAK',
  ASYNC_RESOURCE_LEAK = 'ASYNC_RESOURCE_LEAK',
  SYSTEM_INFO = 'SYSTEM_INFO',
}

export class EventStore {
  private static instance: EventStore;
  private events: GuardianEvent[] = [];
  private eventEmitter = new EventEmitter();
  private maxEvents = 10000; // Keep last 10k events
  private eventCounter = 0;

  private constructor() {}

  static getInstance(): EventStore {
    if (!EventStore.instance) {
      EventStore.instance = new EventStore();
    }
    return EventStore.instance;
  }

  emit(type: EventType, data: any, options?: {
    severity?: GuardianEvent['severity'];
    stack?: string;
    file?: string;
    line?: number;
    suggestion?: string;
  }): void {
    const event: GuardianEvent = {
      id: `evt_${++this.eventCounter}`,
      type,
      timestamp: Date.now(),
      severity: options?.severity || this.inferSeverity(type),
      source: this.extractSource(options?.stack),
      data,
      stack: options?.stack,
      file: options?.file,
      line: options?.line,
      suggestion: options?.suggestion,
    };

    this.events.push(event);

    // Keep only last N events
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Emit for real-time listeners (dashboard)
    this.eventEmitter.emit('event', event);
    this.eventEmitter.emit(type, event);
  }

  getEvents(filter?: {
    type?: EventType;
    severity?: string;
    since?: number;
  }): GuardianEvent[] {
    let filtered = [...this.events];

    if (filter?.type) {
      filtered = filtered.filter(e => e.type === filter.type);
    }

    if (filter?.severity) {
      filtered = filtered.filter(e => e.severity === filter.severity);
    }

    if (filter?.since !== undefined) {
      filtered = filtered.filter(e => e.timestamp >= filter.since!);
    }

    return filtered;
  }

  getEventStats(): {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  } {
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    this.events.forEach(event => {
      byType[event.type] = (byType[event.type] || 0) + 1;
      bySeverity[event.severity] = (bySeverity[event.severity] || 0) + 1;
    });

    return {
      total: this.events.length,
      byType,
      bySeverity,
    };
  }

  on(event: string, listener: (data: any) => void): void {
    this.eventEmitter.on(event, listener);
  }

  off(event: string, listener: (data: any) => void): void {
    this.eventEmitter.off(event, listener);
  }

  clear(): void {
    this.events = [];
    this.eventCounter = 0;
  }

  private inferSeverity(type: EventType): GuardianEvent['severity'] {
    switch (type) {
      case EventType.PROMISE_DEADLOCK:
      case EventType.MEMORY_LEAK:
        return 'critical';
      case EventType.EVENT_LOOP_STALL:
      case EventType.CPU_BLOCK:
      case EventType.HANDLE_LEAK:
        return 'error';
      case EventType.UNAWAITED_PROMISE:
        return 'warning';
      default:
        return 'info';
    }
  }

  private extractSource(stack?: string): string {
    if (!stack) return 'unknown';
    
    const lines = stack.split('\n');
    // Find first line that's not from node_modules or internal
    for (const line of lines) {
      if (line.includes('at ') && !line.includes('node_modules') && !line.includes('node:internal')) {
        return line.trim();
      }
    }
    
    return lines[1]?.trim() || 'unknown';
  }
}

// Export singleton instance
export const eventStore = EventStore.getInstance();
