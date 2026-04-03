import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Model } from '@mariozechner/pi-ai';
import { importWalletPrivateKey } from '@open-wallet-standard/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  AgentRuntimeSigningError} from './internal.js';
import {
  createAgentRuntimeKernel,
  createAgentRuntimeSigningService,
} from './internal.js';

const TEST_PRIVATE_KEY =
  '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TEST_WALLET_NAME = 'service-wallet';
const TEST_SIGNER_REF = 'service-wallet';
const TEST_EVM_ADDRESS = '0xfcad0b19bb29d4674531d6f115237e16afce377c' as const;

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
