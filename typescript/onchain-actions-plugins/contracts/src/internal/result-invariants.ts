import { z } from 'zod';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function validateAvailableCurrentness(result: unknown, context: z.RefinementCtx): void {
  if (!isRecord(result) || result['status'] !== 'available' || !isRecord(result['freshness'])) {
    return;
  }

  const receivedAt = result['freshness']['received_at'];
  const freshUntil = result['freshness']['fresh_until'];

  if (
    typeof receivedAt === 'string' &&
    typeof freshUntil === 'string' &&
    Date.parse(freshUntil) < Date.parse(receivedAt)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'available results must remain fresh through received_at',
      path: ['freshness', 'fresh_until'],
    });
  }
}
