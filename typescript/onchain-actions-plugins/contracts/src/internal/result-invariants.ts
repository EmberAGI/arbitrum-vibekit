import { z } from 'zod';

type EvidenceResult = {
  freshness?: {
    fresh_until?: string;
    received_at?: string;
  };
  status?: string;
};

export function validateResultFreshness(
  result: EvidenceResult,
  context: z.RefinementCtx,
): void {
  if (result.status !== 'available' && result.status !== 'stale') {
    return;
  }

  const freshUntil = result.freshness?.fresh_until;
  const receivedAt = result.freshness?.received_at;

  if (freshUntil === undefined || receivedAt === undefined) {
    return;
  }

  const isCurrent = Date.parse(receivedAt) <= Date.parse(freshUntil);

  if (result.status === 'available' && !isCurrent) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'available results require received_at at or before fresh_until',
      path: ['freshness', 'fresh_until'],
    });
  }

  if (result.status === 'stale' && isCurrent) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'stale results require received_at after fresh_until',
      path: ['freshness', 'fresh_until'],
    });
  }
}
