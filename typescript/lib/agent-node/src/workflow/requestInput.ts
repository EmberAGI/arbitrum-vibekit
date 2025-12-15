import { z } from 'zod';

import type { WorkflowState } from './types.js';

export interface RequestInputOptions<T extends z.ZodObject<Record<string, z.ZodTypeAny>>> {
  message: string;
  inputSchema: T;
  reason?: 'input-required' | 'auth-required';
  maxAttempts?: number;
}

/**
 * Helper for requesting typed user input in workflows.
 * Yields an interrupted state and validates resumed input using the provided schema.
 * 
 * @param options - Configuration for the input request
 * @returns AsyncGenerator that yields interrupted state and returns validated input
 * 
 * @example
 * ```typescript
 * const confirmationSchema = z.object({
 *   confirmed: z.boolean(),
 *   notes: z.string().optional(),
 * });
 * 
 * const input = yield* requestInput({
 *   message: 'Please confirm to proceed',
 *   inputSchema: confirmationSchema,
 * });
 * // input is now typed as { confirmed: boolean; notes?: string }
 * ```
 */
export async function* requestInput<T extends z.ZodObject<Record<string, z.ZodTypeAny>>>(
  options: RequestInputOptions<T>,
): AsyncGenerator<WorkflowState, z.infer<T>, unknown> {
  const { message, inputSchema, reason = 'input-required', maxAttempts = 3 } = options;
  
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    
    const input: unknown = yield {
      type: 'interrupted',
      reason,
      message,
      inputSchema,
    };
    
    const result = inputSchema.safeParse(input);
    
    if (result.success) {
      return result.data;
    }
    
    if (attempts >= maxAttempts) {
      throw new Error(`Invalid input after ${maxAttempts} attempts: ${JSON.stringify(result.error.issues)}`);
    }
  }
  
  // This should never be reached due to the throw above, but TypeScript needs it
  throw new Error('Unexpected end of requestInput');
}
