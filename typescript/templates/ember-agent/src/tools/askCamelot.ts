import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { streamText } from 'ai';
import { VibkitToolDefinition } from '@emberai/arbitrum-vibekit-core';
import type { EmberContext } from '../context/types.js';
import type { Task } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { TaskState } from '@emberai/arbitrum-vibekit-core/google-a2a-types';

// Get the current file directory for resolving the encyclopedia path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parameters schema for the askCamelot tool
export const askCamelotToolParameters = z.object({
  question: z
    .string()
    .min(1)
    .describe('Question about Camelot DEX, GRAIL/xGRAIL tokens, or related topics'),
});

/**
 * Load Camelot documentation from encyclopedia files
 */
async function loadCamelotDocumentation(): Promise<string> {
  const defaultDocsPath = path.resolve(__dirname, '../encyclopedia');
  const docsPath = defaultDocsPath;
  const filePaths = [path.join(docsPath, 'camelot-01.md')];
  let combinedContent = '';

  console.log(`Loading Camelot documentation from: ${docsPath}`);

  for (const filePath of filePaths) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      combinedContent += `\n\n--- Content from ${path.basename(filePath)} ---\n\n${content}`;
      console.log(`Successfully loaded ${path.basename(filePath)}`);
    } catch (error) {
      console.error(
        `Warning: Could not load or read Camelot documentation file ${filePath}:`,
        error
      );
      combinedContent += `\n\n--- Failed to load ${path.basename(filePath)} ---`;
    }
  }

  if (!combinedContent.trim()) {
    console.error('Warning: Camelot documentation context is empty after loading attempts.');
  }

  return combinedContent;
}

/**
 * Ask Camelot Tool
 *
 * Provides expert answers about Camelot DEX using comprehensive protocol documentation.
 * Covers all aspects including tokenomics, AMM versions, partnerships, and ecosystem.
 */
export const askCamelotTool: VibkitToolDefinition<
  typeof askCamelotToolParameters,
  Task,
  EmberContext
> = {
  name: 'ask-camelot',
  description: 'Answer questions about Camelot DEX protocol, tokenomics, features, and ecosystem',
  parameters: askCamelotToolParameters,
  execute: async (args, context) => {
    try {
      // Load the Camelot documentation from files
      const camelotDocumentation = await loadCamelotDocumentation();

      if (!camelotDocumentation.trim()) {
        return {
          id: context.skillInput?.userAddress || 'camelot-doc-user',
          contextId: `camelot-docs-error-${Date.now()}`,
          kind: 'task',
          status: {
            state: TaskState.Failed,
            message: {
              role: 'agent',
              messageId: `msg-${Date.now()}`,
              kind: 'message',
              parts: [
                {
                  kind: 'text',
                  text: 'Could not load the necessary Camelot documentation to answer your question.',
                },
              ],
            },
          },
        };
      }

      // Get the AI model from context
      const model = context.custom.llmModel;

      // Create a specialized system prompt for Camelot expertise
      const systemPrompt = `You are a Camelot DEX expert with comprehensive knowledge about the protocol. The following information is your own knowledge and expertise - do not refer to it as provided, given, or external information. Speak confidently in the first person as the expert you are.

Do not say phrases like "Based on my knowledge" or "According to the information". Instead, simply state the facts directly as an expert would.

If you don't know something, simply say "I don't know" or "I don't have information about that" without apologizing or referring to limited information.

${camelotDocumentation}`;

      // Generate response using the AI model
      const { textStream } = await streamText({
        model: model,
        system: systemPrompt,
        prompt: args.question,
        temperature: 0.3, // Lower temperature for more factual responses
      });

      // Collect the streamed response
      let fullResponse = '';
      for await (const chunk of textStream) {
        fullResponse += chunk;
      }

      // Return successful task response
      return {
        id: context.skillInput?.userAddress || 'camelot-user',
        contextId: `camelot-success-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Completed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [
              {
                kind: 'text',
                text: fullResponse,
              },
            ],
          },
        },
      };
    } catch (error) {
      return {
        id: context.skillInput?.userAddress || 'camelot-error-user',
        contextId: `camelot-error-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Failed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [
              {
                kind: 'text',
                text: `Error answering Camelot question: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
          },
        },
      };
    }
  },
};

export type AskCamelotToolInput = z.infer<typeof askCamelotToolParameters>;
