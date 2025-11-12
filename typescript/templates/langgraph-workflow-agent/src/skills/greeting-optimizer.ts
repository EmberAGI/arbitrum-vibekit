import { z } from 'zod';
import { defineSkill } from '@emberai/arbitrum-vibekit-core';
import { optimizeGreetingTool } from '../tools/optimize-greeting.js';

// Input schema for the skill
const inputSchema = z.object({
  message: z.string().describe('The greeting message to optimize'),
});

// Define the greeting optimizer skill
export const greetingOptimizerSkill = defineSkill({
  id: 'greeting-optimizer',
  name: 'Greeting Optimizer',
  description:
    'Optimizes greetings to be more friendly and engaging using an evaluator-optimizer workflow',
  tags: ['greeting', 'optimization', 'langgraph', 'workflow'],
  examples: ['hello', 'hi', 'yo', 'good morning'],
  inputSchema,
  tools: [optimizeGreetingTool], // Single tool that runs the entire workflow
});
