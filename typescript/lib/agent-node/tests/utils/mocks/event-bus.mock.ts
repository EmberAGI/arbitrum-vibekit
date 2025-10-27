import { DefaultExecutionEventBusManager } from '@a2a-js/sdk/server';
import type { ExecutionEventBus, ExecutionEventBusManager } from '@a2a-js/sdk/server';
import { vi } from 'vitest';

type AgentExecutionEvent = Parameters<ExecutionEventBus['publish']>[0];

/**
 * Mock implementation of ExecutionEventBus for testing
 * Records all published events and tracks finished() calls
 */
export class RecordingEventBus implements ExecutionEventBus {
  public readonly published: AgentExecutionEvent[] = [];
  public finishedCount = 0;

  publish(event: AgentExecutionEvent): void {
    this.published.push(event);
  }

  on(): this {
    return this;
  }

  off(): this {
    return this;
  }

  once(): this {
    return this;
  }

  removeAllListeners(): this {
    return this;
  }

  finished(): void {
    this.finishedCount += 1;
  }

  /**
   * Helper method to find events by kind
   */
  findEventsByKind<T extends AgentExecutionEvent>(
    kind: T['kind'],
  ): Extract<AgentExecutionEvent, { kind: T['kind'] }>[] {
    return this.published.filter((event) => event.kind === kind) as Extract<
      AgentExecutionEvent,
      { kind: T['kind'] }
    >[];
  }

  /**
   * Helper to get the first event of a specific kind
   */
  findFirstEventByKind<T extends AgentExecutionEvent>(
    kind: T['kind'],
  ): Extract<AgentExecutionEvent, { kind: T['kind'] }> | undefined {
    return this.findEventsByKind(kind)[0];
  }

  /**
   * Clear all recorded events
   */
  clear(): void {
    this.published.length = 0;
    this.finishedCount = 0;
  }
}

/**
 * Create a mock event bus with vi.fn() spies
 */
export function createMockEventBus(): ExecutionEventBus {
  const bus: ExecutionEventBus = {
    publish: vi.fn(),
    finished: vi.fn(),
    on: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
    once: vi.fn().mockReturnThis(),
    removeAllListeners: vi.fn().mockReturnThis(),
  } as unknown as ExecutionEventBus;
  return bus;
}

/**
 * Wrapper around real SDK event bus that also records events for assertions
 * Use this for integration tests that need to validate SDK behavior
 */
export class RecordingRealEventBus implements ExecutionEventBus {
  public readonly published: AgentExecutionEvent[] = [];
  private readonly realBus: ExecutionEventBus;

  constructor(taskId: string, manager?: ExecutionEventBusManager) {
    // Use provided manager or create a new one
    const busManager = manager || new DefaultExecutionEventBusManager();
    this.realBus = busManager.createOrGetByTaskId(taskId);
  }

  publish(event: AgentExecutionEvent): void {
    // Record for assertions
    this.published.push(event);
    // Pass through to real SDK bus for actual routing
    this.realBus.publish(event);
  }

  on(...args: Parameters<ExecutionEventBus['on']>): this {
    this.realBus.on(...args);
    return this;
  }

  off(...args: Parameters<ExecutionEventBus['off']>): this {
    this.realBus.off(...args);
    return this;
  }

  once(...args: Parameters<ExecutionEventBus['once']>): this {
    this.realBus.once(...args);
    return this;
  }

  removeAllListeners(): this {
    this.realBus.removeAllListeners();
    return this;
  }

  finished(): void {
    this.realBus.finished();
  }

  /**
   * Helper method to find events by kind
   */
  findEventsByKind<T extends AgentExecutionEvent>(
    kind: T['kind'],
  ): Extract<AgentExecutionEvent, { kind: T['kind'] }>[] {
    return this.published.filter((event) => event.kind === kind) as Extract<
      AgentExecutionEvent,
      { kind: T['kind'] }
    >[];
  }

  /**
   * Helper to get the first event of a specific kind
   */
  findFirstEventByKind<T extends AgentExecutionEvent>(
    kind: T['kind'],
  ): Extract<AgentExecutionEvent, { kind: T['kind'] }> | undefined {
    return this.findEventsByKind(kind)[0];
  }

  /**
   * Clear all recorded events
   */
  clear(): void {
    this.published.length = 0;
  }
}

/**
 * Manager that tracks event buses for all tasks (parent and children)
 * Wraps the real DefaultExecutionEventBusManager to record events from all buses
 */
export class RecordingEventBusManager implements ExecutionEventBusManager {
  private realManager: DefaultExecutionEventBusManager;
  private recordedBuses = new Map<string, RecordingRealEventBus>();

  constructor() {
    this.realManager = new DefaultExecutionEventBusManager();
  }

  /**
   * Creates or gets a recording event bus for the given task ID
   * This intercepts bus creation to attach recorders to all buses
   */
  createOrGetByTaskId(taskId: string): ExecutionEventBus {
    // Check if we already have a recording bus for this task
    let recordingBus = this.recordedBuses.get(taskId);

    if (!recordingBus) {
      // Create a new recording bus that wraps the real bus
      recordingBus = new RecordingRealEventBus(taskId, this.realManager);
      this.recordedBuses.set(taskId, recordingBus);
    }

    return recordingBus;
  }

  /**
   * Retrieve the underlying real bus by taskId to satisfy ExecutionEventBusManager interface
   */
  getByTaskId(taskId: string): ExecutionEventBus | undefined {
    return this.realManager.getByTaskId(taskId);
  }

  /**
   * Cleanup a specific task's event bus
   */
  cleanupByTaskId(taskId: string): void {
    this.realManager.cleanupByTaskId(taskId);
    // Keep the recording for test assertions even after cleanup
  }

  /**
   * Get the recording bus for a specific task
   * Returns undefined if no bus was created for that task
   */
  getRecordingBus(taskId: string): RecordingRealEventBus | undefined {
    return this.recordedBuses.get(taskId);
  }

  /**
   * Get all recorded buses
   */
  getAllRecordingBuses(): Map<string, RecordingRealEventBus> {
    return new Map(this.recordedBuses);
  }

  /**
   * Find events across all buses by kind
   */
  findEventsByKindAcrossAllBuses<T extends AgentExecutionEvent>(
    kind: T['kind'],
  ): Array<{
    bus: RecordingRealEventBus;
    event: Extract<AgentExecutionEvent, { kind: T['kind'] }>;
  }> {
    const results: Array<{
      bus: RecordingRealEventBus;
      event: Extract<AgentExecutionEvent, { kind: T['kind'] }>;
    }> = [];

    for (const bus of this.recordedBuses.values()) {
      const events = bus.findEventsByKind(kind);
      for (const event of events) {
        results.push({ bus, event });
      }
    }

    return results;
  }

  /**
   * Clear all recorded events from all buses
   */
  clearAll(): void {
    for (const bus of this.recordedBuses.values()) {
      bus.clear();
    }
  }
}
