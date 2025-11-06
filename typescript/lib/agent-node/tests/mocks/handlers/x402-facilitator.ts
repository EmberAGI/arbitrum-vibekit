import { http } from 'msw';

import { createResponseFromMock } from '../utils/error-simulation.js';

const FACILITATOR_URL = 'http://localhost:3402';

type VerifyBody = {
  x402Version: number;
  paymentPayload: Record<string, unknown>;
  paymentRequirements: Record<string, unknown>;
};

function classifyVerifyRequest(
  body: VerifyBody,
): 'success' | 'expired' | 'insufficientValue' | 'invalidRequirements' | 'unknown' {
  const payload = (body?.paymentPayload as Record<string, any> | undefined) ?? undefined;
  const requirements = (body?.paymentRequirements as Record<string, any> | undefined) ?? undefined;
  const auth =
    (payload?.['payload']?.['authorization'] as Record<string, any> | undefined) ?? undefined;

  if (payload?.['payload']?.['transaction']) {
    return 'invalidRequirements';
  }
  if (auth?.['value'] === '10' && requirements?.['maxAmountRequired'] === '100') {
    return 'insufficientValue';
  }
  if (auth?.['validBefore'] === '1762265005') {
    return 'expired';
  }
  if (auth?.['validBefore'] === '1762268567') {
    return 'success';
  }
  return 'unknown';
}

// removed legacy stringified() in favor of stableStringify()

export const x402FacilitatorHandlers = [
  http.post(`${FACILITATOR_URL}/verify`, async ({ request }) => {
    const body = await request.json();
    const kind = classifyVerifyRequest(body as VerifyBody);

    if (kind === 'success') {
      return await createResponseFromMock('verify-success', 'x402-facilitator');
    }
    if (kind === 'expired') {
      return await createResponseFromMock('verify-expired', 'x402-facilitator');
    }
    if (kind === 'insufficientValue') {
      return await createResponseFromMock('verify-insufficient-value', 'x402-facilitator');
    }
    if (kind === 'invalidRequirements') {
      return await createResponseFromMock('verify-invalid-requirements', 'x402-facilitator');
    }

    throw new Error('[MSW] Unknown verify request body for x402 facilitator');
  }),
  http.post(`${FACILITATOR_URL}/settle`, async ({ request }) => {
    const body = await request.json();
    const kind = classifyVerifyRequest(body as VerifyBody);

    if (kind === 'success') {
      return await createResponseFromMock('settle-success', 'x402-facilitator');
    }
    if (kind === 'expired') {
      return await createResponseFromMock('settle-invalid-valid-before', 'x402-facilitator');
    }

    throw new Error('[MSW] Unknown settle request body for x402 facilitator');
  }),
];
