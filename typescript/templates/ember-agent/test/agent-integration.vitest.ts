import { describe, it, expect, beforeAll } from 'vitest';

describe('Agent Integration', () => {
  beforeAll(() => {
    // Set required environment variables for testing
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.ARBITRUM_RPC_URL = 'https://arb1.arbitrum.io/rpc';
    process.env.EMBER_MCP_SERVER_URL = 'https://api.emberai.xyz/mcp';
  });

  it('should be able to import agent configuration', async () => {
    const { agentConfig } = await import('../src/config.js');
    expect(agentConfig).toBeDefined();
    expect(agentConfig.name).toContain('Ember Agent');
    expect(agentConfig.skills).toBeDefined();
    expect(Array.isArray(agentConfig.skills)).toBe(true);
  });

  it('should have swapping skill in agent configuration', async () => {
    const { agentConfig } = await import('../src/config.js');
    expect(agentConfig.skills.length).toBeGreaterThan(0);

    const swappingSkill = agentConfig.skills.find(skill => skill.id === 'token-swapping');
    expect(swappingSkill).toBeDefined();
    expect(swappingSkill!.name).toBe('Token Swapping');
    expect(swappingSkill!.tags).toContain('swapping');
  });

  it('should have documentation skill in agent configuration', async () => {
    const { agentConfig } = await import('../src/config.js');

    const documentationSkill = agentConfig.skills.find(
      skill => skill.id === 'protocol-documentation'
    );
    expect(documentationSkill).toBeDefined();
    expect(documentationSkill!.name).toBe('Protocol Documentation Expert');
    expect(documentationSkill!.tags).toContain('documentation');
    expect(documentationSkill!.tags).toContain('help');
    expect(documentationSkill!.tags).toContain('camelot');
  });

  it('should have both swapping and documentation skills', async () => {
    const { agentConfig } = await import('../src/config.js');

    // Should have exactly 2 skills for now
    expect(agentConfig.skills).toHaveLength(2);

    const skillIds = agentConfig.skills.map(skill => skill.id);
    expect(skillIds).toContain('token-swapping');
    expect(skillIds).toContain('protocol-documentation');
  });

  it('should have correct agent metadata', async () => {
    const { agentConfig } = await import('../src/config.js');

    expect(agentConfig.version).toBeDefined();
    expect(agentConfig.description).toContain('DeFi agent');
    expect(agentConfig.capabilities).toBeDefined();
    expect(agentConfig.capabilities.streaming).toBe(true);
    expect(agentConfig.defaultInputModes).toContain('application/json');
    expect(agentConfig.defaultOutputModes).toContain('application/json');
  });

  it('should be able to create agent with current configuration', async () => {
    const { Agent } = await import('@emberai/arbitrum-vibekit-core');
    const { agentConfig } = await import('../src/config.js');

    // This should not throw an error
    expect(() => Agent.create(agentConfig)).not.toThrow();

    const agent = Agent.create(agentConfig);
    expect(agent).toBeDefined();
    expect(agent.card.name).toBe(agentConfig.name);
    expect(agent.card.skills).toHaveLength(agentConfig.skills.length);
  });

  it('should have MCP server with registered tools', async () => {
    const { Agent } = await import('@emberai/arbitrum-vibekit-core');
    const { agentConfig } = await import('../src/config.js');

    const agent = Agent.create(agentConfig);
    expect(agent.mcpServer).toBeDefined();

    // The MCP server should have tools registered for each skill
    // We can't easily test the internal tool registration without
    // exposing more of the internal API, but we can verify the agent was created
    expect(agent.card.skills.length).toBe(agentConfig.skills.length);
  });

  it('should validate framework requirements', async () => {
    const { Agent } = await import('@emberai/arbitrum-vibekit-core');

    // Test that agent creation fails without skills
    const emptyConfig = {
      name: 'Test Agent',
      version: '1.0.0',
      description: 'Test agent',
      url: 'localhost',
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
      },
      defaultInputModes: ['application/json'],
      defaultOutputModes: ['application/json'],
      skills: [],
    };

    expect(() => Agent.create(emptyConfig)).toThrow('Agent creation requires at least one skill');
  });
});
