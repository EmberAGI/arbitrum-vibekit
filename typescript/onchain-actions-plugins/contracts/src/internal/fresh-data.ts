import { z } from 'zod';

import {
  FreshnessEvidenceV1Schema,
  ProvenanceV1Schema,
  PublicWarningV1Schema,
} from '../external-data/index.js';

import { validateResultFreshness } from './result-invariants.js';

const Rfc3339UtcSchema = z.string().datetime();
const warningsShape = {
  warnings: z.array(PublicWarningV1Schema).max(100).optional(),
};

export const PositiveDecimalStringSchema = z
  .string()
  .regex(/^(?=.*[1-9])(?:0|[1-9]\d*)(?:\.\d+)?$/, 'must be a positive decimal string');

export function createFreshDataResultV1Schema<
  SubjectSchema extends z.ZodTypeAny,
  ValueSchema extends z.ZodTypeAny,
>(subjectSchema: SubjectSchema, valueSchema: ValueSchema) {
  return z.discriminatedUnion('status', [
    z
      .object({
        status: z.literal('available'),
        subject: subjectSchema,
        value: valueSchema,
        freshness: FreshnessEvidenceV1Schema,
        provenance: ProvenanceV1Schema,
        ...warningsShape,
      })
      .strict(),
    z
      .object({
        status: z.literal('rate_limited'),
        subject: subjectSchema,
        reason: z.literal('rate_limited'),
        retry_after: Rfc3339UtcSchema.optional(),
        ...warningsShape,
      })
      .strict(),
    z
      .object({
        status: z.literal('not_found'),
        subject: subjectSchema,
        reason: z.literal('not_found'),
        ...warningsShape,
      })
      .strict(),
    z
      .object({
        status: z.literal('unsupported'),
        subject: subjectSchema,
        reason: z.literal('unsupported_subject'),
        ...warningsShape,
      })
      .strict(),
    z
      .object({
        status: z.literal('unavailable'),
        subject: subjectSchema,
        reason: z.enum(['provider_unavailable', 'provider_payload_invalid']),
        ...warningsShape,
      })
      .strict(),
  ]).superRefine(validateResultFreshness);
}
