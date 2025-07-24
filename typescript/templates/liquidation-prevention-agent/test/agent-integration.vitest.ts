import { describe, it, expect, beforeAll } from 'vitest';

describe('Liquidation Prevention Agent Integration', () => {
    beforeAll(() => {
        // Set required environment variables for testing
        process.env.OPENROUTER_API_KEY = 'test-key';
        process.env.AGENT_NAME = 'Liquidation Prevention Agent';
        process.env.AGENT_VERSION = '1.0.0';
        process.env.AGENT_DESCRIPTION = 'Intelligent Aave liquidation prevention agent';
    });

    it('should be able to import agent configuration', async () => {
        const { agentConfig } = await import('../src/index.js');
        expect(agentConfig).toBeDefined();
        expect(agentConfig.name).toContain('Liquidation Prevention Agent');
        expect(agentConfig.skills).toBeDefined();
        expect(Array.isArray(agentConfig.skills)).toBe(true);
    });

    it('should have position status skill in agent configuration', async () => {
        const { agentConfig } = await import('../src/index.js');
        const skill = agentConfig.skills.find(skill => skill.id === 'position-status');
        expect(skill).toBeDefined();
        expect(skill!.name).toBe('Position Status & Health Check');
        expect(skill!.tags).toContain('status');
    });

    it('should have health monitoring skill in agent configuration', async () => {
        const { agentConfig } = await import('../src/index.js');
        const skill = agentConfig.skills.find(skill => skill.id === 'health-monitoring');
        expect(skill).toBeDefined();
        expect(skill!.name).toBe('Health Factor Monitoring & Auto-Prevention');
        expect(skill!.tags).toContain('monitoring');
    });

    it('should have liquidation prevention skill in agent configuration', async () => {
        const { agentConfig } = await import('../src/index.js');
        const skill = agentConfig.skills.find(skill => skill.id === 'liquidation-prevention');
        expect(skill).toBeDefined();
        expect(skill!.name).toBe('Liquidation Prevention');
        expect(skill!.tags).toContain('liquidation-prevention');
    });

    it('should have all required skills', async () => {
        const { agentConfig } = await import('../src/index.js');
        const skillIds = agentConfig.skills.map(skill => skill.id);
        expect(skillIds).toContain('position-status');
        expect(skillIds).toContain('health-monitoring');
        expect(skillIds).toContain('liquidation-prevention');
    });

    it('should have correct agent metadata', async () => {
        const { agentConfig } = await import('../src/index.js');
        expect(agentConfig.version).toBeDefined();
        expect(agentConfig.description).toContain('liquidation prevention');
        expect(agentConfig.capabilities).toBeDefined();
        expect(agentConfig.defaultInputModes).toContain('application/json');
        expect(agentConfig.defaultOutputModes).toContain('application/json');
    });

    it('should be able to create agent with current configuration', async () => {
        const { Agent } = await import('arbitrum-vibekit-core');
        const { agentConfig } = await import('../src/index.js');
        expect(() => Agent.create(agentConfig)).not.toThrow();
        const agent = Agent.create(agentConfig);
        expect(agent).toBeDefined();
        expect(agent.card.name).toBe(agentConfig.name);
        expect(agent.card.skills).toHaveLength(agentConfig.skills.length);
    });

    it('should have MCP server with registered tools', async () => {
        const { Agent } = await import('arbitrum-vibekit-core');
        const { agentConfig } = await import('../src/index.js');
        const agent = Agent.create(agentConfig);
        expect(agent.mcpServer).toBeDefined();
        expect(agent.card.skills.length).toBe(agentConfig.skills.length);
    });

    it('should validate framework requirements', async () => {
        const { Agent } = await import('arbitrum-vibekit-core');
        // Test that agent creation fails without skills
        const emptyConfig = {
            name: 'Test Agent',
            version: '1.0.0',
            description: 'Test agent',
            url: 'localhost',
            capabilities: { streaming: false },
            defaultInputModes: ['application/json'],
            defaultOutputModes: ['application/json'],
            skills: [],
        };
        expect(() => Agent.create(emptyConfig as any)).toThrow();
    });
}); 