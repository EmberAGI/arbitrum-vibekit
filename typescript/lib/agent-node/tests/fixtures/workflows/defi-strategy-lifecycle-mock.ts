import type { Artifact } from '@a2a-js/sdk';
import { z } from 'zod';

import type { WorkflowPlugin, WorkflowContext, WorkflowState } from '../../src/workflows/types.js';

/**
 * Mock workflow plugin for testing DeFi strategy lifecycle with A2A
 *
 * This workflow simulates:
 * - Input collection (wallet address + amount)
 * - Delegation creation and signing request
 * - Multiple artifact emissions (Settings, TX History, Performance)
 * - Streamed artifact updates for TX History and Performance
 */

// Input schemas aligned with PRD
const WalletAmountInputSchema = z.object({
  walletAddress: z.string(),
  amount: z.string(),
});

const SignedDelegationsInputSchema = z.object({
  delegations: z.array(
    z.object({
      id: z.string(),
      signedDelegation: z.unknown(),
    }),
  ),
});

const plugin: WorkflowPlugin = {
  id: 'defi-strategy-lifecycle-mock',
  name: 'DeFi Strategy Lifecycle Mock',
  description:
    'Mock workflow for testing A2A client lifecycle with pause/resume, delegation signing, and streamed artifacts',
  version: '1.0.0',

  inputSchema: z.object({
    intent: z.string().optional(),
    chainId: z.number().int().positive().optional().default(42161), // Arbitrum One
  }),

  async *execute(context: WorkflowContext): AsyncGenerator<WorkflowState, unknown, unknown> {
    const { intent = 'Execute DeFi strategy', chainId = 42161 } = context.parameters ?? {};

    // Initial status: submitted -> working
    yield {
      type: 'status-update',
      message: 'Starting DeFi strategy workflow...',
    };

    // Artifact 0: Workflow started (emitted BEFORE first pause to ensure getTask() has artifacts)
    const workflowStartedArtifact: Artifact = {
      artifactId: 'workflow-started',
      name: 'workflow-started.json',
      description: 'Workflow initialization metadata',
      metadata: { mimeType: 'application/json' },
      parts: [
        {
          kind: 'data',
          data: {
            workflowId: context.taskId,
            intent,
            chainId,
            startedAt: new Date('2025-01-15T09:59:59.000Z').toISOString(),
          },
          metadata: { mimeType: 'application/json' },
        },
      ],
    };
    yield { type: 'artifact', artifact: workflowStartedArtifact };

    // Pause 1: Collect wallet address and amount
    const walletAmountInput = (yield {
      type: 'interrupted',
      reason: 'input-required',
      message: 'Please provide your wallet address and the amount for the strategy',
      inputSchema: WalletAmountInputSchema,
    }) as z.infer<typeof WalletAmountInputSchema>;

    // Resume with wallet + amount data
    yield {
      type: 'status-update',
      message: 'Processing strategy with provided wallet and amount...',
    };

    // Artifact 1: Settings
    const settingsArtifact: Artifact = {
      artifactId: 'strategy-settings',
      name: 'strategy-settings.json',
      description: 'Strategy configuration and settings',
      metadata: { mimeType: 'application/json' },
      parts: [
        {
          kind: 'data',
          data: {
            walletAddress: walletAmountInput.walletAddress,
            amount: walletAmountInput.amount,
            chainId,
            intent,
            createdAt: new Date('2025-01-15T10:00:00.000Z').toISOString(),
          },
          metadata: { mimeType: 'application/json' },
        },
      ],
    };
    yield { type: 'artifact', artifact: settingsArtifact };

    // Artifact 2: Delegations to sign (per artifacts.md)
    const delegationsArtifact: Artifact = {
      artifactId: 'delegations-to-sign',
      name: 'delegations-to-sign.json',
      description: 'Delegations requiring user signature (EIP-7702)',
      metadata: { mimeType: 'application/json' },
      parts: [
        {
          kind: 'data',
          data: {
            delegations: [
              {
                id: 'delegation-1',
                type: 'eip7702',
                chainId,
                address: '0x1111111111111111111111111111111111111111', // Mock implementation address
                nonce: 0,
              },
              {
                id: 'delegation-2',
                type: 'eip7702',
                chainId,
                address: '0x2222222222222222222222222222222222222222',
                nonce: 1,
              },
            ],
          },
          metadata: { mimeType: 'application/json' },
        },
      ],
    };
    yield { type: 'artifact', artifact: delegationsArtifact };

    // Pause 2: Collect signed delegations
    const signedDelegationsInput = (yield {
      type: 'interrupted',
      reason: 'input-required',
      message: 'Please sign the delegations to authorize the strategy execution',
      inputSchema: SignedDelegationsInputSchema,
    }) as z.infer<typeof SignedDelegationsInputSchema>;

    // Resume with signed delegations
    yield {
      type: 'status-update',
      message: 'Executing strategy with signed delegations...',
    };

    // Artifact 3: Signed delegations (echo back for verification)
    const signedDelegationsArtifact: Artifact = {
      artifactId: 'signed-delegations',
      name: 'signed-delegations.json',
      description: 'User-signed delegations',
      metadata: { mimeType: 'application/json' },
      parts: [
        {
          kind: 'data',
          data: {
            delegations: signedDelegationsInput.delegations,
            signedAt: new Date('2025-01-15T10:01:00.000Z').toISOString(),
          },
          metadata: { mimeType: 'application/json' },
        },
      ],
    };
    yield { type: 'artifact', artifact: signedDelegationsArtifact };

    // Artifact 4: TX History (initial)
    const txHistoryArtifact1: Artifact = {
      artifactId: 'tx-history',
      name: 'tx-history.jsonl',
      description: 'Transaction history for the strategy (streamed)',
      metadata: { mimeType: 'application/jsonlines' },
      parts: [
        {
          kind: 'data',
          data: {
            txHash: '0xaaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777bbbb8888',
            status: 'submitted',
            timestamp: new Date('2025-01-15T10:01:30.000Z').toISOString(),
          },
          metadata: { mimeType: 'application/json' },
        },
      ],
    };
    yield { type: 'artifact', artifact: txHistoryArtifact1 };

    // Artifact 5: Performance (initial)
    const performanceArtifact1: Artifact = {
      artifactId: 'strategy-performance',
      name: 'strategy-performance.json',
      description: 'Real-time strategy performance metrics',
      metadata: { mimeType: 'application/json' },
      parts: [
        {
          kind: 'data',
          data: {
            totalValue: '0',
            unrealizedPnL: '0',
            realizedPnL: '0',
            timestamp: new Date('2025-01-15T10:01:30.000Z').toISOString(),
          },
          metadata: { mimeType: 'application/json' },
        },
      ],
    };
    yield { type: 'artifact', artifact: performanceArtifact1 };

    // Simulate some processing time
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Artifact 6: TX History update (confirmed transaction)
    const txHistoryArtifact2: Artifact = {
      artifactId: 'tx-history',
      name: 'tx-history.jsonl',
      description: 'Transaction history for the strategy (streamed)',
      metadata: { mimeType: 'application/jsonlines' },
      parts: [
        {
          kind: 'data',
          data: {
            txHash: '0xaaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777bbbb8888',
            status: 'confirmed',
            blockNumber: 12345678,
            timestamp: new Date('2025-01-15T10:02:00.000Z').toISOString(),
          },
          metadata: { mimeType: 'application/json' },
        },
      ],
    };
    yield { type: 'artifact', artifact: txHistoryArtifact2 };

    // Artifact 7: Performance update (with realized gains)
    const performanceArtifact2: Artifact = {
      artifactId: 'strategy-performance',
      name: 'strategy-performance.json',
      description: 'Real-time strategy performance metrics',
      metadata: { mimeType: 'application/json' },
      parts: [
        {
          kind: 'data',
          data: {
            totalValue: '1050.00',
            unrealizedPnL: '0',
            realizedPnL: '50.00',
            timestamp: new Date('2025-01-15T10:02:00.000Z').toISOString(),
          },
          metadata: { mimeType: 'application/json' },
        },
      ],
    };
    yield { type: 'artifact', artifact: performanceArtifact2 };

    // Artifact 8: Transaction Executed (per artifacts.md)
    const transactionExecutedArtifact: Artifact = {
      artifactId: 'transaction-executed',
      name: 'transaction-executed.json',
      description: 'Details of the executed transaction',
      metadata: { mimeType: 'application/json' },
      parts: [
        {
          kind: 'data',
          data: {
            txHash: '0xaaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777bbbb8888',
            chainId,
            from: walletAmountInput.walletAddress,
            to: '0x1111111111111111111111111111111111111111',
            value: '0',
            gasUsed: '150000',
            status: 'success',
            timestamp: new Date('2025-01-15T10:02:00.000Z').toISOString(),
          },
          metadata: { mimeType: 'application/json' },
        },
      ],
    };
    yield { type: 'artifact', artifact: transactionExecutedArtifact };

    // Final status
    yield {
      type: 'status-update',
      message: 'DeFi strategy workflow completed successfully',
    };

    // Return structured result
    return {
      success: true,
      workflowId: context.taskId,
      intent,
      walletAddress: walletAmountInput.walletAddress,
      amount: walletAmountInput.amount,
      chainId,
      delegationsSigned: signedDelegationsInput.delegations.length,
      artifactsGenerated: 9,
      completedAt: new Date('2025-01-15T10:02:00.000Z').toISOString(),
    };
  },
};

export default plugin;
