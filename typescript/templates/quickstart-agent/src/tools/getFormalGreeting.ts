/**
 * Formal Greeting Tool
 * Demonstrates accessing custom context
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from '@emberai/arbitrum-vibekit-core';
import { createSuccessTask } from '@emberai/arbitrum-vibekit-core';
import type { HelloContext } from '../context/types.js';

const FormalGreetingParams = z.object({
  name: z.string().describe('Name of the person to greet'),
});

export const getFormalGreetingTool: VibkitToolDefinition<typeof FormalGreetingParams, any, HelloContext, any> = {
  name: 'get-formal-greeting',
  description: 'Generate a formal greeting',
  parameters: FormalGreetingParams,
  execute: async (args, context) => {
    // Access custom context - defaultLanguage
    const language = context.custom.defaultLanguage;
    const prefix = context.custom.greetingPrefix;

    // Generate formal greeting based on language
    let greeting: string;
    switch (language) {
      case 'es':
        greeting = `${prefix} Buenos días, ${args.name}. ¿En qué puedo ayudarle hoy?`;
        break;
      case 'fr':
        greeting = `${prefix} Bonjour, ${args.name}. Comment puis-je vous aider aujourd'hui?`;
        break;
      case 'de':
        greeting = `${prefix} Guten Tag, ${args.name}. Wie kann ich Ihnen heute helfen?`;
        break;
      default:
        greeting = `${prefix} Good day, ${args.name}. How may I assist you today?`;
    }

    console.error('[FormalGreetingTool] Generated greeting:', greeting);

    return createSuccessTask(
      'greet',
      undefined, // no artifacts
      greeting,
    );
  },
};
