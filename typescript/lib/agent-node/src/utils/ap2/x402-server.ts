import type { PaymentPayload, PaymentRequirements, Resource } from 'x402/types';
import { useFacilitator } from 'x402/verify';

import { serviceConfig } from '../../config.js';

/**
 * Verify payment using the configured facilitator
 * @param paymentPayload - The payment payload to verify
 * @param requirements - The payment requirements to verify against
 * @returns Promise with verification result
 */
export async function verifyPayment(
  paymentPayload: PaymentPayload,
  requirements: PaymentRequirements,
) {
  const facilitatorUrl = serviceConfig.x402.facilitatorUrl;
  if (!facilitatorUrl) {
    throw new Error('X402_FACILITATOR_URL is not configured');
  }

  const { verify } = useFacilitator({ url: facilitatorUrl as Resource });
  return await verify(paymentPayload, requirements);
}

/**
 * Settle payment using the configured facilitator
 * @param paymentPayload - The payment payload to settle
 * @param requirements - The payment requirements to settle against
 * @returns Promise with settlement result
 */
export async function settlePayment(
  paymentPayload: PaymentPayload,
  requirements: PaymentRequirements,
) {
  const facilitatorUrl = serviceConfig.x402.facilitatorUrl;
  if (!facilitatorUrl) {
    throw new Error('X402_FACILITATOR_URL is not configured');
  }

  const { settle } = useFacilitator({ url: facilitatorUrl as Resource });
  return await settle(paymentPayload, requirements);
}
