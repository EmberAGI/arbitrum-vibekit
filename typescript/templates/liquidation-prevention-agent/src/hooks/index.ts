/**
 * Liquidation Prevention Agent Hooks
 * 
 * This module exports hooks for secure transaction handling and validation
 * following Vibekit's withHooks pattern for agent security.
 */

export { withHooks } from './withHooks.js';
export { 
  transactionSigningAfterHook, 
  transactionValidationBeforeHook 
} from './transactionSigningHook.js';
export type { 
  LiquidationPreventionHookConfig, 
  BeforeHook, 
  AfterHook 
} from './withHooks.js';
