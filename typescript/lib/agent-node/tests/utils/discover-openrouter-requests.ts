#!/usr/bin/env tsx
/**
 * Discover what OpenRouter requests are made for workflow dispatch
 *
 * This script directly tests the AI service to see what HTTP requests
 * would be made to OpenRouter when dispatching workflows with tool calls.
 *
 * Usage: OPENROUTER_API_KEY=your-key tsx tests/utils/discover-openrouter-requests.ts
 */

import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, tool } from 'ai';
import { z } from 'zod';

// Track requests
let requestCount = 0;

// Hook into fetch to log requests
const originalFetch = global.fetch;
global.fetch = async (input: any, init?: any) => {
  requestCount++;
  const url = typeof input === 'string' ? input : input.url;
  const method = init?.method || 'GET';
  const body = init?.body;

  console.log(`\n=== HTTP Request #${requestCount} ===`);
  console.log(`${method} ${url}`);

  if (init?.headers) {
    const headers: any = {};
    for (const [key, value] of Object.entries(init.headers)) {
      if (key.toLowerCase() === 'authorization') {
        headers[key] = 'Bearer [REDACTED]';
      } else {
        headers[key] = value;
      }
    }
    console.log('Headers:', JSON.stringify(headers, null, 2));
  }

  if (body) {
    try {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      const parsed = JSON.parse(bodyStr);
      console.log('Body:', JSON.stringify(parsed, null, 2));
    } catch {
      console.log('Body: [Binary or non-JSON data]');
    }
  }
  console.log('=============================\n');

  // Make the actual request
  return originalFetch(input, init);
};

async function main() {
  console.log('=== OpenRouter Request Discovery for Workflow Dispatch ===\n');

  const apiKey = process.env['OPENROUTER_API_KEY'];
  if (!apiKey || apiKey === 'test-key' || apiKey === 'test-discovery-key') {
    console.error('Error: A real OPENROUTER_API_KEY is required');
    console.error(
      'Usage: OPENROUTER_API_KEY=your-key tsx tests/utils/discover-openrouter-requests.ts',
    );
    process.exit(1);
  }

  // Create OpenRouter provider
  const openrouter = createOpenRouter({
    apiKey,
  });

  // Define workflow dispatch tools similar to what the agent would have
  const tools = {
    dispatch_workflow_monitor_test: tool({
      description: 'Dispatch the monitor_test workflow',
      parameters: z.object({
        params: z.record(z.unknown()).optional(),
      }),
    }),
    dispatch_workflow_race_condition_test: tool({
      description: 'Dispatch the race_condition_test workflow',
      parameters: z.object({
        params: z.record(z.unknown()).optional(),
      }),
    }),
    dispatch_workflow_filter_test_1: tool({
      description: 'Dispatch the filter_test_1 workflow',
      parameters: z.object({
        params: z.record(z.unknown()).optional(),
      }),
    }),
    dispatch_workflow_filter_test_2: tool({
      description: 'Dispatch the filter_test_2 workflow',
      parameters: z.object({
        params: z.record(z.unknown()).optional(),
      }),
    }),
    dispatch_workflow_multi_pause_test: tool({
      description: 'Dispatch the multi_pause_test workflow',
      parameters: z.object({
        params: z.record(z.unknown()).optional(),
      }),
    }),
  };

  console.log('Testing workflow dispatch with tool calling...\n');

  try {
    // Test 1: Single workflow dispatch
    console.log('=== Test 1: Single workflow dispatch ===');
    const result1 = await streamText({
      model: openrouter('openai/gpt-4o-mini'),
      messages: [
        {
          role: 'system',
          content: 'You are an AI agent that can dispatch workflows using the available tools.',
        },
        {
          role: 'user',
          content: 'Start the workflow',
        },
      ],
      tools,
      toolChoice: 'required', // Force tool use
      maxSteps: 1,
    });

    // Consume a bit of the stream to trigger the request
    let count = 0;
    for await (const chunk of result1.fullStream) {
      console.log(`Stream chunk ${++count}: ${chunk.type}`);
      if (count >= 3) break; // Just get first few chunks
    }

    console.log('\n=== Test 2: Multiple workflow dispatch ===');
    const result2 = await streamText({
      model: openrouter('openai/gpt-4o-mini'),
      messages: [
        {
          role: 'system',
          content: 'You are an AI agent that can dispatch workflows using the available tools.',
        },
        {
          role: 'user',
          content: 'Start both workflows filter_test_1 and filter_test_2',
        },
      ],
      tools,
      maxSteps: 2,
    });

    // Consume stream
    count = 0;
    for await (const chunk of result2.fullStream) {
      console.log(`Stream chunk ${++count}: ${chunk.type}`);
      if (count >= 3) break;
    }
  } catch (error) {
    console.error('Error during test:', error);
    if (
      (error as any).message?.includes('401') ||
      (error as any).message?.includes('Unauthorized')
    ) {
      console.error('\nThe API key may be invalid. Please check your OPENROUTER_API_KEY.');
    }
  }

  console.log('\n=== Discovery Complete ===');
  console.log(`Total HTTP requests captured: ${requestCount}`);
  console.log('\nReview the HTTP requests above to understand:');
  console.log('1. The exact URL endpoints used');
  console.log('2. The request body format for tool-calling');
  console.log('3. Whether streaming is enabled');
  console.log('4. What headers are required');

  process.exit(0);
}

// Run discovery
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
