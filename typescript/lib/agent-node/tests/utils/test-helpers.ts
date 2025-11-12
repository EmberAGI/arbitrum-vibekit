import { vi } from 'vitest';
import type { MockInstance } from 'vitest';

/**
 * Helper to create a mock that captures calls for verification
 */
export function createCaptureMock<T extends (...args: unknown[]) => unknown>(): {
  mock: MockInstance<T>;
  getCalls: () => Parameters<T>[];
  getLastCall: () => Parameters<T> | undefined;
} {
  const mock = vi.fn<T>();

  return {
    mock,
    getCalls: () => mock.mock.calls,
    getLastCall: () => {
      const calls = mock.mock.calls;
      return calls.length > 0 ? (calls[calls.length - 1] as Parameters<T>) : undefined;
    },
  };
}

/**
 * Helper to wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Helper to create test fixtures
 */
export function createFixture<T>(factory: () => T): () => T {
  return () => structuredClone(factory());
}
