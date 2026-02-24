import { readFile } from 'node:fs/promises';

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
  it('uses core transition helpers instead of direct Command construction', async () => {
    const source = await readFile(new URL('./acknowledgeFundWallet.ts', import.meta.url), 'utf8');
    expect(source.includes('new Command(')).toBe(false);
  });

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
    expect(commandResult.update?.view?.onboarding).toBeUndefined();
    expect(commandResult.update?.view?.haltReason).toBe('');
    expect(commandResult.update?.view?.executionError).toBe('');
  });

  it('uses default pending message when executionError is blank', async () => {
    interruptMock.mockReset();
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      view: {
        executionError: '   ',
        task: {
          id: 'task-2',
          taskStatus: {
            state: 'working',
            message: { content: 'previous message' },
          },
        },
        activity: { telemetry: [], events: [] },
      },
    } as unknown as ClmmState;

    const result = await acknowledgeFundWalletNode(state, { configurable: { thread_id: 'thread-2' } });
    const commandResult = result as unknown as {
      update?: {
        view?: {
          task?: { taskStatus?: { message?: { content?: string } } };
        };
      };
    };

    expect(commandResult.update?.view?.task?.taskStatus?.message?.content).toContain(
      'GMX order simulation failed',
    );
    expect(commandResult.update?.view?.task?.taskStatus?.message?.content).toContain(
      'Ensure the trading wallet has enough USDC collateral',
    );
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

  it('uses a non-empty fallback interrupt message when task message is blank', async () => {
    interruptMock.mockReset();
    copilotkitEmitStateMock.mockReset();
    interruptMock.mockResolvedValue({ acknowledged: true });

    const state = {
      view: {
        task: {
          id: 'task-3',
          taskStatus: {
            state: 'input-required',
            message: { content: '' },
          },
        },
        operatorConfig: {
          delegatorWalletAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        },
        selectedPool: {
          quoteSymbol: 'USDC',
        },
      },
    } as unknown as ClmmState;

    await acknowledgeFundWalletNode(state, {});

    const firstInterruptCall = interruptMock.mock.calls[0];
    const interruptPayload = firstInterruptCall?.[0] as
      | { type?: unknown; message?: unknown }
      | undefined;

    expect(interruptPayload?.type).toBe('gmx-fund-wallet-request');
    expect(typeof interruptPayload?.message).toBe('string');
    expect(interruptPayload?.message).toContain('GMX order simulation failed');
  });
});
