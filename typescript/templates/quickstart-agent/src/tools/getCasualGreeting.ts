/**
 * Casual Greeting Tool
 * Demonstrates accessing skill input from context
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from '@emberai/arbitrum-vibekit-core';
import { createSuccessTask } from '@emberai/arbitrum-vibekit-core';
import type { HelloContext } from '../context/types.js';

const CasualGreetingParams = z.object({
  // This tool doesn't need any parameters - it gets the name from skillInput
});

export const getCasualGreetingTool: VibkitToolDefinition<
  typeof CasualGreetingParams,
  any,
  HelloContext,
  { name: string; style: string; language?: string }
> = {
  name: 'get-casual-greeting',
  description: 'Generate a casual greeting',
  parameters: CasualGreetingParams,
  execute: async (_args, context) => {
    // Access skill input - demonstrates context.skillInput usage
    const name = context.skillInput?.name || 'friend';
    const prefix = context.custom.greetingPrefix;

    // Generate casual greeting
    const casualGreetings = [
      `${prefix} Hey ${name}! What's up?`,
      `${prefix} Yo ${name}! How's it going?`,
      `${prefix} Hi ${name}! Good to see you!`,
      `${prefix} What's happening, ${name}?`,
    ];

    // Pick a random casual greeting
    const greeting = casualGreetings[Math.floor(Math.random() * casualGreetings.length)];

    console.error('[CasualGreetingTool] Generated greeting:', greeting);
    console.error('[CasualGreetingTool] Skill input:', context.skillInput);

    return createSuccessTask('greet', undefined, greeting);
  },
};
