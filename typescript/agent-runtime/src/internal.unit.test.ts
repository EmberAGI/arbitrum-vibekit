import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Model } from '@mariozechner/pi-ai';
import { importWalletPrivateKey } from '@open-wallet-standard/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  AgentRuntimeSigningError,
  AgentRuntimeSigningService,
} from './internal.js';
import {
  createAgentRuntimeKernel,
  createAgentRuntimeSigningService,
  signPreparedDelegation,
  signPreparedEvmTransaction,
} from './internal.js';

const TEST_PRIVATE_KEY =
  '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TEST_WALLET_NAME = 'service-wallet';
const TEST_SIGNER_REF = 'service-wallet';
const TEST_EVM_ADDRESS = '0xfcad0b19bb29d4674531d6f115237e16afce377c' as const;
const TEST_UNSIGNED_TRANSACTION_HEX =
  '0x02e982a4b1018405f5e100843b9aca008252089400000000000000000000000000000000000000c18080c0' as const;
const TEST_UNSIGNED_DELEGATION = {
  delegate: '0x00000000000000000000000000000000000000b1' as const,
  delegator: '0x00000000000000000000000000000000000000c2' as const,
  authority:
    '0x1111111111111111111111111111111111111111111111111111111111111111' as const,
  caveats: [],
  salt: '0x1111111111111111111111111111111111111111111111111111111111111111' as const,
};
const TEST_DELEGATION_SIGNATURE =
  '0x464a27f0b9166323a2d686a053ac34e74c318b59854dcc7de4221837437214870c365e2d8e5060f092656d3bd06f78c324ed296792df9c60f76c68bca5551eb601';

function createModel(id: string): Model<'openai-responses'> {
  return {
    id,
    name: id,
    api: 'openai-responses',
    provider: 'openai',
    baseUrl: 'https://example.invalid',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 2048,
  };
}

function createInternalPostgresHooks() {
  return {
    ensureReady: vi.fn(async () => ({
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
    })),
    loadInspectionState: vi.fn(async () => ({
      threads: [],
      executions: [],
      automations: [],
      automationRuns: [],
      interrupts: [],
      leases: [],
      outboxIntents: [],
      executionEvents: [],
      threadActivities: [],
    })),
    executeStatements: vi.fn(async () => undefined),
    persistDirectExecution: vi.fn(async () => undefined),
  };
}

function createOwsTestSignerEnv() {
  const vaultPath = mkdtempSync(path.join(os.tmpdir(), 'agent-runtime-ows-'));
  importWalletPrivateKey(TEST_WALLET_NAME, TEST_PRIVATE_KEY, undefined, vaultPath, 'evm');

  return {
    vaultPath,
    cleanup() {
      rmSync(vaultPath, {
        recursive: true,
        force: true,
      });
    },
    env: {
      TEST_OWS_WALLET_NAME: TEST_WALLET_NAME,
      TEST_OWS_VAULT_PATH: vaultPath,
    },
  };
}

function createSigningService(env: NodeJS.ProcessEnv) {
  return createAgentRuntimeSigningService({
    env,
    owsSigners: [
      {
        signerRef: TEST_SIGNER_REF,
        walletNameOrIdEnvVar: 'TEST_OWS_WALLET_NAME',
        vaultPathEnvVar: 'TEST_OWS_VAULT_PATH',
      },
    ],
  });
}

const cleanupFns = new Set<() => void>();

afterEach(() => {
  for (const cleanup of cleanupFns) {
    cleanup();
  }
  cleanupFns.clear();
});

describe('agent-runtime internal signing surface', () => {
  it('reads EVM addresses from a direct OWS wallet configured by env', async () => {
    const fixture = createOwsTestSignerEnv();
    cleanupFns.add(fixture.cleanup);

    const signing = createSigningService(fixture.env);

    await expect(
      signing.readAddress({
        signerRef: TEST_SIGNER_REF,
      }),
    ).resolves.toBe(TEST_EVM_ADDRESS);
  });

  it('signs prepared transaction payloads through OWS core and returns a normalized signature envelope', async () => {
    const fixture = createOwsTestSignerEnv();
    cleanupFns.add(fixture.cleanup);

    const signing = createSigningService(fixture.env);

    await expect(
      signing.signPayload({
        signerRef: TEST_SIGNER_REF,
        expectedAddress: TEST_EVM_ADDRESS,
        payloadKind: 'transaction',
        payload: {
          chain: 'evm',
          unsignedTransactionHex: '0xdeadbeef',
        },
      }),
    ).resolves.toMatchObject({
      confirmedAddress: TEST_EVM_ADDRESS,
      signedPayload: {
        signature: expect.stringMatching(/^0x[0-9a-f]+$/),
        recoveryId: expect.any(Number),
      },
    });
  });

  it('builds a signed raw transaction artifact through the shared helper', async () => {
    const fixture = createOwsTestSignerEnv();
    cleanupFns.add(fixture.cleanup);

    const signing = createSigningService(fixture.env);

    await expect(
      signPreparedEvmTransaction({
        signing,
        signerRef: TEST_SIGNER_REF,
        expectedAddress: TEST_EVM_ADDRESS,
        chain: 'evm',
        unsignedTransactionHex: TEST_UNSIGNED_TRANSACTION_HEX,
      }),
    ).resolves.toMatchObject({
      kind: 'evm-raw-transaction',
      confirmedAddress: TEST_EVM_ADDRESS,
      signature: expect.stringMatching(/^0x[0-9a-f]+$/),
      rawTransaction: expect.stringMatching(/^0x[0-9a-f]+$/),
      recoveryId: expect.any(Number),
    });
  });

  it('builds a signed delegation artifact through the shared helper', async () => {
    const signing: AgentRuntimeSigningService = {
      readAddress: vi.fn(async () => TEST_EVM_ADDRESS),
      signPayload: vi.fn(async () => ({
        confirmedAddress: TEST_EVM_ADDRESS,
        signedPayload: {
          signature: TEST_DELEGATION_SIGNATURE,
        },
      })),
    };

    await expect(
      signPreparedDelegation({
        signing,
        signerRef: TEST_SIGNER_REF,
        expectedAddress: TEST_EVM_ADDRESS,
        chain: 'evm',
        chainId: 42161,
        delegationManager: '0x00000000000000000000000000000000000000d1',
        delegation: TEST_UNSIGNED_DELEGATION,
      }),
    ).resolves.toMatchObject({
      kind: 'metamask-delegation',
      confirmedAddress: TEST_EVM_ADDRESS,
      signature: TEST_DELEGATION_SIGNATURE,
      artifactRef: expect.stringMatching(/^metamask-delegation:/),
      delegation: {
        ...TEST_UNSIGNED_DELEGATION,
        signature: TEST_DELEGATION_SIGNATURE,
      },
    });

    expect(signing.signPayload).toHaveBeenCalledWith({
      signerRef: TEST_SIGNER_REF,
      expectedAddress: TEST_EVM_ADDRESS,
      payloadKind: 'typed-data',
      payload: {
        chain: 'evm',
        typedData: expect.objectContaining({
          domain: expect.objectContaining({
            chainId: 42161,
            name: 'DelegationManager',
            version: '1',
            verifyingContract: '0x00000000000000000000000000000000000000d1',
          }),
          message: expect.objectContaining({
            delegate: TEST_UNSIGNED_DELEGATION.delegate,
            delegator: TEST_UNSIGNED_DELEGATION.delegator,
            authority: TEST_UNSIGNED_DELEGATION.authority,
            caveats: [],
            salt: BigInt(TEST_UNSIGNED_DELEGATION.salt),
          }),
        }),
      },
    });
  });

  it('accepts a non-prefixed signature from a custom signing service and normalizes it', async () => {
    const signatureWithoutPrefix =
      '464a27f0b9166323a2d686a053ac34e74c318b59854dcc7de4221837437214870c365e2d8e5060f092656d3bd06f78c324ed296792df9c60f76c68bca5551eb601';
    const signing: AgentRuntimeSigningService = {
      readAddress: vi.fn(async () => TEST_EVM_ADDRESS),
      signPayload: vi.fn(async () => ({
        confirmedAddress: TEST_EVM_ADDRESS,
        signedPayload: {
          signature: signatureWithoutPrefix,
          recoveryId: 1,
        },
      })),
    };

    await expect(
      signPreparedEvmTransaction({
        signing,
        signerRef: TEST_SIGNER_REF,
        expectedAddress: TEST_EVM_ADDRESS,
        chain: 'evm',
        unsignedTransactionHex: TEST_UNSIGNED_TRANSACTION_HEX,
      }),
    ).resolves.toMatchObject({
      kind: 'evm-raw-transaction',
      confirmedAddress: TEST_EVM_ADDRESS,
      signature: `0x${signatureWithoutPrefix}`,
      rawTransaction: expect.stringMatching(/^0x[0-9a-f]+$/),
    });
  });

  it('accepts a non-prefixed delegation signature and normalizes it', async () => {
    const signatureWithoutPrefix = TEST_DELEGATION_SIGNATURE.slice(2);
    const signing: AgentRuntimeSigningService = {
      readAddress: vi.fn(async () => TEST_EVM_ADDRESS),
      signPayload: vi.fn(async () => ({
        confirmedAddress: TEST_EVM_ADDRESS,
        signedPayload: {
          signature: signatureWithoutPrefix,
        },
      })),
    };

    await expect(
      signPreparedDelegation({
        signing,
        signerRef: TEST_SIGNER_REF,
        expectedAddress: TEST_EVM_ADDRESS,
        chain: 'evm',
        chainId: 42161,
        delegationManager: '0x00000000000000000000000000000000000000d1',
        delegation: TEST_UNSIGNED_DELEGATION,
      }),
    ).resolves.toMatchObject({
      kind: 'metamask-delegation',
      confirmedAddress: TEST_EVM_ADDRESS,
      signature: TEST_DELEGATION_SIGNATURE,
      delegation: {
        ...TEST_UNSIGNED_DELEGATION,
        signature: TEST_DELEGATION_SIGNATURE,
      },
    });
  });

  it('fails closed when the returned signature cannot be serialized with the prepared transaction', async () => {
    const signing: AgentRuntimeSigningService = {
      readAddress: vi.fn(async () => TEST_EVM_ADDRESS),
      signPayload: vi.fn(async () => ({
        confirmedAddress: TEST_EVM_ADDRESS,
        signedPayload: {
          signature: '0x1234',
          recoveryId: 1,
        },
      })),
    };

    await expect(
      signPreparedEvmTransaction({
        signing,
        signerRef: TEST_SIGNER_REF,
        expectedAddress: TEST_EVM_ADDRESS,
        chain: 'evm',
        unsignedTransactionHex: TEST_UNSIGNED_TRANSACTION_HEX,
      }),
    ).rejects.toMatchObject<Partial<AgentRuntimeSigningError>>({
      code: 'invalid_signed_artifact',
      signerRef: TEST_SIGNER_REF,
      expectedAddress: TEST_EVM_ADDRESS,
      confirmedAddress: TEST_EVM_ADDRESS,
    });
  });

  it('fails closed when the returned delegation signature is unusable', async () => {
    const signing: AgentRuntimeSigningService = {
      readAddress: vi.fn(async () => TEST_EVM_ADDRESS),
      signPayload: vi.fn(async () => ({
        confirmedAddress: TEST_EVM_ADDRESS,
        signedPayload: {
          signature: 'not-a-signature',
        },
      })),
    };

    await expect(
      signPreparedDelegation({
        signing,
        signerRef: TEST_SIGNER_REF,
        expectedAddress: TEST_EVM_ADDRESS,
        chain: 'evm',
        chainId: 42161,
        delegationManager: '0x00000000000000000000000000000000000000d1',
        delegation: TEST_UNSIGNED_DELEGATION,
      }),
    ).rejects.toMatchObject<Partial<AgentRuntimeSigningError>>({
      code: 'invalid_signed_artifact',
      signerRef: TEST_SIGNER_REF,
      expectedAddress: TEST_EVM_ADDRESS,
      confirmedAddress: TEST_EVM_ADDRESS,
    });
  });

  it('signs typed-data payloads through OWS core and returns a normalized signature envelope', async () => {
    const fixture = createOwsTestSignerEnv();
    cleanupFns.add(fixture.cleanup);

    const signing = createSigningService(fixture.env);

    await expect(
      signing.signPayload({
        signerRef: TEST_SIGNER_REF,
        expectedAddress: TEST_EVM_ADDRESS,
        payloadKind: 'typed-data',
        payload: {
          chain: 'evm',
          typedData: {
            domain: {
              chainId: 42161,
              name: 'DelegationManager',
              version: '1',
              verifyingContract: '0x00000000000000000000000000000000000000d1',
            },
            types: {
              EIP712Domain: [
                { name: 'name', type: 'string' },
                { name: 'version', type: 'string' },
                { name: 'chainId', type: 'uint256' },
                { name: 'verifyingContract', type: 'address' },
              ],
              Caveat: [
                { name: 'enforcer', type: 'address' },
                { name: 'terms', type: 'bytes' },
              ],
              Delegation: [
                { name: 'delegate', type: 'address' },
                { name: 'delegator', type: 'address' },
                { name: 'authority', type: 'bytes32' },
                { name: 'caveats', type: 'Caveat[]' },
                { name: 'salt', type: 'uint256' },
              ],
            },
            primaryType: 'Delegation',
            message: {
              delegate: TEST_EVM_ADDRESS,
              delegator: TEST_EVM_ADDRESS,
              authority: '0x1111111111111111111111111111111111111111111111111111111111111111',
              caveats: [],
              salt: 0n,
            },
          },
        },
      }),
    ).resolves.toMatchObject({
      confirmedAddress: TEST_EVM_ADDRESS,
      signedPayload: {
        signature: expect.stringMatching(/^0x[0-9a-f]+$/),
        recoveryId: expect.any(Number),
      },
    });
  });

  it('signs typed-data payloads when uint256 fields exceed the decimal u128 encoding limit', async () => {
    const fixture = createOwsTestSignerEnv();
    cleanupFns.add(fixture.cleanup);

    const signing = createSigningService(fixture.env);

    await expect(
      signing.signPayload({
        signerRef: TEST_SIGNER_REF,
        expectedAddress: TEST_EVM_ADDRESS,
        payloadKind: 'typed-data',
        payload: {
          chain: 'evm',
          typedData: {
            domain: {
              chainId: 42161,
              name: 'DelegationManager',
              version: '1',
              verifyingContract: '0x00000000000000000000000000000000000000d1',
            },
            types: {
              EIP712Domain: [
                { name: 'name', type: 'string' },
                { name: 'version', type: 'string' },
                { name: 'chainId', type: 'uint256' },
                { name: 'verifyingContract', type: 'address' },
              ],
              Caveat: [
                { name: 'enforcer', type: 'address' },
                { name: 'terms', type: 'bytes' },
              ],
              Delegation: [
                { name: 'delegate', type: 'address' },
                { name: 'delegator', type: 'address' },
                { name: 'authority', type: 'bytes32' },
                { name: 'caveats', type: 'Caveat[]' },
                { name: 'salt', type: 'uint256' },
              ],
            },
            primaryType: 'Delegation',
            message: {
              delegate: TEST_EVM_ADDRESS,
              delegator: TEST_EVM_ADDRESS,
              authority: '0x1111111111111111111111111111111111111111111111111111111111111111',
              caveats: [],
              salt: BigInt(
                '0xf130f5c04f9d4f4c0fdc424b7d4c7e7ce7466afda419ac37ec6ea77dba7ca674',
              ),
            },
          },
        },
      }),
    ).resolves.toMatchObject({
      confirmedAddress: TEST_EVM_ADDRESS,
      signedPayload: {
        signature: expect.stringMatching(/^0x[0-9a-f]+$/),
        recoveryId: expect.any(Number),
      },
    });
  });

  it('fails closed when the expected address does not match the configured OWS wallet', async () => {
    const fixture = createOwsTestSignerEnv();
    cleanupFns.add(fixture.cleanup);

    const signing = createSigningService(fixture.env);

    await expect(
      signing.signPayload({
        signerRef: TEST_SIGNER_REF,
        expectedAddress: '0x00000000000000000000000000000000000000ff',
        payloadKind: 'transaction',
        payload: {
          chain: 'evm',
          unsignedTransactionHex: '0xdeadbeef',
        },
      }),
    ).rejects.toMatchObject<Partial<AgentRuntimeSigningError>>({
      code: 'address_mismatch',
      signerRef: TEST_SIGNER_REF,
      expectedAddress: '0x00000000000000000000000000000000000000ff',
      confirmedAddress: TEST_EVM_ADDRESS,
    });
  });

  it('returns both runtime service and private signing from the internal kernel factory', async () => {
    const fixture = createOwsTestSignerEnv();
    cleanupFns.add(fixture.cleanup);

    const kernel = await createAgentRuntimeKernel({
      env: fixture.env,
      owsSigners: [
        {
          signerRef: TEST_SIGNER_REF,
          walletNameOrIdEnvVar: 'TEST_OWS_WALLET_NAME',
          vaultPathEnvVar: 'TEST_OWS_VAULT_PATH',
        },
      ],
      createRuntimeOptions: async ({ signing }) => {
        await expect(
          signing.readAddress({
            signerRef: TEST_SIGNER_REF,
          }),
        ).resolves.toBe(TEST_EVM_ADDRESS);

        return {
          model: createModel('internal-kernel-unit-model'),
          systemPrompt: 'You are a private runtime signing test.',
          __internalPostgres: createInternalPostgresHooks(),
        } as never;
      },
    });

    expect(kernel).toMatchObject({
      service: expect.objectContaining({
        connect: expect.any(Function),
        run: expect.any(Function),
        stop: expect.any(Function),
      }),
      signing: expect.objectContaining({
        readAddress: expect.any(Function),
        signPayload: expect.any(Function),
      }),
    });
  });
});
