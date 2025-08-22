/**
 * Test Tool - Simple tool for debugging
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask } from 'arbitrum-vibekit-core';
import type { RWAContext } from '../context/types.js';

const TestParams = z.object({
    message: z.string().describe('A test message'),
});

export const testTool: VibkitToolDefinition<
    typeof TestParams,
    any,
    RWAContext,
    any
> = {
    name: 'test-tool',
    description: 'Simple test tool for debugging',
    parameters: TestParams,

    execute: async (args, context) => {
        console.log('🧪 [testTool] Executing with args:', args);
        console.log('🧪 [testTool] Context available:', !!context);

        return createSuccessTask(
            'test-result',
            undefined,
            `Test tool executed successfully! Message: "${args.message}"`
        );
    },
};
