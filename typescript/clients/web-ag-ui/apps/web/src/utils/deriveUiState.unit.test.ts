import { describe, expect, it } from 'vitest';

import { defaultThreadState, type ThreadState } from '../types/agent';
import { deriveUiState } from './deriveUiState';

describe('deriveUiState', () => {
  it('projects thread state into a dedicated UI view-model', () => {
    const threadState: ThreadState = {
      ...defaultThreadState,
      lifecycle: { phase: 'active' },
      profile: {
        ...defaultThreadState.profile,
        protocols: ['Camelot'],
      },
    };

    const uiState = deriveUiState({
      threadState,
      runtime: {
        isConnected: true,
        hasLoadedSnapshot: true,
        commandInFlight: false,
        syncPending: false,
        pendingSyncMutationId: null,
      },
    });

    expect(uiState.lifecycle?.phase).toBe('active');
    expect(uiState.profile.protocols).toEqual(['Camelot']);
    expect(uiState.runtime.hasLoadedSnapshot).toBe(true);
    expect(uiState.selectors.lifecyclePhase).toBe('active');
    expect(uiState.selectors.isHired).toBe(true);
    expect(uiState.selectors.isActive).toBe(false);
    expect(uiState.selectors.isOnboardingActive).toBe(false);
    expect(uiState.selectors.effectiveTaskState).toBe(null);
  });

  it('copies collection fields so UI mutations do not back-propagate into thread state', () => {
    const threadState: ThreadState = {
      ...defaultThreadState,
      profile: {
        ...defaultThreadState.profile,
        tokens: ['WETH'],
      },
      transactionHistory: [
        {
          cycle: 1,
          action: 'rebalance',
          status: 'success',
          timestamp: '2026-02-28T00:00:00.000Z',
        },
      ],
    };

    const uiState = deriveUiState({
      threadState,
      runtime: {
        isConnected: false,
        hasLoadedSnapshot: false,
        commandInFlight: false,
        syncPending: false,
        pendingSyncMutationId: null,
      },
    });

    uiState.profile.tokens.push('USDC');
    uiState.transactionHistory.push({
      cycle: 2,
      action: 'hold',
      status: 'success',
      timestamp: '2026-02-28T00:01:00.000Z',
    });

    expect(threadState.profile.tokens).toEqual(['WETH']);
    expect(threadState.transactionHistory).toHaveLength(1);
  });

  it('normalizes malformed collection fields from runtime payloads', () => {
    const malformedThreadState = {
      ...defaultThreadState,
      profile: {
        ...defaultThreadState.profile,
        tokens: undefined,
      },
      activity: {
        ...defaultThreadState.activity,
        telemetry: undefined,
        events: undefined,
      },
      transactionHistory: undefined,
    } as unknown as ThreadState;

    const uiState = deriveUiState({
      threadState: malformedThreadState,
      runtime: {
        isConnected: true,
        hasLoadedSnapshot: true,
        commandInFlight: false,
        syncPending: false,
        pendingSyncMutationId: null,
      },
    });

    expect(uiState.profile.tokens).toEqual([]);
    expect(uiState.activity.telemetry).toEqual([]);
    expect(uiState.activity.events).toEqual([]);
    expect(uiState.transactionHistory).toEqual([]);
  });

  it('derives onboarding/active selectors from task and onboarding lifecycle', () => {
    const threadState: ThreadState = {
      ...defaultThreadState,
      lifecycle: { phase: 'onboarding' },
      task: {
        id: 'task-1',
        taskStatus: {
          state: 'input-required',
          message: { content: 'Waiting for delegation approval.' },
        },
      },
      onboardingFlow: {
        status: 'in_progress',
        revision: 2,
        steps: [],
      },
    };

    const uiState = deriveUiState({
      threadState,
      runtime: {
        isConnected: true,
        hasLoadedSnapshot: true,
        commandInFlight: false,
        syncPending: false,
        pendingSyncMutationId: null,
      },
    });

    expect(uiState.selectors.lifecyclePhase).toBe('onboarding');
    expect(uiState.selectors.effectiveTaskState).toBe('input-required');
    expect(uiState.selectors.isOnboardingActive).toBe(true);
    expect(uiState.selectors.isHired).toBe(true);
    expect(uiState.selectors.isActive).toBe(true);
  });

  it('normalizes firing interrupt-like failures into completed effective task state', () => {
    const threadState: ThreadState = {
      ...defaultThreadState,
      lifecycle: { phase: 'firing' },
      task: {
        id: 'task-fire',
        taskStatus: {
          state: 'failed',
          message: { content: 'AbortError: interrupt while preempting active run' },
        },
      },
    };

    const uiState = deriveUiState({
      threadState,
      runtime: {
        isConnected: true,
        hasLoadedSnapshot: true,
        commandInFlight: false,
        syncPending: false,
        pendingSyncMutationId: null,
      },
    });

    expect(uiState.selectors.effectiveTaskState).toBe('completed');
  });
});
