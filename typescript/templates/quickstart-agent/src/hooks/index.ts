/**
 * Hook functions for tool enhancement
 * Demonstrates the withHooks utility
 */

import type { HookFunction } from '@emberai/arbitrum-vibekit-core';
import type { HelloContext } from '../context/types.js';

/**
 * Timestamp Hook - adds timestamp to greeting parameters
 * Demonstrates a before hook that modifies input
 */
export const timestampHook: HookFunction<any, any, HelloContext, any> = async (args, context) => {
  console.error('[TimestampHook] Adding timestamp to args');

  // Add timestamp to the args
  const result = {
    ...args,
    timestamp: new Date().toISOString(),
  };

  // Only add contextLoadedAt if it exists in the context
  if (context.custom?.loadedAt) {
    result.contextLoadedAt = context.custom.loadedAt.toISOString();
  }

  return result;
};

/**
 * Log Hook - logs the result after tool execution
 * Demonstrates an after hook for monitoring
 */
export const logHook: HookFunction<any, any, HelloContext, any> = async (result, context) => {
  console.error('[LogHook] Tool execution completed');
  console.error('[LogHook] Result:', result);
  console.error('[LogHook] Context metadata:', context.custom.metadata);

  // Return result unchanged - this is just for logging
  return result;
};
