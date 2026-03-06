import { describe, expect, it } from 'vitest';

import { isAbortLikeError, isAgentRunning, isBusyRunError } from './runConcurrency';

describe('runConcurrency', () => {
  it('recognizes server busy statuses', () => {
    expect(isBusyRunError({ status: 409 })).toBe(true);
    expect(isBusyRunError({ statusCode: 422 })).toBe(true);
    expect(isBusyRunError({ response: { status: '409' } })).toBe(true);
  });

  it('recognizes busy message variants', () => {
    expect(isBusyRunError({ message: 'Thread is busy' })).toBe(true);
    expect(isBusyRunError({ message: 'run_started already active' })).toBe(true);
    expect(isBusyRunError({ message: 'currently active run' })).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isBusyRunError({ message: 'bad gateway', status: 502 })).toBe(false);
    expect(isBusyRunError(new Error('network error'))).toBe(false);
  });

  it('recognizes abort-like transport errors', () => {
    expect(isAbortLikeError({ name: 'AbortError' })).toBe(true);
    expect(isAbortLikeError({ message: 'BodyStreamBuffer was aborted' })).toBe(true);
    expect(isAbortLikeError({ status: 499 })).toBe(true);
    expect(isAbortLikeError({ message: 'network error' })).toBe(false);
  });

  it('detects running agent flag as boolean or function', () => {
    expect(isAgentRunning({ isRunning: true })).toBe(true);
    expect(isAgentRunning({ isRunning: false })).toBe(false);
    expect(isAgentRunning({ isRunning: () => true })).toBe(true);
    expect(isAgentRunning({ isRunning: () => false })).toBe(false);
    expect(isAgentRunning({})).toBe(false);
  });
});
