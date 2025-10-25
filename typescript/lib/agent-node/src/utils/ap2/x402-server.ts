import { PaymentPayload, PaymentRequirements, Resource } from 'x402/types';
import { useFacilitator } from 'x402/verify';

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
  const facilitatorUrl = process.env['X402_FACILITATOR_URL'];
  if (!facilitatorUrl) {
    throw new Error('X402_FACILITATOR_URL environment variable is not configured');
  }

  const { verify } = useFacilitator({ url: facilitatorUrl as Resource });
  return await verify(paymentPayload, requirements);
}
