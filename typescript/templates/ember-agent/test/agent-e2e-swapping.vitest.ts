import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Agent, createProviderSelector, getAvailableProviders } from '@emberai/arbitrum-vibekit-core';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { agentConfig } from '../src/config.js';
import { contextProvider } from '../src/context/provider.js';
import type { Task, TextPart } from '@emberai/arbitrum-vibekit-core/google-a2a-types';

describe.skip('Ember Agent E2E Swapping Integration', () => {
  let agent: ReturnType<typeof Agent.create>;
  let mcpClient: Client;
  const PORT = 31339; // Use a unique port for this test suite
  const BASE_URL = `http://localhost:${PORT}`;

  beforeAll(async () => {
    // Set required environment variables for the test
    process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'test-key-for-ci';
    process.env.ARBITRUM_RPC_URL = 'https://arb1.arbitrum.io/rpc';
    process.env.EMBER_MCP_SERVER_URL = 'https://api.emberai.xyz/mcp';
    // Use a dummy address for testing, as we only need to generate a plan, not execute it
    process.env.DEFAULT_USER_ADDRESS = '0x000000000000000000000000000000000000dead';

    if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'test-key-for-ci') {
      console.warn(
        'OPENROUTER_API_KEY is not set or is a dummy key. LLM-dependent tests will be skipped.'
      );
      return;
    }

    // AI Provider setup
    const providers = createProviderSelector({
      openRouterApiKey: process.env.OPENROUTER_API_KEY,
    });
    const availableProviders = getAvailableProviders(providers);
    const selectedProviderKey = availableProviders[0] as keyof typeof providers;
    const selectedProvider = providers[selectedProviderKey]!;
    const llmModel = selectedProvider() as any;

    // Create and start the agent
    agent = Agent.create(agentConfig, {
      llm: { model: llmModel },
    });

    // Start the agent server and its context provider
    await agent.start(PORT, async deps => {
      // The context provider needs the LLM model from the agent configuration
      return contextProvider({ ...deps, llmModel });
    });

    // Connect an MCP client to the agent's SSE endpoint
    const transport = new SSEClientTransport(new URL(`${BASE_URL}/sse`));
    mcpClient = new Client({ name: 'e2e-test-client', version: '1.0.0' });
    await mcpClient.connect(transport);
  }, 60000); // 60s timeout for setup

  afterAll(async () => {
    if (mcpClient) await mcpClient.close();
    if (agent) await agent.stop();
  });

  it('should call the swapping skill and return a completed Task with a transaction plan', async () => {
    if (!mcpClient) {
      return;
    }

    const response = await mcpClient.callTool({
      name: 'token-swapping', // This must match the skill ID
      arguments: {
        instruction: 'Swap 1 USDC for ETH on Arbitrum',
        userAddress: process.env.DEFAULT_USER_ADDRESS,
      },
    });

    const responseAsAny = response as any;
    // The agent wraps the A2A Task in an MCP response
    expect(responseAsAny.content).toBeDefined();
    expect(Array.isArray(responseAsAny.content)).toBe(true);
    expect(responseAsAny.content.length).toBeGreaterThan(0);

    const resourcePart = responseAsAny.content[0];
    expect(resourcePart.type).toBe('resource');
    expect(resourcePart.resource.text).toBeDefined();

    const task = JSON.parse(resourcePart.resource.text) as Task;

    // Validate the Task object
    expect(task.kind).toBe('task');
    expect(task.status.state).toBe('completed');
    expect(task.status.message).toBeDefined();
    expect(task.status.message!.parts).toBeDefined();
    expect(task.status.message!.parts.length).toBeGreaterThan(0);
    const firstPart = task.status.message!.parts[0] as TextPart | undefined;
    expect(firstPart).toBeDefined();
    expect(firstPart!.kind).toBe('text');
    expect(firstPart!.text).toContain('Transaction plan created');

    // Validate the artifact
    expect(task.artifacts).toBeDefined();
    expect(Array.isArray(task.artifacts)).toBe(true);
    expect(task.artifacts!.length).toBeGreaterThan(0);

    const swapArtifact = task.artifacts!.find(a => a.name === 'transaction-plan');
    expect(swapArtifact).toBeDefined();
    const artifactData = (swapArtifact!.parts[0] as any).data;

    expect(artifactData.txPreview).toBeDefined();
    expect(artifactData.txPlan).toBeDefined();
    expect(Array.isArray(artifactData.txPlan)).toBe(true);
    expect(artifactData.txPlan.length).toBeGreaterThan(0);

    // Deep check one of the transactions in the plan
    const firstTx = artifactData.txPlan[0];
    expect(firstTx.to).toMatch(/^0x[a-fA-F0-9]{40}$/); // is an address
    expect(firstTx.data).toMatch(/^0x[a-fA-F0-9]+$/); // has calldata
    expect(firstTx.value).toBeDefined(); // has a value
  }, 60000); // 60s timeout for the full e2e call
});
