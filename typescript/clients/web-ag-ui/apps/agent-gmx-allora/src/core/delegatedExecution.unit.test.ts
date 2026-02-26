import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnchainClients } from '../clients/clients.js';
import type { TransactionPlan } from '../clients/onchainActions.js';
import type { DelegationBundle } from '../workflow/context.js';

import { redeemDelegationsAndExecuteTransactions } from './delegatedExecution.js';

const {
  encodeExecutionCalldatasMock,
  encodePermissionContextsMock,
  getBalanceMock,
  sendTransactionMock,
  waitForTransactionReceiptMock,
} = vi.hoisted(() => ({
  encodeExecutionCalldatasMock: vi.fn(),
  encodePermissionContextsMock: vi.fn(),
  getBalanceMock: vi.fn(),
  sendTransactionMock: vi.fn(),
  waitForTransactionReceiptMock: vi.fn(),
}));

vi.mock('@metamask/delegation-toolkit/utils', () => ({
  encodeExecutionCalldatas: encodeExecutionCalldatasMock,
  encodePermissionContexts: encodePermissionContextsMock,
}));

function buildClients(): OnchainClients {
  return {
    public: {
      getBalance: getBalanceMock,
      waitForTransactionReceipt: waitForTransactionReceiptMock,
    },
    wallet: {
      account: { address: '0x3fd83e40f96c3c81a807575f959e55c34a40e523' },
      chain: { id: 42161, name: 'Arbitrum' },
      sendTransaction: sendTransactionMock,
    },
  } as unknown as OnchainClients;
}

function buildDelegationBundle(): DelegationBundle {
  return {
    chainId: 42161,
    delegationManager: '0xdb9b1e94b5b69df7e401ddbede43491141047db3',
    delegatorAddress: '0x8af45a2c60abe9172d93acddb40473dcc66aa9b9',
    delegateeAddress: '0x3fd83e40f96c3c81a807575f959e55c34a40e523',
    delegations: [
      {
        delegate: '0x3fd83e40f96c3c81a807575f959e55c34a40e523',
        delegator: '0x8af45a2c60abe9172d93acddb40473dcc66aa9b9',
        authority: `0x${'f'.repeat(64)}`,
        caveats: [],
        salt: `0x${'1'.repeat(64)}`,
        signature: `0x${'2'.repeat(130)}`,
      },
    ],
    intents: [],
    descriptions: [],
    warnings: [],
  };
}

function buildTransactions(): TransactionPlan[] {
  return [
    {
      type: 'evm',
      to: '0x1c3fa76e6e1088bce750f23a5bfcffa1efef6a41',
      data: '0xac9650d8',
      value: '154022477601600',
      chainId: '42161',
    },
  ];
}

describe('redeemDelegationsAndExecuteTransactions', () => {
  beforeEach(() => {
    encodeExecutionCalldatasMock.mockReset();
    encodePermissionContextsMock.mockReset();
    getBalanceMock.mockReset();
    sendTransactionMock.mockReset();
    waitForTransactionReceiptMock.mockReset();

    encodeExecutionCalldatasMock.mockReturnValue(['0x12']);
  });

  it('submits delegated transactions through delegation manager and waits for success receipts', async () => {
    const clients = buildClients();
    const delegationBundle = buildDelegationBundle();
    const transactions = buildTransactions();

    encodePermissionContextsMock.mockReturnValueOnce(['0xpermissioncontext']);
    getBalanceMock.mockResolvedValueOnce(154022477601600n);
    sendTransactionMock.mockResolvedValueOnce(
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
    waitForTransactionReceiptMock.mockResolvedValueOnce({ status: 'success' });

    const result = await redeemDelegationsAndExecuteTransactions({
      clients,
      delegationBundle,
      transactions,
    });

    expect(getBalanceMock).toHaveBeenCalledWith({
      address: '0x8af45a2c60abe9172d93acddb40473dcc66aa9b9',
    });
    expect(sendTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '0xdb9b1e94b5b69df7e401ddbede43491141047db3',
        value: 0n,
      }),
    );
    const submittedTransaction = sendTransactionMock.mock.calls.at(0)?.[0] as
      | { data?: string }
      | undefined;
    expect(submittedTransaction?.data?.startsWith('0xcef6d209')).toBe(true);
    expect(encodeExecutionCalldatasMock).toHaveBeenCalledWith([
      [
        {
          target: '0x1c3fa76e6e1088bce750f23a5bfcffa1efef6a41',
          value: 154022477601600n,
          callData: '0xac9650d8',
        },
      ],
    ]);
    expect(result).toEqual({
      txHashes: ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
      lastTxHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
  });

  it('throws when bundle has no signed delegations', async () => {
    const clients = buildClients();
    const delegationBundle = {
      ...buildDelegationBundle(),
      delegations: [],
    };

    await expect(
      redeemDelegationsAndExecuteTransactions({
        clients,
        delegationBundle,
        transactions: buildTransactions(),
      }),
    ).rejects.toThrow('Delegation bundle did not include any signed delegations');
  });

  it('throws when delegator wallet cannot cover the required tx value', async () => {
    const clients = buildClients();
    const delegationBundle = buildDelegationBundle();

    encodePermissionContextsMock.mockReturnValueOnce(['0xpermissioncontext']);
    getBalanceMock.mockResolvedValueOnce(100n);

    await expect(
      redeemDelegationsAndExecuteTransactions({
        clients,
        delegationBundle,
        transactions: buildTransactions(),
      }),
    ).rejects.toThrow('delegator wallet');

    expect(sendTransactionMock).not.toHaveBeenCalled();
  });

  it('normalizes 66-byte signatures before encoding delegation permissions context', async () => {
    const clients = buildClients();
    const delegationBundle = {
      ...buildDelegationBundle(),
      delegations: [
        {
          ...buildDelegationBundle().delegations[0],
          signature: `0x41${'2'.repeat(130)}` as `0x${string}`,
        },
      ],
    };

    encodePermissionContextsMock.mockReturnValueOnce(['0xpermissioncontext']);
    getBalanceMock.mockResolvedValueOnce(154022477601600n);
    sendTransactionMock.mockResolvedValueOnce(
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
    waitForTransactionReceiptMock.mockResolvedValueOnce({ status: 'success' });

    await redeemDelegationsAndExecuteTransactions({
      clients,
      delegationBundle,
      transactions: buildTransactions(),
    });

    expect(encodePermissionContextsMock).toHaveBeenCalledWith([
      [
        expect.objectContaining({
          signature: `0x${'2'.repeat(130)}`,
        }),
      ],
    ]);
  });

  it('surfaces submission errors with tx index context', async () => {
    const clients = buildClients();
    const delegationBundle = buildDelegationBundle();

    encodePermissionContextsMock.mockReturnValueOnce(['0xpermissioncontext']);
    getBalanceMock.mockResolvedValueOnce(154022477601600n);
    sendTransactionMock.mockRejectedValueOnce(new Error('execution reverted'));

    await expect(
      redeemDelegationsAndExecuteTransactions({
        clients,
        delegationBundle,
        transactions: buildTransactions(),
      }),
    ).rejects.toThrow('Delegated GMX transaction submission failed for tx 1/1');
  });
});
