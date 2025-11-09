import type { PaymentRequirements } from 'x402/types';

import type { WorkflowState } from '../../../../src/workflow/types.js';
import { X402_REQUIREMENTS_KEY, X402_STATUS_KEY } from '../../../../src/workflow/x402-types.js';

/**
 * Local (test-fixture) version of createPaymentRequirements to avoid importing
 * production config utilities directly. Mirrors production behavior but kept minimal.
 */
export function createPaymentRequirements(agentsWallet: `0x${string}`): PaymentRequirements {
  return {
    scheme: 'exact',
    network: 'base-sepolia',
    description: 'Enabling USDAi Points Trading Strategy execution (fixture)',
    // Upstream x402 schema validates this with z.string().url(), so a bare path fails validation.
    // Use a fully-qualified URL to satisfy the requirement.
    resource: 'https://example.test/usdai-strategy',
    payTo: agentsWallet,
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    maxAmountRequired: '100', // 1 USDC (6 decimals)
    mimeType: 'application/json',
    maxTimeoutSeconds: 3600,
    extra: {
      name: 'USDC',
      version: '2',
    },
  };
}

/**
 * Local copy of requirePaymentMessage so the fixture workflow is self-contained.
 */
export function requireFixturePaymentMessage(
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
        accepts: [requirements],
      },
    },
  };
}
