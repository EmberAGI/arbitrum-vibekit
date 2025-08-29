/**
 * Hook functions for Trendmoon tool enhancement
 * Demonstrates the withHooks utility for entity resolution
 */

import type { HookFunction } from 'arbitrum-vibekit-core';
import type { TrendmoonContext } from '../context/types.js';

export { entityResolutionHook } from './entityResolutionHook.js';

/**
 * Log Hook - logs the result after tool execution
 * Demonstrates an after hook for monitoring
 */
export const logHook: HookFunction<any, any, TrendmoonContext, any> = async (result, context) => {
  console.error('[LogHook] Tool execution completed');
  console.error('[LogHook] Result type:', typeof result);
  console.error('[LogHook] Context metadata:', context.custom?.metadata);

  // Return result unchanged - this is just for logging
  return result;
};
