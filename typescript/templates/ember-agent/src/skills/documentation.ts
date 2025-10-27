import { z } from 'zod';
import { defineSkill } from '@emberai/arbitrum-vibekit-core';
import { askCamelotTool } from '../tools/askCamelot.js';

// Input schema for the documentation skill
export const documentationSkillInputSchema = z.object({
  question: z.string().min(1).describe('Question about any supported DeFi protocol or platform'),
});

/**
 * Protocol Documentation Expert Skill
 *
 * Provides expert knowledge about all supported DeFi protocols and platforms.
 * Currently supports detailed information about Camelot DEX and Arbitrum ecosystem.
 */
export const documentationSkill = defineSkill({
  id: 'protocol-documentation',
  name: 'Protocol Documentation Expert',
  description:
    'Expert knowledge about supported DeFi protocols including Camelot DEX, Arbitrum ecosystem, tokenomics, and trading mechanisms',
  tags: ['documentation', 'help', 'camelot', 'arbitrum', 'defi', 'dex', 'grail', 'xgrail'],
  examples: [
    'What is Camelot DEX?',
    'How does xGRAIL work?',
    'Explain Camelot AMM V3 vs V4',
    'What are Nitro Pools?',
    'How does GRAIL tokenomics work?',
    'What is the Round Table program?',
    'Tell me about Camelot launchpad',
    'How do dynamic fees work on Camelot?',
  ],
  inputSchema: documentationSkillInputSchema,
  tools: [askCamelotTool],
  // No manual handler - use LLM orchestration for flexible routing
});

export type DocumentationSkillInput = z.infer<typeof documentationSkillInputSchema>;
