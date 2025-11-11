import { PaymentRequirements } from 'x402/types';

/**
 * Creates payment requirements for USDAi Points Trading Strategy execution.
 * @param agentsWallet - The agent's wallet address to receive payment
 * @returns PaymentRequirements object
 */
export function createPaymentRequirements(agentsWallet: `0x${string}`): PaymentRequirements {
  return {
    scheme: 'exact',
    network: 'base-sepolia',
    description: 'Enabling USDAi Points Trading Strategy execution (fixture)',
    resource: 'https://example.test/usdai-strategy',
    payTo: agentsWallet,
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    maxAmountRequired: '10000', // 0.01 USDC (6 decimals)
    mimeType: 'application/json',
    maxTimeoutSeconds: 3600,
    extra: {
      name: 'USDC',
      version: '2',
    },
  };
}
