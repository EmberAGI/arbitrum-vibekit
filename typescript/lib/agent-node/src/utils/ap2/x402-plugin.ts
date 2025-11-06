import { z } from 'zod';

import type { WorkflowState } from '../../workflow/types.js';

/**
 * Placeholder for payment request functionality
 * This will be implemented when AP2 protocol support is added
 */
export function requirePaymentMessage(
  message: string,
  _requirements: unknown,
): WorkflowState {
  // Placeholder implementation - returns an interrupted state for payment
  // Using z.object({}) as a placeholder schema until AP2 protocol is implemented
  return {
    type: 'interrupted',
    reason: 'auth-required',
    message: message,
    inputSchema: z.object({
      // TODO: Implement proper payment schema when AP2 protocol is added
      placeholder: z.string().optional(),
    }),
  };
}

// Payment settlement type placeholder
export interface PaymentSettlement {
  payer: string;
  amount: string;
  currency: string;
  transactionHash?: string;
  settlePayment: (message: string, debug?: boolean) => Promise<WorkflowState>;
}