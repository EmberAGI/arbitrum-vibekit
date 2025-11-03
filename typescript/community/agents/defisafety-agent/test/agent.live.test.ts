import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { agentConfig } from '../src/index.js';
import { Agent } from '@emberai/arbitrum-vibekit-core';

describe('DeFi Safety Agent Live Tests', () => {
  let agent: Agent;
  let server: any;
  const testPort = 3011;

  beforeAll(async () => {
    // Skip live tests if required environment variables are not set
    if (!process.env.OPENAI_API_KEY && !process.env.OPENROUTER_API_KEY) {
      console.log('Skipping live tests - no API keys provided');
      return;
    }

    agent = Agent.create(agentConfig);
    server = await agent.start(testPort);
  });

  afterAll(async () => {
    if (server) {
      await agent.stop();
    }
  });

  it.skipIf(!process.env.OPENAI_API_KEY && !process.env.OPENROUTER_API_KEY)(
    'should start agent successfully',
    async () => {
      expect(server).toBeDefined();
      
      // Test agent card endpoint
      const response = await fetch(`http://localhost:${testPort}/.well-known/agent.json`);
      expect(response.ok).toBe(true);
      
      const agentCard = await response.json();
      expect(agentCard.name).toBe('DeFi Safety Agent');
      expect(agentCard.description).toContain('DeFi protocol safety');
    }
  );

  it.skipIf(!process.env.OPENAI_API_KEY && !process.env.OPENROUTER_API_KEY)(
    'should have defisafety-evaluation skill available',
    async () => {
      const response = await fetch(`http://localhost:${testPort}/.well-known/agent.json`);
      const agentCard = await response.json();
      
      expect(agentCard.skills).toBeDefined();
      const defiSafetySkill = agentCard.skills.find((skill: any) => skill.id === 'defisafety-evaluation');
      expect(defiSafetySkill).toBeDefined();
      expect(defiSafetySkill.name).toBe('DeFi Safety Evaluation');
    }
  );

  it.skipIf(!process.env.OPENAI_API_KEY && !process.env.OPENROUTER_API_KEY)(
    'should expose correct SSE endpoint',
    async () => {
      // Test SSE endpoint availability (don't need to complete the stream)
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 1000);

      try {
        await fetch(`http://localhost:${testPort}/sse`, {
          signal: controller.signal,
          headers: {
            'Accept': 'text/event-stream',
          },
        });
      } catch (error: any) {
        // Expect abort error, not connection error
        expect(error.name).toBe('AbortError');
      }
    }
  );
});