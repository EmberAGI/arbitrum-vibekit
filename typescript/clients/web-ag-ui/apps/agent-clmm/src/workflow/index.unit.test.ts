/* eslint-disable import/order */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { type OnchainClients } from '../clients/clients.js';
import { type EmberCamelotClient, type TransactionInformation } from '../clients/emberApi.js';
import { type CamelotPool, type ClmmAction, type ResolvedOperatorConfig } from '../domain/types.js';
import { executeDecision } from './index.js';

const { ensureAllowanceMock, executeTransactionMock } = vi.hoisted(() => {
  process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'] ??= `0x${'1'.repeat(64)}`;
  return {
    ensureAllowanceMock: vi.fn(),
    executeTransactionMock: vi.fn(),
  };
});

vi.mock('../core/allowances.js', () => ({
  ensureAllowance: ensureAllowanceMock,
}));

vi.mock('../core/transaction.js', () => ({
  executeTransaction: executeTransactionMock,
}));

function makePool(): CamelotPool {
  return {
    address: '0xpool',
    token0: { address: '0xtoken0', symbol: 'TK0', decimals: 18, usdPrice: 2000 },
    token1: { address: '0xtoken1', symbol: 'TK1', decimals: 6, usdPrice: 1 },
    tickSpacing: 60,
    tick: 0,
    liquidity: '1',
  };
}

type TestClients = OnchainClients & {
  __mocks: {
    readContract: Mock;
    call: Mock;
  };
};

function makeClients(): TestClients {
  const abundantBalance = 10_000_000_000_000_000n;
  const readContract = vi.fn().mockResolvedValue(abundantBalance);
  const call = vi.fn().mockResolvedValue('0x');
  const publicClient = {
    readContract,
    call,
  };
  return {
    public: publicClient as unknown as OnchainClients['public'],
    wallet: { account: { address: '0xwallet' } } as OnchainClients['wallet'],
    __mocks: {
      readContract,
      call,
    },
  } satisfies TestClients;
}

const operatorConfig: ResolvedOperatorConfig = {
  walletAddress: '0xwallet',
  baseContributionUsd: 1.5,
  autoCompoundFees: true,
  manualBandwidthBps: 75,
};

const withdrawTx: TransactionInformation = {
  type: 'EVM_TX',
  to: '0xwithdraw',
  data: '0xdead',
  value: '0',
  chainId: '42161',
};

const reenterTx: TransactionInformation = {
  type: 'EVM_TX',
  to: '0xreenter',
  data: '0xbeef',
  value: '0',
  chainId: '42161',
};

function makeAdjustRangeAction(): ClmmAction {
  return {
    kind: 'adjust-range',
    reason: 'test',
    targetRange: {
      lowerTick: -10,
      upperTick: 10,
      lowerPrice: 1,
      upperPrice: 2,
      bandwidthBps: 100,
    },
  };
}

type ConsoleInfoArgs = [message: unknown, ...rest: unknown[]];

type LogEntry = {
  message: string;
  metadata?: Record<string, unknown>;
};

const consoleInfoCalls: ConsoleInfoArgs[] = [];
let restoreConsoleInfo: (() => void) | undefined;

describe('executeDecision', () => {
  beforeEach(() => {
    consoleInfoCalls.length = 0;
    const originalInfo = console.info;
    console.info = ((...args: ConsoleInfoArgs) => {
      consoleInfoCalls.push(args);
    }) as typeof console.info;
    restoreConsoleInfo = () => {
      console.info = originalInfo;
    };
    ensureAllowanceMock.mockReset();
    ensureAllowanceMock.mockResolvedValue(undefined);
    executeTransactionMock.mockReset();
  });

  afterEach(() => {
    restoreConsoleInfo?.();
    restoreConsoleInfo = undefined;
  });

  it('withdraws before minting when adjusting range', async () => {
    // Given an adjust-range decision with an existing LP position that requires a withdrawal-first rebalance
    const requestWithdrawal = vi
      .fn()
      .mockResolvedValueOnce({ transactions: [withdrawTx] })
      .mockResolvedValue({ transactions: [] });
    const requestRebalance = vi.fn().mockResolvedValue({ transactions: [reenterTx] });
    const camelotClient = {
      requestWithdrawal,
      requestRebalance,
      listCamelotPools: vi.fn().mockResolvedValue([makePool()]),
    } as unknown as EmberCamelotClient;

    executeTransactionMock.mockResolvedValueOnce({
      transactionHash: '0xwithdrawhash',
      status: 'success',
      blockNumber: 1n,
    });
    executeTransactionMock.mockResolvedValueOnce({
      transactionHash: '0xreenterhash',
      status: 'success',
      blockNumber: 2n,
    });

    // When executeDecision orchestrates the adjustment
    const outcome = await executeDecision({
      action: makeAdjustRangeAction(),
      camelotClient,
      pool: makePool(),
      operatorConfig,
      clients: makeClients(),
    });

    // Then it should withdraw before minting, ensuring allowances and transaction ordering remain correct
    expect(requestWithdrawal).toHaveBeenCalledTimes(2);
    expect(requestRebalance).toHaveBeenCalledTimes(1);
    expect(ensureAllowanceMock).toHaveBeenCalledTimes(2);
    expect(executeTransactionMock).toHaveBeenCalledTimes(2);
    expect(executeTransactionMock.mock.calls[0]?.[1]).toMatchObject({ to: '0xwithdraw' });
    expect(executeTransactionMock.mock.calls[1]?.[1]).toMatchObject({ to: '0xreenter' });
    expect(outcome?.txHash).toBe('0xreenterhash');
  });

  it('logs transaction lifecycle events for each executed plan transaction', async () => {
    // Given a withdrawal + re-entry plan with deterministic receipts
    const requestWithdrawal = vi
      .fn()
      .mockResolvedValueOnce({ transactions: [withdrawTx] })
      .mockResolvedValue({ transactions: [] });
    const requestRebalance = vi.fn().mockResolvedValue({ transactions: [reenterTx] });
    const camelotClient = {
      requestWithdrawal,
      requestRebalance,
      listCamelotPools: vi.fn().mockResolvedValue([makePool()]),
    } as unknown as EmberCamelotClient;

    executeTransactionMock
      .mockResolvedValueOnce({
        transactionHash: '0xwithdrawhash',
        status: 'success',
        blockNumber: 1n,
      })
      .mockResolvedValueOnce({
        transactionHash: '0xreenterhash',
        status: 'success',
        blockNumber: 2n,
      });

    // When the decision executes successfully
    await executeDecision({
      action: makeAdjustRangeAction(),
      camelotClient,
      pool: makePool(),
      operatorConfig,
      clients: makeClients(),
    });

    // Then each transaction should emit submission + confirmation logs
    const submissionLogs = collectLogs('Submitting Camelot transaction');
    expect(submissionLogs).toHaveLength(2);
    assertMetadata(submissionLogs[0]).toMatchObject({ to: '0xwithdraw', chainId: '42161' });
    assertMetadata(submissionLogs[1]).toMatchObject({ to: '0xreenter', chainId: '42161' });

    const confirmations = collectLogs('Transaction confirmed');
    expect(confirmations).toHaveLength(2);
    assertMetadata(confirmations[0]).toMatchObject({ transactionHash: '0xwithdrawhash' });
    assertMetadata(confirmations[1]).toMatchObject({ transactionHash: '0xreenterhash' });
  });

  it('logs transaction failures before surfacing revert errors', async () => {
    // Given a withdrawal plan that reverts on-chain
    const requestWithdrawal = vi.fn().mockResolvedValue({ transactions: [withdrawTx] });
    const requestRebalance = vi.fn();
    const camelotClient = {
      requestWithdrawal,
      requestRebalance,
      listCamelotPools: vi.fn().mockResolvedValue([makePool()]),
    } as unknown as EmberCamelotClient;

    executeTransactionMock.mockResolvedValueOnce({
      transactionHash: '0xfailure',
      status: 'reverted',
      blockNumber: 99n,
    });

    const clients = makeClients();
    clients.__mocks.call.mockRejectedValueOnce(
      new Error('execution reverted: Token ID not found!'),
    );

    // When the decision executes the reverting plan
    await expect(
      executeDecision({
        action: makeAdjustRangeAction(),
        camelotClient,
        pool: makePool(),
        operatorConfig,
        clients,
      }),
    ).rejects.toThrow(/Camelot transaction 0xfailure reverted/);

    // Then a failure log should precede the thrown error
    const failureLogs = collectLogs('Transaction failed');
    expect(failureLogs).toHaveLength(1);
    assertMetadata(failureLogs[0]).toMatchObject({ transactionHash: '0xfailure' });
  });
});

function collectLogs(substring: string): LogEntry[] {
  return consoleInfoCalls
    .map<LogEntry | undefined>((args) => {
      const [message, metadata] = args;
      if (typeof message !== 'string') {
        return undefined;
      }
      const entry: LogEntry = { message };
      if (typeof metadata === 'object' && metadata !== null) {
        entry.metadata = metadata as Record<string, unknown>;
      }
      return entry;
    })
    .filter(
      (entry): entry is LogEntry => Boolean(entry) && entry.message.includes(substring),
    );
}

function assertMetadata(entry: LogEntry | undefined) {
  if (!entry) {
    throw new Error('Expected log entry to be defined');
  }
  if (!entry.metadata) {
    throw new Error('Expected log entry metadata');
  }
  return expect(entry.metadata);
}
