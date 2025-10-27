/**
 * Echo Skill - Demonstrates artifacts and error handling
 * Uses manual handler with VibkitError
 */

import { z } from 'zod';
import { defineSkill, createSuccessTask, createErrorTask, createArtifact, VibkitError } from '@emberai/arbitrum-vibekit-core';
import type { Task } from '@emberai/arbitrum-vibekit-core/google-a2a-types';

// Input schema
const EchoInputSchema = z.object({
  text: z.string().describe('Text to echo back'),
  createArtifact: z.boolean().optional().describe('Whether to create an artifact'),
  simulateError: z.boolean().optional().describe('Simulate an error for testing'),
});

// Dummy tool (required by framework)
const dummyEchoTool = {
  name: 'dummy-echo-tool',
  description: 'Dummy tool for echo skill',
  parameters: z.object({}),
  execute: async () => {
    throw new Error('This tool should not be called when manual handler is provided');
  },
};

export const echoSkill = defineSkill({
  id: 'echo-skill',
  name: 'echo',
  description: 'Echo back the input text, optionally with artifacts',

  tags: ['utility', 'demo', 'testing'],
  examples: ['Echo "Hello World"', 'Echo this text with an artifact', 'Test error handling'],

  inputSchema: EchoInputSchema,

  // Tools are required
  tools: [dummyEchoTool],

  // Manual handler with error handling and artifacts
  handler: async (input): Promise<Task> => {
    console.error('[EchoSkill] Manual handler called with:', input);

    // Simulate error if requested (demonstrates VibkitError)
    if (input.simulateError) {
      throw new VibkitError('SimulatedEchoError', -32001, 'This is a simulated error for testing error handling');
    }

    // Validate input (demonstrates validation error)
    if (!input.text || input.text.trim() === '') {
      return createErrorTask('echo', new VibkitError('ValidationError', -32602, 'Text cannot be empty'));
    }

    // Create artifacts if requested
    const artifacts = [];
    if (input.createArtifact) {
      const artifact = createArtifact(
        [
          { kind: 'text', text: input.text },
          { kind: 'text', text: `\n\nEchoed at: ${new Date().toISOString()}` },
        ],
        'Echo Artifact',
        'An artifact containing the echoed text',
        {
          originalLength: input.text.length,
          reversed: input.text.split('').reverse().join(''),
        },
      );
      artifacts.push(artifact);
    }

    // Create success response
    const echoMessage = `Echo: ${input.text}`;

    return createSuccessTask('echo', artifacts.length > 0 ? artifacts : undefined, echoMessage);
  },

  // No MCP servers needed for this skill
});
