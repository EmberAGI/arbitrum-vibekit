import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../context.js';

import { collectSetupInputNode } from './collectSetupInput.js';

const { interruptMock, copilotkitEmitStateMock } = vi.hoisted(() => ({
  interruptMock: vi.fn(),
  copilotkitEmitStateMock: vi.fn(),
}));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));

vi.mock('@langchain/langgraph', async (importOriginal) => {
  const actual: unknown = await importOriginal();
  if (typeof actual !== 'object' || actual === null) {
    throw new Error('Unexpected @langchain/langgraph mock import shape');
  }
  return {
    ...(actual as Record<string, unknown>),
    interrupt: interruptMock,
  };
});

describe('collectSetupInputNode', () => {
  it('uses core transition helpers instead of direct Command construction', async () => {
    const source = await readFile(new URL('./collectSetupInput.ts', import.meta.url), 'utf8');
    expect(source.includes('new Command(')).toBe(false);
  });

  it('persists input-required state before interrupting when runnable config exists', async () => {
    interruptMock.mockReset();
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      thread: {
        task: { id: 'task-1', taskStatus: { state: 'submitted' } },
        activity: { telemetry: [], events: [] },
      },
    } as unknown as ClmmState;

    const result = await collectSetupInputNode(state, { configurable: { thread_id: 'thread-1' } });

    expect(interruptMock).not.toHaveBeenCalled();
    expect(copilotkitEmitStateMock).toHaveBeenCalledTimes(1);
    const commandResult = result as unknown as {
      goto?: string[];
      update?: {
        thread?: {
          task?: { taskStatus?: { state?: string } };
          profile?: unknown;
        };
      };
    };
    expect(commandResult.goto).toContain('collectSetupInput');
    expect(commandResult.update?.thread?.task?.taskStatus?.state).toBe('input-required');
    expect(commandResult.update?.thread?.profile).toBeUndefined();
  });

  it('returns a no-op update when setup is already complete', async () => {
    interruptMock.mockReset();
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      thread: {
        operatorInput: {
          walletAddress: '0x1111111111111111111111111111111111111111',
          baseContributionUsd: 25,
        },
        operatorConfig: {
          walletAddress: '0x1111111111111111111111111111111111111111',
          executionWalletAddress: '0x2222222222222222222222222222222222222222',
          baseContributionUsd: 25,
          fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
          targetYieldToken: {
            marketAddress: '0x3333333333333333333333333333333333333333',
            ptAddress: '0x4444444444444444444444444444444444444444',
            ytAddress: '0x5555555555555555555555555555555555555555',
            ptSymbol: 'PT-USDC',
            ytSymbol: 'YT-USDC',
            underlyingSymbol: 'USDC',
            underlyingAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
            maturity: '2030-01-01T00:00:00.000Z',
            apy: 12,
          },
        },
        setupComplete: true,
        onboarding: undefined,
      },
    } as unknown as ClmmState;

    const result = await collectSetupInputNode(state, {});

    expect(result).toEqual({});
    expect(interruptMock).not.toHaveBeenCalled();
    expect(copilotkitEmitStateMock).not.toHaveBeenCalled();
  });
});
