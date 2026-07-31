import { z } from 'zod';

type EvidenceResult = {
  freshness?: {
    fresh_until?: string;
    received_at?: string;
  };
  status?: string;
};

export function validateStaleExpiration(
  result: EvidenceResult,
  context: z.RefinementCtx,
): void {
  if (result.status !== 'stale') {
    return;
  }

  const freshUntil = result.freshness?.fresh_until;
  const receivedAt = result.freshness?.received_at;

  if (
    freshUntil !== undefined &&
    receivedAt !== undefined &&
    Date.parse(receivedAt) <= Date.parse(freshUntil)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'stale results require received_at after fresh_until',
      path: ['freshness', 'fresh_until'],
    });
  }
}
