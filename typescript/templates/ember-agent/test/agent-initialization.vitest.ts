import { describe, it, expect, beforeAll } from 'vitest';

describe('Agent Components', () => {
  beforeAll(() => {
    // Set required environment variables for testing
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.ARBITRUM_RPC_URL = 'https://arb1.arbitrum.io/rpc';
    process.env.EMBER_MCP_SERVER_URL = 'https://test-ember-server.com';
  });

  it('should be able to import context types module', async () => {
    const contextTypes = await import('../src/context/types.js');
    expect(contextTypes).toBeDefined();
    expect(typeof contextTypes).toBe('object');
  });

  it('should be able to import context provider', async () => {
    const { contextProvider } = await import('../src/context/provider.js');
    expect(contextProvider).toBeDefined();
    expect(typeof contextProvider).toBe('function');
  });

  it('should have environment variables set for testing', () => {
    expect(process.env.OPENROUTER_API_KEY).toBe('test-key');
    expect(process.env.ARBITRUM_RPC_URL).toBe('https://arb1.arbitrum.io/rpc');
    expect(process.env.EMBER_MCP_SERVER_URL).toBe('https://test-ember-server.com');
  });

  it('should be able to import arbitrum-vibekit-core', async () => {
    const { Agent, createProviderSelector } = await import('@emberai/arbitrum-vibekit-core');
    expect(Agent).toBeDefined();
    expect(createProviderSelector).toBeDefined();
    expect(typeof Agent.create).toBe('function');
    expect(typeof createProviderSelector).toBe('function');
  });

  it('should be able to create a provider selector', async () => {
    const { createProviderSelector, getAvailableProviders } = await import('@emberai/arbitrum-vibekit-core');

    const providers = createProviderSelector({
      openRouterApiKey: 'test-key',
    });

    const available = getAvailableProviders(providers);
    expect(available).toContain('openrouter');
  });
});
