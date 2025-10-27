/**
 * Test helpers for DeFi strategy lifecycle workflow testing
 */

import { mkdirSync, writeFileSync, copyFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import type { Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { PrivateKeyAccount } from 'viem/accounts';
import { z } from 'zod';

// Artifact schemas per PRD and artifacts.md

export const SettingsArtifactSchema = z.object({
  walletAddress: z.string(),
  amount: z.string(),
  chainId: z.number(),
  intent: z.string(),
  createdAt: z.string(),
});

export const DelegationToSignSchema = z.object({
  id: z.string(),
  type: z.literal('eip7702'),
  chainId: z.number(),
  address: z.string(),
  nonce: z.number(),
});

export const DelegationsToSignArtifactSchema = z.object({
  delegations: z.array(DelegationToSignSchema),
});

export const SignedDelegationSchema = z.object({
  id: z.string(),
  signedDelegation: z.unknown(), // The actual signature data
});

export const SignedDelegationsArtifactSchema = z.object({
  delegations: z.array(SignedDelegationSchema),
  signedAt: z.string(),
});

export const TxHistoryEntrySchema = z.object({
  txHash: z.string(),
  status: z.enum(['submitted', 'pending', 'confirmed', 'failed']),
  blockNumber: z.number().optional(),
  timestamp: z.string(),
});

export const PerformanceArtifactSchema = z.object({
  totalValue: z.string(),
  unrealizedPnL: z.string(),
  realizedPnL: z.string(),
  timestamp: z.string(),
});

export const TransactionExecutedArtifactSchema = z.object({
  txHash: z.string(),
  chainId: z.number(),
  from: z.string(),
  to: z.string(),
  value: z.string(),
  gasUsed: z.string(),
  status: z.enum(['success', 'reverted', 'failed']),
  timestamp: z.string(),
});

/**
 * Create a test config workspace with the lifecycle workflow plugin
 */
export function createLifecycleTestConfigWorkspace(options?: {
  agentName?: string;
  agentUrl?: string;
}): string {
  const testDir = join(
    tmpdir(),
    `lifecycle-test-config-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const configDir = join(testDir, 'config');
  const workflowsDir = join(configDir, 'workflows');

  // Create directories
  mkdirSync(workflowsDir, { recursive: true });

  // Create agent.md with minimal frontmatter
  const agentMd = `---
version: 1
card:
  protocolVersion: '0.3.0'
  name: '${options?.agentName ?? 'Lifecycle Test Agent'}'
  description: 'Test agent for DeFi strategy lifecycle testing'
  url: '${options?.agentUrl ?? 'http://localhost:3000/a2a'}'
  version: '1.0.0'
  capabilities:
    streaming: true
    pushNotifications: false
  provider:
    name: 'Test Provider'
    url: 'https://example.com'
  defaultInputModes: ['text/plain', 'application/json']
  defaultOutputModes: ['application/json']

model:
  provider: openrouter
  name: anthropic/claude-sonnet-4.5
  params:
    temperature: 0.7
    maxTokens: 4096
    topP: 1.0
    reasoning: low
---

You are a test agent for DeFi strategy lifecycle testing.
`;

  writeFileSync(join(configDir, 'agent.md'), agentMd, 'utf8');

  // Create a minimal skill that includes the workflow
  // (workflows are only loaded if referenced by a skill)
  const skillsDir = join(configDir, 'skills');
  mkdirSync(skillsDir, { recursive: true });

  const testSkillMd = `---
skill:
  id: lifecycle-test-skill
  name: Lifecycle Test Skill
  description: Minimal skill to enable lifecycle test workflow
workflows:
  include:
    - defi-strategy-lifecycle-mock
---

Minimal skill for workflow lifecycle testing.
`;

  writeFileSync(join(skillsDir, 'lifecycle-test-skill.md'), testSkillMd, 'utf8');

  // Create agent.manifest.json
  const manifest = {
    version: 1,
    skills: ['./skills/lifecycle-test-skill.md'],
    registries: {
      workflows: './workflow.json',
    },
    merge: {
      card: {
        capabilities: 'union',
        toolPolicies: 'intersect',
        guardrails: 'tightest',
      },
    },
  };

  writeFileSync(join(configDir, 'agent.manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  // Create workflow.json with the lifecycle mock workflow
  const workflowRegistry = {
    workflows: [
      {
        id: 'defi-strategy-lifecycle-mock',
        from: './workflows/defi-strategy-lifecycle-mock.ts',
        enabled: true,
      },
    ],
  };

  writeFileSync(
    join(configDir, 'workflow.json'),
    JSON.stringify(workflowRegistry, null, 2),
    'utf8',
  );

  // Create minimal mcp.json (empty registry, no MCP servers needed for this test)
  const mcpRegistry = {
    mcpServers: {},
  };

  writeFileSync(join(configDir, 'mcp.json'), JSON.stringify(mcpRegistry, null, 2), 'utf8');

  // Copy the workflow plugin from test fixtures to temp workspace
  const fixturePluginPath = join(
    process.cwd(),
    'tests',
    'fixtures',
    'workflows',
    'defi-strategy-lifecycle-mock.ts',
  );
  const targetPluginPath = join(workflowsDir, 'defi-strategy-lifecycle-mock.ts');

  copyFileSync(fixturePluginPath, targetPluginPath);

  return configDir;
}

/**
 * Get 7702-upgraded test account from environment
 */
export function get7702TestAccount(): PrivateKeyAccount {
  const privateKey = process.env['A2A_TEST_7702_PRIVATE_KEY'];
  if (!privateKey || !privateKey.startsWith('0x') || privateKey.length !== 66) {
    throw new Error(
      'A2A_TEST_7702_PRIVATE_KEY not configured. Must be a 0x-prefixed 64-hex-char private key.',
    );
  }

  return privateKeyToAccount(privateKey as Hex);
}

/**
 * Get Agent Node test account from environment
 */
export function getAgentNodeTestAccount(): PrivateKeyAccount {
  const privateKey = process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];
  if (!privateKey || !privateKey.startsWith('0x') || privateKey.length !== 66) {
    throw new Error(
      'A2A_TEST_AGENT_NODE_PRIVATE_KEY not configured. Must be a 0x-prefixed 64-hex-char private key.',
    );
  }

  return privateKeyToAccount(privateKey as Hex);
}

/**
 * Get test chain ID from environment
 */
export function getTestChainId(): number {
  const chainId = process.env['A2A_TEST_CHAIN_ID'];
  if (!chainId) {
    return 42161; // Default to Arbitrum One
  }

  const parsed = parseInt(chainId, 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error('A2A_TEST_CHAIN_ID must be a positive integer');
  }

  return parsed;
}

/**
 * Sign an EIP-7702 delegation (simplified for testing)
 *
 * Note: In a real implementation, this would follow EIP-7702 spec exactly.
 * For testing purposes, we use EIP-712 typed data signing as a stand-in.
 */
export async function signDelegation(
  account: PrivateKeyAccount,
  delegation: z.infer<typeof DelegationToSignSchema>,
): Promise<Hex> {
  // EIP-7702 uses EIP-712 typed data for delegation authorization
  const domain = {
    name: 'EIP7702Delegation',
    version: '1',
    chainId: delegation.chainId,
  };

  const types = {
    Delegation: [
      { name: 'implementation', type: 'address' },
      { name: 'nonce', type: 'uint256' },
    ],
  };

  const message = {
    implementation: delegation.address,
    nonce: BigInt(delegation.nonce),
  };

  // Sign using account's signTypedData method
  const signature = await account.signTypedData({
    domain,
    types,
    primaryType: 'Delegation',
    message,
  });

  return signature;
}

/**
 * Helper to extract data from artifact parts
 */
export function extractArtifactData<T>(artifact: {
  parts: Array<{ kind: string; data?: unknown }>;
}): T | null {
  const dataPart = artifact.parts.find((p) => p.kind === 'data' && p.data);
  if (!dataPart || !dataPart.data) {
    return null;
  }
  return dataPart.data as T;
}
