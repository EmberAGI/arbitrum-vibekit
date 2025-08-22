/**
 * Test Skill - Manual Handler
 * Simple test skill to verify the agent works without LLM orchestration
 */

import { z } from 'zod';
import { defineSkill, createSuccessTask } from 'arbitrum-vibekit-core';
import { testTool } from '../tools/testTool.js';

const TestInputSchema = z.object({
  message: z.string().describe('A test message')
});

export const testSkill = defineSkill({
  id: 'test-skill',
  name: 'Test Skill',
  description: 'Simple test skill to verify agent functionality',
  tags: ['test', 'debug'],
  examples: ['Test the agent functionality'],
  inputSchema: TestInputSchema,
  tools: [testTool], // Framework requires at least one tool

  // Manual handler - bypasses LLM orchestration
  handler: async (input) => {
    console.log('🧪 [testSkill] MANUAL HANDLER executing with input:', input);

    return createSuccessTask(
      'test-result',
      undefined,
      `Test successful! Received message: "${input.message}"`
    );
  }
});
