import { describe, it, expect, beforeEach } from 'vitest';
import { defiSafetyEvaluationSkill } from '../src/skills/defiSafetyEvaluation.js';
import { Agent, type AgentConfig } from '@emberai/arbitrum-vibekit-core';

describe('DeFi Safety Evaluation Skill Integration', () => {
  let agent: Agent;
  let agentConfig: AgentConfig;

  beforeEach(() => {
    agentConfig = {
      name: 'Test DeFi Safety Agent',
      version: '1.0.0',
      description: 'Test agent for DeFi safety evaluation',
      skills: [defiSafetyEvaluationSkill],
      url: 'localhost',
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
      },
      defaultInputModes: ['application/json'],
      defaultOutputModes: ['application/json'],
    };

    agent = Agent.create(agentConfig);
  });

  it('should register the defisafety-evaluation skill', () => {
    const skills = agent.getCapabilities().skills;
    expect(skills).toBeDefined();
    expect(skills.some(skill => skill.id === 'defisafety-evaluation')).toBe(true);
  });

  it('should have correct skill metadata', () => {
    const skill = defiSafetyEvaluationSkill;
    expect(skill.id).toBe('defisafety-evaluation');
    expect(skill.name).toBe('DeFi Safety Evaluation');
    expect(skill.description).toContain('DeFiSafety criteria');
    expect(skill.tags).toContain('defi');
    expect(skill.tags).toContain('safety');
  });

  it('should have proper tools configured', () => {
    const skill = defiSafetyEvaluationSkill;
    expect(skill.tools).toHaveLength(3);
    
    const toolNames = skill.tools.map(tool => tool.name);
    expect(toolNames).toContain('evaluate-protocol');
    expect(toolNames).toContain('compare-protocols');
    expect(toolNames).toContain('generate-report');
  });

  it('should have MCP server configuration', () => {
    const skill = defiSafetyEvaluationSkill;
    expect(skill.mcpServers).toHaveLength(1);
    expect(skill.mcpServers[0].command).toBe('node');
    expect(skill.mcpServers[0].moduleName).toContain('defisafety-implementation');
  });

  it('should validate input schema', () => {
    const skill = defiSafetyEvaluationSkill;
    const schema = skill.inputSchema;

    const validInput = {
      instruction: 'Evaluate Aave protocol safety',
    };
    expect(() => schema.parse(validInput)).not.toThrow();

    const invalidInput = {
      wrongField: 'test',
    };
    expect(() => schema.parse(invalidInput)).toThrow();
  });

  it('should have comprehensive examples', () => {
    const skill = defiSafetyEvaluationSkill;
    expect(skill.examples).toHaveLength(5);
    expect(skill.examples[0]).toContain('Aave protocol');
    expect(skill.examples[1]).toContain('Compound');
    expect(skill.examples[2]).toContain('Uniswap and SushiSwap');
  });
});