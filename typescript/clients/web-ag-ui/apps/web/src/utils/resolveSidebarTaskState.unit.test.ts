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

  it('prefers runtime non-blocked state over stale list input-required', () => {
    expect(
      resolveSidebarTaskState({
        listTaskState: 'input-required',
        runtimeTaskState: 'submitted',
      }),
    ).toBe('submitted');
  });

  it('prefers runtime non-blocked state over stale list failed', () => {
    expect(
      resolveSidebarTaskState({
        listTaskState: 'failed',
        runtimeTaskState: 'working',
      }),
    ).toBe('working');
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

  it('falls back to list state by default when runtime state is missing', () => {
    expect(
      resolveSidebarTaskState({
        listTaskState: 'input-required',
        runtimeTaskState: undefined,
      }),
    ).toBe('input-required');
  });

  it('can suppress list fallback when runtime source is authoritative', () => {
    expect(
      resolveSidebarTaskState({
        listTaskState: 'input-required',
        runtimeTaskState: undefined,
        fallbackToListWhenRuntimeMissing: false,
      }),
    ).toBeUndefined();
  });
});
