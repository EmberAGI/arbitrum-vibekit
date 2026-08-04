import { z } from 'zod';

import { TokenIdentifierSchema, type TokenIdentifier } from './tokenIdentifier.js';

export const CanonicalTokenIdentifierV1Schema = TokenIdentifierSchema.extend({
  chainId: z.string().trim().min(1),
  address: z.string().trim().min(1),
}).strict();

export type CanonicalTokenIdentifierV1 = z.infer<typeof CanonicalTokenIdentifierV1Schema>;

/**
 * The address-family semantics a chain id resolves to. `evm` and `solana`
 * compare per their chain's own equivalence rule; `opaque` is any chain id
 * this classifier cannot derive a family for and never lowercases.
 */
export type TokenChainFamily = 'evm' | 'solana' | 'opaque';

const LEGACY_SOLANA_CHAIN_ID = 'solana';
const DECIMAL_CHAIN_ID_PATTERN = /^[0-9]+$/;
const CAIP2_CHAIN_ID_PATTERN = /^([-a-zA-Z0-9]{3,8}):(.+)$/;

/**
 * Classifies a chain id into the address family that governs its identity
 * comparison. This is the sole authority for chain-family dispatch: legacy
 * decimal Ember chain ids and `eip155:*` CAIP-2 ids are `evm`, the legacy
 * `solana` literal and `solana:*` CAIP-2 ids are `solana`, and every other
 * chain id is `opaque` and must never be silently lowercased.
 */
export function classifyTokenChainFamily(chainId: string): TokenChainFamily {
  const trimmed = chainId.trim();

  if (trimmed === LEGACY_SOLANA_CHAIN_ID) {
    return 'solana';
  }

  if (DECIMAL_CHAIN_ID_PATTERN.test(trimmed)) {
    return 'evm';
  }

  const caip2Match = CAIP2_CHAIN_ID_PATTERN.exec(trimmed);
  const namespace = caip2Match?.[1]?.toLowerCase();

  if (namespace !== undefined) {
    if (namespace === 'eip155') {
      return 'evm';
    }

    if (namespace === LEGACY_SOLANA_CHAIN_ID) {
      return 'solana';
    }
  }

  return 'opaque';
}

/**
 * Returns the canonical form of a token identity for its chain family:
 * case-insensitive evm addresses normalize to lowercase, while solana and
 * opaque addresses preserve their exact case.
 */
export function normalizeCanonicalTokenIdentifier(token: TokenIdentifier): TokenIdentifier {
  const chainId = token.chainId.trim();
  const trimmedAddress = token.address.trim();
  const family = classifyTokenChainFamily(chainId);
  const address = family === 'evm' ? trimmedAddress.toLowerCase() : trimmedAddress;

  return { chainId, address };
}

/** A stable key for grouping/deduplicating token identities by chain-aware equivalence. */
export function canonicalTokenIdentityKey(token: TokenIdentifier): string {
  const normalized = normalizeCanonicalTokenIdentifier(token);

  return `${normalized.chainId}:${normalized.address}`;
}

/** Whether two token identities refer to the same token under chain-aware identity semantics. */
export function tokenIdentitiesAreEquivalent(a: TokenIdentifier, b: TokenIdentifier): boolean {
  return canonicalTokenIdentityKey(a) === canonicalTokenIdentityKey(b);
}
