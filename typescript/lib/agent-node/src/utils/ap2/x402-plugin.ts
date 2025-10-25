import { PaymentRequirements } from 'x402/types';
import { X402_REQUIREMENTS_KEY, X402_STATUS_KEY } from '../../workflows/x402-types.js';
import type { WorkflowState } from '../../workflows/types.js';

/**
 * Creates a payment required workflow state message for x402 payment requests.
 * Plugin developers can use this helper to request payment for agent tools.
 *
 * @param message - Human-readable message explaining why payment is required
 * @param requirements - Payment requirements specification from x402/types
 * @returns WorkflowState object with payment-required type
 */
export function requirePaymentMessage(
  message: string,
  requirements: PaymentRequirements,
): WorkflowState {
  return {
    type: 'payment-required',
    message,
    metadata: {
      [X402_STATUS_KEY]: 'payment-required',
      [X402_REQUIREMENTS_KEY]: {
        x402Version: 1,
        accepts: requirements,
      },
    },
  };
}
