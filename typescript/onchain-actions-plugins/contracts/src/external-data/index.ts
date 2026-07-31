import { z } from 'zod';

import { validateResultFreshness } from '../internal/result-invariants.js';

const Rfc3339UtcSchema = z.string().datetime();
const BoundedIdentifierSchema = z.string().trim().min(1).max(128);
const CanonicalSubjectSchema = z.string().trim().min(1).max(512);

export const FreshnessEvidenceV1Schema = z
  .object({
    observed_at: Rfc3339UtcSchema,
    received_at: Rfc3339UtcSchema,
    fresh_until: Rfc3339UtcSchema,
    refresh_after: Rfc3339UtcSchema.optional(),
    retry_after: Rfc3339UtcSchema.optional(),
    observed_at_source: z.enum(['provider', 'receipt_fallback']),
  })
  .strict()
  .superRefine((freshness, context) => {
    const observedAt = Date.parse(freshness.observed_at);
    const receivedAt = Date.parse(freshness.received_at);
    const freshUntil = Date.parse(freshness.fresh_until);

    if (receivedAt < observedAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'received_at must not precede observed_at',
        path: ['received_at'],
      });
    }

    if (freshUntil < observedAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'fresh_until must not precede observed_at',
        path: ['fresh_until'],
      });
    }

    if (freshness.refresh_after && Date.parse(freshness.refresh_after) > freshUntil) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'refresh_after must not follow fresh_until',
        path: ['refresh_after'],
      });
    }
  });

export type FreshnessEvidenceV1 = z.infer<typeof FreshnessEvidenceV1Schema>;

export const ProvenanceV1Schema = z
  .object({
    provider_id: BoundedIdentifierSchema,
    capability: BoundedIdentifierSchema,
    canonical_subject: CanonicalSubjectSchema,
    source_class: BoundedIdentifierSchema,
  })
  .strict();

export type ProvenanceV1 = z.infer<typeof ProvenanceV1Schema>;

export const PublicIssueCodeV1Schema = z.enum([
  'partial_result',
  'timestamp_fallback',
  'stale_observation',
  'rate_limited',
  'not_found',
  'unsupported_subject',
  'provider_unavailable',
  'provider_payload_invalid',
]);

export type PublicIssueCodeV1 = z.infer<typeof PublicIssueCodeV1Schema>;

export const PublicWarningV1Schema = z
  .object({
    code: PublicIssueCodeV1Schema,
    message: z.string().trim().min(1).max(512),
    subject: CanonicalSubjectSchema.optional(),
    retry_after: Rfc3339UtcSchema.optional(),
  })
  .strict();

export type PublicWarningV1 = z.infer<typeof PublicWarningV1Schema>;

const warningsShape = {
  warnings: z.array(PublicWarningV1Schema).max(100).optional(),
};

export function createDataResultV1Schema<
  SubjectSchema extends z.ZodTypeAny,
  ValueSchema extends z.ZodTypeAny,
>(subjectSchema: SubjectSchema, valueSchema: ValueSchema) {
  return z
    .discriminatedUnion('status', [
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
          status: z.literal('stale'),
          subject: subjectSchema,
          reason: z.literal('stale_observation'),
          last_known_value: valueSchema.optional(),
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
          status: z.literal('unavailable'),
          subject: subjectSchema,
          reason: z.enum([
            'unsupported_subject',
            'provider_unavailable',
            'provider_payload_invalid',
          ]),
          ...warningsShape,
        })
        .strict(),
    ])
    .superRefine(validateResultFreshness);
}

export function createEvidencedFieldV1Schema<ValueSchema extends z.ZodTypeAny>(
  valueSchema: ValueSchema,
) {
  return z
    .object({
      value: valueSchema,
      freshness: FreshnessEvidenceV1Schema,
      provenance: ProvenanceV1Schema,
    })
    .strict();
}

export function createSnapshotEnvelopeV1Schema<
  SubjectSchema extends z.ZodTypeAny,
  ValueSchema extends z.ZodTypeAny,
>(subjectSchema: SubjectSchema, valueSchema: ValueSchema) {
  const resultSchema = createDataResultV1Schema(subjectSchema, valueSchema);

  return z
    .object({
      schema_version: z.literal('1'),
      snapshot_id: z.string().trim().min(1).max(128),
      quote_currency: z
        .string()
        .regex(/^[A-Z]{3}$/, 'quote_currency must be an uppercase ISO currency code'),
      completeness: z.enum(['complete', 'partial', 'unavailable']),
      items: z.array(resultSchema).min(1),
      warnings: z.array(PublicWarningV1Schema).max(100).optional(),
    })
    .strict()
    .superRefine((snapshot, context) => {
      const availableCount = snapshot.items.filter((item) => item.status === 'available').length;
      const expectedCompleteness =
        availableCount === snapshot.items.length
          ? 'complete'
          : availableCount === 0
            ? 'unavailable'
            : 'partial';

      if (snapshot.completeness !== expectedCompleteness) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `completeness must be ${expectedCompleteness} for the supplied item states`,
          path: ['completeness'],
        });
      }
    });
}
