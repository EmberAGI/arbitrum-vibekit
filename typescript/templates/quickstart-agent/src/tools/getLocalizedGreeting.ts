/**
 * Localized Greeting Tool
 * Base tool that will be enhanced with hooks
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from '@emberai/arbitrum-vibekit-core';
import { createSuccessTask, withHooks } from '@emberai/arbitrum-vibekit-core';
import type { HelloContext } from '../context/types.js';
import { timestampHook, logHook } from '../hooks/index.js';

const LocalizedGreetingParams = z.object({
  name: z.string().describe('Name of the person to greet'),
  targetLanguage: z.string().describe('Target language code'),
});

// Base tool definition
const getLocalizedGreetingBase: VibkitToolDefinition<typeof LocalizedGreetingParams, any, HelloContext, any> = {
  name: 'get-localized-greeting',
  description: 'Generate a greeting in a specific language',
  parameters: LocalizedGreetingParams,
  execute: async (args, context) => {
    const prefix = context.custom.greetingPrefix;

    // Check if we have an MCP client for translation
    const translateClient = context.mcpClients?.['mock-mcp-translate'];

    if (translateClient) {
      try {
        console.error('[LocalizedGreetingTool] Using MCP translation service');

        // Translate "Hello" to target language
        const response = await translateClient.callTool({
          name: 'translate',
          arguments: {
            text: 'Hello',
            targetLanguage: args.targetLanguage,
            sourceLanguage: 'en',
          },
        });

        // Parse translation response
        if (response.content && Array.isArray(response.content) && response.content.length > 0) {
          const firstContent = response.content[0];
          if (firstContent && 'text' in firstContent) {
            const data = JSON.parse(firstContent.text);
            const translatedHello = data.translated;
            const greeting = `${prefix} ${translatedHello}, ${args.name}!`;

            return createSuccessTask('greet', undefined, greeting);
          }
        }
      } catch (error) {
        console.error('[LocalizedGreetingTool] Translation failed:', error);
      }
    }

    // Fallback if MCP not available or fails
    const greeting = `${prefix} [${args.targetLanguage}] Hello, ${args.name}!`;
    return createSuccessTask('greet', undefined, greeting);
  },
};

// Export the enhanced tool with hooks
export const getLocalizedGreetingTool = withHooks(getLocalizedGreetingBase, {
  before: timestampHook,
  after: logHook,
});
