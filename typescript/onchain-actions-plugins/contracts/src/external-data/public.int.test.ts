import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { TokenIdentifierSchema } from '@emberai/onchain-actions-contracts/core';
import {
  PaginatedPossibleResultsRequestSchema,
  TokenMarketSnapshotEnvelopeV1Schema,
  TokenMarketSnapshotRequestV1Schema,
  TokenMarketSnapshotResultV1Schema,
  TokenMarketSnapshotValueV1Schema,
} from '@emberai/onchain-actions-contracts/endpoints';
import {
  createDataResultV1Schema,
  createEvidencedFieldV1Schema,
  createSnapshotEnvelopeV1Schema,
  FreshnessEvidenceV1Schema,
  ProvenanceV1Schema,
  PublicWarningV1Schema,
} from '@emberai/onchain-actions-contracts/external-data';
import {
  PerpetualsQueryKeys,
  type TokenPriceReader,
  TokenPriceReadResultV1Schema,
} from '@emberai/onchain-actions-contracts/plugins';

const freshness = {
  observed_at: '2026-07-30T12:00:00.000Z',
  received_at: '2026-07-30T12:00:01.000Z',
  fresh_until: '2026-07-30T12:05:00.000Z',
  observed_at_source: 'provider',
} as const;

const provenance = {
  provider_id: 'coingecko',
  capability: 'token_usd_price',
  canonical_subject: 'eip155:42161/erc20:0x0000000000000000000000000000000000000001',
  source_class: 'provider_api',
} as const;

describe('@emberai/onchain-actions-contracts/external-data', () => {
  it('validates freshness and minimal provenance through the public subpath', () => {
    expect(FreshnessEvidenceV1Schema.parse(freshness)).toEqual(freshness);
    expect(ProvenanceV1Schema.parse(provenance)).toEqual(provenance);
    expect(
      ProvenanceV1Schema.safeParse({
        ...provenance,
        source_digest: 'sha256:not-part-of-v1',
      }).success,
    ).toBe(false);
    expect(
      ProvenanceV1Schema.safeParse({
        ...provenance,
        source_artifact: 'provider-payload.json',
      }).success,
    ).toBe(false);
  });

  it('rejects impossible clocks and represents timestamp fallback explicitly', () => {
    expect(
      FreshnessEvidenceV1Schema.safeParse({
        ...freshness,
        received_at: '2026-07-30T11:59:59.000Z',
      }).success,
    ).toBe(false);
    expect(
      FreshnessEvidenceV1Schema.safeParse({
        ...freshness,
        fresh_until: '2026-07-30T11:59:59.000Z',
      }).success,
    ).toBe(false);
    expect(
      FreshnessEvidenceV1Schema.safeParse({
        ...freshness,
        refresh_after: '2026-07-30T12:05:01.000Z',
      }).success,
    ).toBe(false);

    const fallback = {
      ...freshness,
      observed_at: freshness.received_at,
      observed_at_source: 'receipt_fallback',
    } as const;
    const warning = {
      code: 'timestamp_fallback',
      message: 'Provider observation time was absent; receipt time is explicit.',
    } as const;

    expect(FreshnessEvidenceV1Schema.parse(fallback)).toEqual(fallback);
    expect(PublicWarningV1Schema.parse(warning)).toEqual(warning);
    expect(
      PublicWarningV1Schema.safeParse({
        ...warning,
        message: 'x'.repeat(513),
      }).success,
    ).toBe(false);
    expect(
      PublicWarningV1Schema.safeParse({
        ...warning,
        code: 'raw_provider_error',
      }).success,
    ).toBe(false);
    expect(
      PublicWarningV1Schema.safeParse({
        ...warning,
        provider_diagnostic: 'upstream stack trace',
      }).success,
    ).toBe(false);
    expect(
      PublicWarningV1Schema.safeParse({
        ...warning,
        credential: 'provider-api-key',
      }).success,
    ).toBe(false);
  });

  it('allows a current value only for an available result', () => {
    const schema = createDataResultV1Schema(
      z.string().min(1),
      z.object({ price_usd: z.string() }).strict(),
    );
    const available = {
      status: 'available',
      subject: 'token:arb',
      value: { price_usd: '1.25' },
      freshness,
      provenance,
    } as const;

    expect(schema.parse(available)).toEqual(available);
    expect(
      schema.safeParse({
        status: 'unavailable',
        subject: 'token:arb',
        reason: 'provider_unavailable',
        value: { price_usd: '1.25' },
      }).success,
    ).toBe(false);
  });

  it('accepts stale evidence only after its freshness window has elapsed', () => {
    const schema = createDataResultV1Schema(
      z.string().min(1),
      z.object({ price_usd: z.string() }).strict(),
    );
    const staleResult = {
      status: 'stale',
      subject: 'token:arb',
      reason: 'stale_observation',
      last_known_value: { price_usd: '1.10' },
      freshness,
      provenance,
    } as const;

    expect(schema.safeParse(staleResult).success).toBe(false);
    expect(
      schema.safeParse({
        ...staleResult,
        freshness: {
          ...freshness,
          received_at: '2026-07-30T13:00:00.000Z',
        },
      }).success,
    ).toBe(true);

    const envelopeSchema = createSnapshotEnvelopeV1Schema(
      z.string().min(1),
      z.object({ price_usd: z.string() }).strict(),
    );
    expect(
      envelopeSchema.safeParse({
        schema_version: '1',
        snapshot_id: 'premature-stale-snapshot',
        quote_currency: 'USD',
        completeness: 'unavailable',
        items: [staleResult],
      }).success,
    ).toBe(false);
  });

  it('rejects expired available results across generic result and envelope Interfaces', () => {
    const expiredFreshness = {
      ...freshness,
      received_at: '2026-07-30T13:00:00.000Z',
    } as const;
    const genericResultSchema = createDataResultV1Schema(
      z.string().min(1),
      z.object({ price_usd: z.string() }).strict(),
    );
    const genericAvailable = {
      status: 'available',
      subject: 'token:arb',
      value: { price_usd: '1.25' },
      freshness: expiredFreshness,
      provenance,
    } as const;
    expect(genericResultSchema.safeParse(genericAvailable).success).toBe(false);

    const genericEnvelopeSchema = createSnapshotEnvelopeV1Schema(
      z.string().min(1),
      z.object({ price_usd: z.string() }).strict(),
    );
    expect(
      genericEnvelopeSchema.safeParse({
        schema_version: '1',
        snapshot_id: 'expired-generic-snapshot',
        quote_currency: 'USD',
        completeness: 'complete',
        items: [genericAvailable],
      }).success,
    ).toBe(false);
  });

  it('rejects expired available results across fresh-only public Interfaces', () => {
    const token = {
      chainId: '42161',
      address: '0x0000000000000000000000000000000000000001',
    } as const;
    const tokenAvailable = {
      status: 'available',
      subject: token,
      value: { price_usd: '1.25' },
      freshness: {
        ...freshness,
        received_at: '2026-07-30T13:00:00.000Z',
      },
      provenance,
    } as const;

    expect(TokenPriceReadResultV1Schema.safeParse(tokenAvailable).success).toBe(false);
    expect(TokenMarketSnapshotResultV1Schema.safeParse(tokenAvailable).success).toBe(false);
    expect(
      TokenMarketSnapshotEnvelopeV1Schema.safeParse({
        schema_version: '1',
        snapshot_id: 'expired-market-snapshot',
        quote_currency: 'USD',
        completeness: 'complete',
        requested_tokens: [token],
        items: [tokenAvailable],
      }).success,
    ).toBe(false);
  });

  it('validates every generic result state without leaking current values', () => {
    const schema = createDataResultV1Schema(
      z.string().min(1),
      z.object({ price_usd: z.string() }).strict(),
    );
    const states = [
      {
        status: 'available',
        subject: 'token:available',
        value: { price_usd: '1.25' },
        freshness,
        provenance,
      },
      {
        status: 'stale',
        subject: 'token:stale',
        reason: 'stale_observation',
        last_known_value: { price_usd: '1.10' },
        freshness: {
          ...freshness,
          received_at: '2026-07-30T13:00:00.000Z',
        },
        provenance,
      },
      {
        status: 'rate_limited',
        subject: 'token:limited',
        reason: 'rate_limited',
        retry_after: '2026-07-30T12:06:00.000Z',
      },
      {
        status: 'not_found',
        subject: 'token:missing',
        reason: 'not_found',
      },
      {
        status: 'unavailable',
        subject: 'token:unsupported',
        reason: 'unsupported_subject',
      },
      {
        status: 'unavailable',
        subject: 'token:provider',
        reason: 'provider_unavailable',
      },
      {
        status: 'unavailable',
        subject: 'token:malformed',
        reason: 'provider_payload_invalid',
      },
    ] as const;

    for (const state of states) {
      expect(schema.parse(state)).toEqual(state);
    }

    expect(
      schema.safeParse({
        ...states[1],
        value: { price_usd: '1.10' },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...states[2],
        value: { price_usd: '1.25' },
      }).success,
    ).toBe(false);
  });

  it('keeps field-level values coupled to their own evidence', () => {
    const schema = createEvidencedFieldV1Schema(z.string());
    const field = {
      value: '1250000.50',
      freshness,
      provenance,
    } as const;

    expect(schema.parse(field)).toEqual(field);
    expect(schema.safeParse({ value: field.value, provenance }).success).toBe(false);
  });

  it('rejects completeness that hides a failed item', () => {
    const schema = createSnapshotEnvelopeV1Schema(
      z.string().min(1),
      z.object({ price_usd: z.string() }).strict(),
    );
    const items = [
      {
        status: 'available',
        subject: 'token:arb',
        value: { price_usd: '1.25' },
        freshness,
        provenance,
      },
      {
        status: 'not_found',
        subject: 'token:missing',
        reason: 'not_found',
      },
    ] as const;
    const partial = {
      schema_version: '1',
      snapshot_id: 'snapshot-1',
      quote_currency: 'USD',
      completeness: 'partial',
      items,
      warnings: [
        {
          code: 'partial_result',
          message: 'One requested token was not found.',
          subject: 'token:missing',
        },
      ],
    } as const;

    expect(schema.parse(partial)).toEqual(partial);
    expect(schema.safeParse({ ...partial, completeness: 'complete' }).success).toBe(false);
    expect(
      schema.safeParse({
        ...partial,
        completeness: 'unavailable',
        items: [items[1]],
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        ...partial,
        completeness: 'complete',
        items: [items[0]],
      }).success,
    ).toBe(true);
  });
});

describe('@emberai/onchain-actions-contracts public entrypoints', () => {
  it('exposes neutral core, plugin, and endpoint contracts through supported subpaths', () => {
    expect(
      TokenIdentifierSchema.parse({
        chainId: '42161',
        address: '0x0000000000000000000000000000000000000001',
      }),
    ).toEqual({
      chainId: '42161',
      address: '0x0000000000000000000000000000000000000001',
    });
    expect(PerpetualsQueryKeys).toContain('getMarkets');
    expect(PaginatedPossibleResultsRequestSchema.parse({ page: 1 })).toEqual({ page: 1 });
  });

  it('lets a plugin consume an injected evidence-bearing token price reader', async () => {
    const tokens = [
      {
        chainId: '42161',
        address: '0x0000000000000000000000000000000000000001',
      },
      {
        chainId: '42161',
        address: '0x0000000000000000000000000000000000000002',
      },
    ];
    const hostReader: TokenPriceReader = {
      readTokenPrices(requestedTokens) {
        return Promise.resolve(
          requestedTokens.map((subject, index) => ({
            status: 'available' as const,
            subject,
            value: { price_usd: index === 0 ? '1.25' : '2.50' },
            freshness,
            provenance: {
              ...provenance,
              canonical_subject: `${subject.chainId}:${subject.address}`,
            },
          })),
        );
      },
    };

    const results = await hostReader.readTokenPrices(tokens);

    expect(z.array(TokenPriceReadResultV1Schema).parse(results)).toEqual(results);
    expect(results.map((result) => result.subject)).toEqual(tokens);
    expect(
      TokenPriceReadResultV1Schema.safeParse({
        status: 'stale',
        subject: tokens[0],
        last_known_value: { price_usd: '1.00' },
        freshness,
        provenance,
      }).success,
    ).toBe(false);
    expect(
      TokenPriceReadResultV1Schema.safeParse({
        status: 'not_found',
        subject: { chainId: '', address: '' },
        reason: 'not_found',
      }).success,
    ).toBe(false);
  });

  it('validates an ordered token-market snapshot without stale values', () => {
    const tokens = [
      {
        chainId: '42161',
        address: '0x0000000000000000000000000000000000000001',
      },
      {
        chainId: '42161',
        address: '0x0000000000000000000000000000000000000002',
      },
    ];
    const request = { schema_version: '1', tokens } as const;
    const value = { price_usd: '1.25' } as const;
    const items = [
      {
        status: 'available',
        subject: tokens[0],
        value,
        freshness,
        provenance,
      },
      {
        status: 'unavailable',
        subject: tokens[1],
        reason: 'provider_payload_invalid',
      },
    ] as const;
    const envelope = {
      schema_version: '1',
      snapshot_id: 'market-snapshot-1',
      quote_currency: 'USD',
      completeness: 'partial',
      requested_tokens: tokens,
      items,
    } as const;

    expect(TokenMarketSnapshotRequestV1Schema.parse(request)).toEqual(request);
    expect(TokenMarketSnapshotValueV1Schema.parse(value)).toEqual(value);
    expect(z.array(TokenMarketSnapshotResultV1Schema).parse(items)).toEqual(items);
    expect(TokenMarketSnapshotEnvelopeV1Schema.parse(envelope)).toEqual(envelope);
    expect(
      TokenMarketSnapshotRequestV1Schema.safeParse({
        schema_version: '1',
        tokens: [tokens[0], tokens[0]],
      }).success,
    ).toBe(false);
    expect(
      TokenMarketSnapshotResultV1Schema.safeParse({
        status: 'stale',
        subject: tokens[0],
        last_known_value: value,
        freshness,
        provenance,
      }).success,
    ).toBe(false);

    const nonAvailableStates = [
      {
        status: 'rate_limited',
        subject: tokens[0],
        reason: 'rate_limited',
        retry_after: '2026-07-30T12:06:00.000Z',
      },
      {
        status: 'not_found',
        subject: tokens[0],
        reason: 'not_found',
      },
      {
        status: 'unsupported',
        subject: tokens[0],
        reason: 'unsupported_subject',
      },
      {
        status: 'unavailable',
        subject: tokens[0],
        reason: 'provider_unavailable',
      },
      {
        status: 'unavailable',
        subject: tokens[0],
        reason: 'provider_payload_invalid',
      },
    ] as const;

    for (const state of nonAvailableStates) {
      expect(TokenMarketSnapshotResultV1Schema.parse(state)).toEqual(state);
      expect(
        TokenMarketSnapshotResultV1Schema.safeParse({
          ...state,
          value,
        }).success,
      ).toBe(false);
      expect(
        TokenMarketSnapshotResultV1Schema.safeParse({
          ...state,
          last_known_value: value,
        }).success,
      ).toBe(false);
    }

    expect(
      TokenMarketSnapshotEnvelopeV1Schema.safeParse({
        ...envelope,
        items: [items[1], items[0]],
      }).success,
    ).toBe(false);
    expect(
      TokenMarketSnapshotRequestV1Schema.safeParse({
        schema_version: '1',
        tokens: [],
      }).success,
    ).toBe(false);
    expect(
      TokenMarketSnapshotRequestV1Schema.safeParse({
        schema_version: '1',
        tokens: [{ chainId: '42161' }],
      }).success,
    ).toBe(false);
    expect(
      TokenMarketSnapshotRequestV1Schema.safeParse({
        schema_version: '1',
        tokens: [{ chainId: '', address: '' }],
      }).success,
    ).toBe(false);
    expect(
      TokenMarketSnapshotResultV1Schema.safeParse({
        status: 'not_found',
        subject: { chainId: '', address: '' },
        reason: 'not_found',
      }).success,
    ).toBe(false);
    expect(
      TokenMarketSnapshotResultV1Schema.safeParse({
        status: 'unavailable',
        subject: tokens[0],
        reason: 'provider_payload_invalid',
      }).success,
    ).toBe(true);
    expect(
      TokenMarketSnapshotValueV1Schema.safeParse({
        price_usd: '0',
      }).success,
    ).toBe(false);
    expect(
      TokenMarketSnapshotValueV1Schema.parse({
        price_usd: '1.25',
        market_cap_usd: '1000000.50',
        fully_diluted_value_usd: '1200000.75',
      }),
    ).toEqual({
      price_usd: '1.25',
      market_cap_usd: '1000000.50',
      fully_diluted_value_usd: '1200000.75',
    });
    expect(TokenMarketSnapshotValueV1Schema.parse(value)).toEqual(value);
    expect(
      TokenMarketSnapshotRequestV1Schema.safeParse({
        schema_version: '1',
        tokens: Array.from({ length: 51 }, (_, index) => ({
          chainId: '42161',
          address: `token-${index}`,
        })),
      }).success,
    ).toBe(false);
  });

  it('rejects private token fields at the token-market request Interface', () => {
    expect(
      TokenMarketSnapshotRequestV1Schema.safeParse({
        schema_version: '1',
        tokens: [
          {
            chainId: '42161',
            address: '0x0000000000000000000000000000000000000001',
            memgraph_id: 'private-graph-node',
          },
        ],
      }).success,
    ).toBe(false);
  });
});
