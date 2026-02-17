import { describe, expect, it } from 'vitest';

import { resolveSidebarTaskState } from './resolveSidebarTaskState';

describe('resolveSidebarTaskState', () => {
  it('uses runtime non-blocked state without coercion', () => {
    expect(
      resolveSidebarTaskState({
        listTaskState: 'working',
        runtimeTaskState: 'working',
      }),
    ).toBe('working');
  });

  it('keeps list input-required when runtime is stale and non-blocked', () => {
    expect(
      resolveSidebarTaskState({
        listTaskState: 'input-required',
        runtimeTaskState: 'submitted',
      }),
    ).toBe('input-required');
  });

  it('keeps list failed when runtime is stale and non-blocked', () => {
    expect(
      resolveSidebarTaskState({
        listTaskState: 'failed',
        runtimeTaskState: 'working',
      }),
    ).toBe('failed');
  });

  it('uses runtime state when runtime is blocked', () => {
    expect(
      resolveSidebarTaskState({
        listTaskState: 'working',
        runtimeTaskState: 'input-required',
      }),
    ).toBe('input-required');
  });

  it('uses runtime state for non-blocked transitions', () => {
    expect(
      resolveSidebarTaskState({
        listTaskState: 'completed',
        runtimeTaskState: 'working',
      }),
    ).toBe('working');
  });
});
