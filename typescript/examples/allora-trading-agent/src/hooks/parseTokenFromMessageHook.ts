/**
 * Pre-hook to extract token symbol from user message and inject as `token` property.
 */
import type { HookFunction } from 'arbitrum-vibekit-core';

export const parseTokenFromMessageHook: HookFunction<any, any, any, any> = async (args, context) => {
  // If token is already present, do nothing
  if (args.token) return args;

  const message = args.message || '';
  // Simple regex: look for 2-5 uppercase letters (BTC, ETH, etc.)
  const match = message.match(/\b([A-Z]{2,5})\b/);
  if (match) {
    return { ...args, token: match[1] };
  }
  // fallback: try lowercase
  const matchLower = message.match(/\b([a-z]{2,5})\b/);
  if (matchLower) {
    return { ...args, token: matchLower[1].toUpperCase() };
  }
  // If not found, just return args (tools will error)
  return args;
};
