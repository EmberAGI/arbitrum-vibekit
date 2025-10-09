#!/usr/bin/env node

import type { Task } from '@google-a2a/types';
import { TaskState } from '@google-a2a/types';
import { claimPregenWalletTool } from './src/tools/claimPregenWallet.js';
import { createPregenWalletTool } from './src/tools/createPregenWallet.js';
import { listPregenWalletsTool } from './src/tools/listPregenWallets.js';
import { listPregenWallets } from './src/store/pregenWalletStore.js';
import {
  __resetParaTestingOverrides,
  __setParaClientFactoryForTesting,
  __setParaModuleForTesting,
} from './src/utils/paraServer.js';

type TestResult = {
  name: string;
  status: 'PASS' | 'FAIL';
  error?: string;
};

const identifier = 'user@example.com';
const mockUserShare = { share: 'mock-user-share' };

class MockParaClient {
  public hasPregenWalletCallCount = 0;
  public createPregenWalletCallCount = 0;
  public getUserShareCallCount = 0;
  public lastHasPregenWalletPayload: Record<string, unknown> | undefined;
  public lastCreatePregenWalletPayload: Record<string, unknown> | undefined;

  async hasPregenWallet(payload: Record<string, unknown>) {
    this.hasPregenWalletCallCount += 1;
    this.lastHasPregenWalletPayload = payload;
    return false;
  }

  async createPregenWallet(payload: Record<string, unknown>) {
    this.createPregenWalletCallCount += 1;
    this.lastCreatePregenWalletPayload = payload;
    return { id: 'mock-wallet-id', address: '0xMockAddress' };
  }

  async getUserShare() {
    this.getUserShareCallCount += 1;
    return mockUserShare;
  }
}

const mockParaClient = new MockParaClient();
const testResults: TestResult[] = [];

function setupParaMocks(): void {
  const walletType = { EVM: 'EVM', SOLANA: 'SOLANA', COSMOS: 'COSMOS' } as const;
  const environment = { BETA: 'BETA', PRODUCTION: 'PRODUCTION' } as const;

  __setParaModuleForTesting({
    WalletType: walletType,
    Environment: environment,
    Para: class MockParaConstructor {},
  } as unknown as typeof import('@getpara/server-sdk'));

  __setParaClientFactoryForTesting(async () => mockParaClient);
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function ensureTaskCompleted(task: Task, name: string): void {
  expect(task.status?.state === TaskState.Completed, `Expected task "${name}" to complete successfully`);
  const messagePart = task.status?.message?.parts?.find((part) => part.kind === 'text');
  expect(messagePart && typeof messagePart.text === 'string', `Task "${name}" did not include a status message`);
}

function parseFirstArtifactJson(task: Task, name: string): any {
  const artifacts = task.artifacts ?? [];
  expect(artifacts.length > 0, `Task "${name}" did not include artifacts`);
  const textPart = artifacts[0].parts.find(
    (part) => part.kind === 'text' && typeof (part as { text?: unknown }).text === 'string',
  ) as { text: string } | undefined;
  expect(textPart, `Task "${name}" artifact missing text content`);
  return JSON.parse(textPart.text);
}

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  console.log(`▶️  ${name}`);
  try {
    await fn();
    testResults.push({ name, status: 'PASS' });
    console.log(`✅ ${name}\n`);
  } catch (error) {
    const message = (error as Error).message || 'Unknown error';
    testResults.push({ name, status: 'FAIL', error: message });
    console.error(`❌ ${name}: ${message}\n`);
  }
}

function printSummary(): void {
  console.log('\n📊 Test Summary:');
  for (const result of testResults) {
    if (result.status === 'PASS') {
      console.log(`✅ ${result.name}`);
    } else {
      console.log(`❌ ${result.name} — ${result.error}`);
    }
  }

  if (testResults.length > 0) {
    const passed = testResults.filter((result) => result.status === 'PASS').length;
    console.log(`\n🎯 Results: ${passed}/${testResults.length} tests passed`);
  } else {
    console.log('\n⚠️  No tests were executed.');
  }
}

async function main() {
  setupParaMocks();

  if (!process.env.PARA_API_KEY) {
    process.env.PARA_API_KEY = 'test-api-key';
  }
  if (!process.env.PARA_ENVIRONMENT) {
    process.env.PARA_ENVIRONMENT = 'BETA';
  }

  expect(listPregenWallets().length === 0, 'Expected pregenerated wallet store to start empty');

  await runTest('create_pregen_wallet tool', async () => {
    const task = await createPregenWalletTool.execute({
      email: identifier,
    }, { custom: {} });

    ensureTaskCompleted(task, 'create_pregen_wallet tool');
    const storedWallet = parseFirstArtifactJson(task, 'create_pregen_wallet tool');

    expect(storedWallet.walletId === 'mock-wallet-id', 'Stored wallet ID should come from mock response');
    expect(storedWallet.email === identifier, 'Stored wallet email mismatch');
    expect(storedWallet.userShareJson === JSON.stringify(mockUserShare), 'Stored wallet user share mismatch');

    expect(mockParaClient.hasPregenWalletCallCount === 1, 'Expected hasPregenWallet to be called exactly once');
    expect(mockParaClient.createPregenWalletCallCount === 1, 'Expected createPregenWallet to be called exactly once');
    expect(mockParaClient.getUserShareCallCount === 1, 'Expected getUserShare to be called exactly once');
    expect(listPregenWallets().length === 1, 'Expected pregenerated wallet store to contain one entry after creation');
  });

  await runTest('list_pregen_wallets tool', async () => {
    const task = await listPregenWalletsTool.execute({}, { custom: {} });
    ensureTaskCompleted(task, 'list_pregen_wallets tool');
    const wallets = parseFirstArtifactJson(task, 'list_pregen_wallets tool');
    expect(Array.isArray(wallets), 'Expected list_pregen_wallets to return an array');
    expect(wallets.length === 1, 'Expected one wallet in the pregenerated wallet list');
    expect(wallets[0].walletId === 'mock-wallet-id', 'Listed wallet ID mismatch');
  });

  await runTest('claim_pregen_wallet tool', async () => {
    const task = await claimPregenWalletTool.execute({
      email: identifier,
    }, { custom: {} });

    ensureTaskCompleted(task, 'claim_pregen_wallet tool');
    const payload = parseFirstArtifactJson(task, 'claim_pregen_wallet tool');

    expect(payload.email === identifier, 'Claim payload email mismatch');
  });

  // mark_pregen_wallet_claimed tool removed; skipping related test
  // sign_pregen_transaction tool removed; skipping related test
}

await main()
  .catch((error) => {
    const message = (error as Error).message || 'Unknown error';
    console.error(`❌ Test runner failure: ${message}`);
    testResults.push({ name: 'test-runner', status: 'FAIL', error: message });
  })
  .finally(() => {
    __resetParaTestingOverrides();
    printSummary();
    const allPassed = testResults.length > 0 && testResults.every((result) => result.status === 'PASS');
    process.exit(allPassed ? 0 : 1);
  });
