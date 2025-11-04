import { http } from 'msw';

import { verifyRequests } from '../../fixtures/workflows/x402-payloads.js';
import { createResponseFromMock } from '../utils/error-simulation.js';

const FACILITATOR_URL = 'http://localhost:3402';

const stringifiedVerifyRequests = {
  success: JSON.stringify(verifyRequests.success),
  expired: JSON.stringify(verifyRequests.expired),
  insufficientValue: JSON.stringify(verifyRequests.insufficientValue),
  invalidRequirements: JSON.stringify(verifyRequests.invalidRequirements),
};

function stringified(body: unknown): string | null {
  try {
    return JSON.stringify(body);
  } catch {
    return null;
  }
}

export const x402FacilitatorHandlers = [
  http.post(`${FACILITATOR_URL}/verify`, async ({ request }) => {
    const body = await request.json();
    const serialized = stringified(body);

    if (serialized === stringifiedVerifyRequests.success) {
      return await createResponseFromMock('verify-success', 'x402-facilitator');
    }
    if (serialized === stringifiedVerifyRequests.expired) {
      return await createResponseFromMock('verify-expired', 'x402-facilitator');
    }
    if (serialized === stringifiedVerifyRequests.insufficientValue) {
      return await createResponseFromMock('verify-insufficient-value', 'x402-facilitator');
    }
    if (serialized === stringifiedVerifyRequests.invalidRequirements) {
      return await createResponseFromMock('verify-invalid-requirements', 'x402-facilitator');
    }

    throw new Error('[MSW] Unknown verify request body for x402 facilitator');
  }),
  http.post(`${FACILITATOR_URL}/settle`, async ({ request }) => {
    const body = await request.json();
    const serialized = stringified(body);

    if (serialized === stringifiedVerifyRequests.success) {
      return await createResponseFromMock('settle-success', 'x402-facilitator');
    }
    if (serialized === stringifiedVerifyRequests.expired) {
      return await createResponseFromMock('settle-invalid-valid-before', 'x402-facilitator');
    }

    throw new Error('[MSW] Unknown settle request body for x402 facilitator');
  }),
];
