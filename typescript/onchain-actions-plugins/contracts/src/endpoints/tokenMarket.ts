import { z } from 'zod';

import {
  CanonicalTokenIdentifierV1Schema,
  canonicalTokenIdentityKey,
  tokenIdentitiesAreEquivalent,
} from '../core/index.js';
import { PublicWarningV1Schema } from '../external-data/index.js';
import {
  createFreshDataResultV1Schema,
  PositiveDecimalStringSchema,
} from '../internal/fresh-data.js';

const RequestedTokensSchema = z
  .array(CanonicalTokenIdentifierV1Schema)
  .min(1)
  .max(50)
  .superRefine((tokens, context) => {
    const seen = new Set<string>();

    tokens.forEach((token, index) => {
      // superRefine still runs even when an element already failed its own
      // chainId/address schema check (zod marks that "dirty", not
      // "aborted"). canonicalTokenIdentityKey validates through the public
      // schema and throws for that already-invalid token; its own field
      // issue is already reported, so skip the duplicate-identity check
      // instead of letting the throw escape as an uncaught error.
      let key: string;

      try {
        key = canonicalTokenIdentityKey(token);
      } catch {
        return;
      }

      if (seen.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'tokens must contain unique canonical token identities',
          path: [index],
        });
      }

      seen.add(key);
    });
  });

export const TokenMarketSnapshotRequestV1Schema = z
  .object({
    schema_version: z.literal('1'),
    tokens: RequestedTokensSchema,
  })
  .strict();

export type TokenMarketSnapshotRequestV1 = z.infer<typeof TokenMarketSnapshotRequestV1Schema>;

export const TokenMarketSnapshotValueV1Schema = z
  .object({
    price_usd: PositiveDecimalStringSchema,
    market_cap_usd: PositiveDecimalStringSchema.optional(),
    fully_diluted_value_usd: PositiveDecimalStringSchema.optional(),
  })
  .strict();

export type TokenMarketSnapshotValueV1 = z.infer<typeof TokenMarketSnapshotValueV1Schema>;

export const TokenMarketSnapshotResultV1Schema = createFreshDataResultV1Schema(
  CanonicalTokenIdentifierV1Schema,
  TokenMarketSnapshotValueV1Schema,
);

export type TokenMarketSnapshotResultV1 = z.infer<typeof TokenMarketSnapshotResultV1Schema>;

export const TokenMarketSnapshotEnvelopeV1Schema = z
  .object({
    schema_version: z.literal('1'),
    snapshot_id: z.string().trim().min(1).max(128),
    quote_currency: z.literal('USD'),
    completeness: z.enum(['complete', 'partial', 'unavailable']),
    requested_tokens: RequestedTokensSchema,
    items: z.array(TokenMarketSnapshotResultV1Schema).min(1).max(50),
    warnings: z.array(PublicWarningV1Schema).max(100).optional(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (snapshot.items.length !== snapshot.requested_tokens.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'items must contain one result per requested token',
        path: ['items'],
      });
    }

    snapshot.items.forEach((item, index) => {
      const requestedToken = snapshot.requested_tokens[index];

      if (!requestedToken) {
        return;
      }

      // See the matching comment in RequestedTokensSchema: an already
      // schema-invalid subject or requested token makes
      // tokenIdentitiesAreEquivalent throw; its own field issue is already
      // reported, so skip the ordering check for it here.
      let equivalent: boolean;

      try {
        equivalent = tokenIdentitiesAreEquivalent(item.subject, requestedToken);
      } catch {
        return;
      }

      if (!equivalent) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'items must preserve requested token order',
          path: ['items', index, 'subject'],
        });
      }
    });

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

export type TokenMarketSnapshotEnvelopeV1 = z.infer<typeof TokenMarketSnapshotEnvelopeV1Schema>;
