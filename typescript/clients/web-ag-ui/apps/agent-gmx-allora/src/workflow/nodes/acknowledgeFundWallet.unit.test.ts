import { describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../context.js';

import { acknowledgeFundWalletNode } from './acknowledgeFundWallet.js';

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

describe('acknowledgeFundWalletNode', () => {
  it('persists input-required state via Command before interrupting when runnable config exists', async () => {
    interruptMock.mockReset();
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      view: {
        task: {
          id: 'task-1',
          taskStatus: {
            state: 'working',
            message: { content: '[Cycle 1] hold: ...' },
          },
        },
        activity: { telemetry: [], events: [] },
      },
    } as unknown as ClmmState;

    const result = await acknowledgeFundWalletNode(state, { configurable: { thread_id: 'thread-1' } });
    const commandResult = result as unknown as {
      goto?: string[];
      update?: {
        view?: {
          task?: { taskStatus?: { state?: string; message?: { content?: string } } };
          onboarding?: { step?: number; key?: string };
          haltReason?: string;
          executionError?: string;
        };
      };
    };

    expect(interruptMock).not.toHaveBeenCalled();
    expect(copilotkitEmitStateMock).toHaveBeenCalledTimes(1);
    expect(commandResult.goto).toContain('acknowledgeFundWallet');
    expect(commandResult.update?.view?.task?.taskStatus?.state).toBe('input-required');
    expect(commandResult.update?.view?.task?.taskStatus?.message?.content).toContain(
      'GMX order simulation failed',
    );
    expect(commandResult.update?.view?.onboarding).toEqual({
      step: 4,
      key: 'fund-wallet',
    });
    expect(commandResult.update?.view?.haltReason).toBe('');
    expect(commandResult.update?.view?.executionError).toBe('');
  });

  it('emits a GMX fund-wallet interrupt and ends after acknowledgement', async () => {
    interruptMock.mockReset();
    copilotkitEmitStateMock.mockReset();
    interruptMock.mockResolvedValue({ acknowledged: true });

    const state = {
      view: {
        task: {
          id: 'task-1',
          taskStatus: {
            state: 'input-required',
            message: { content: 'GMX order simulation failed.' },
          },
        },
        operatorConfig: {
          delegatorWalletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
        selectedPool: {
          quoteSymbol: 'USDC',
        },
      },
    } as unknown as ClmmState;

    const result = await acknowledgeFundWalletNode(state, {});
    const commandResult = result as unknown as {
      goto?: string[];
    };

    expect(interruptMock).toHaveBeenCalledTimes(1);
    expect(interruptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'gmx-fund-wallet-request',
        walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        requiredCollateralSymbol: 'USDC',
      }),
    );
    expect(commandResult.goto).toContain('__end__');
  });

  it('treats invalid acknowledgement payloads as no-op end', async () => {
    interruptMock.mockReset();
    copilotkitEmitStateMock.mockReset();
    interruptMock.mockResolvedValue({ acknowledged: false });

    const state = {
      view: {},
    } as unknown as ClmmState;

    const result = await acknowledgeFundWalletNode(state, {});
    const commandResult = result as unknown as {
      goto?: string[];
    };

    expect(commandResult.goto).toContain('__end__');
  });
});
