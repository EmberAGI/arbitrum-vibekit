import { getAddress, isAddress } from 'viem';
import { z } from 'zod';

import { TokenIdentifierSchema, type TokenIdentifier } from './tokenIdentifier.js';

// `.trim()` in a Zod schema is a transform: it silently rewrites the parsed
// value, so `.min(1)` after it checks the *trimmed* length and a caller
// passing ' 42161 ' would get back a validated '42161' rather than an error.
// The public contract requires the opposite: leading/trailing whitespace is
// invalid input, not a value to launder away. `nonWhitespacePadded` rejects
// (rather than rewrites) any string that isn't already its own trimmed form.
const nonWhitespacePadded = (value: string): boolean =>
  value.length > 0 && value === value.trim();

const trimmedNonEmptyString = z
  .string()
  .min(1)
  .refine(nonWhitespacePadded, 'must be non-empty and free of leading/trailing whitespace');

const INVALID_EVM_ADDRESS_MESSAGE =
  'evm token address must be a full 0x-prefixed 20-byte hexadecimal address, either ' +
  'all-lowercase or a validly checksummed EIP-55 address';

/**
 * `CanonicalTokenIdentifierV1Schema` is the single point where an evm
 * address is validated and normalized to its canonical EIP-55 checksum form
 * (see the module-level documentation on {@link normalizeCanonicalTokenIdentifier}).
 * This transform runs on every parse, so every public identity operation
 * that starts from the schema — directly or through
 * {@link normalizeCanonicalTokenIdentifier} — normalizes identically; there
 * is no second call site that could drift from this one.
 *
 * `.brand()` makes the output type nominal, not merely structural: a plain
 * `{ chainId, address }` object literal — however well-formed — does not
 * satisfy {@link CanonicalTokenIdentifierV1} by ordinary assignment. The only
 * way to produce a genuine value is to parse it through this schema, directly
 * or via {@link normalizeCanonicalTokenIdentifier}. This is what makes the
 * `TokenPriceReader` host-capability seam (`readTokenPrices(tokenUids:
 * readonly CanonicalTokenIdentifierV1[])`) unforgeable: a caller cannot hand
 * it raw, unvalidated `TokenIdentifier`-shaped input merely because the
 * fields line up.
 */
export const CanonicalTokenIdentifierV1Schema = TokenIdentifierSchema.extend({
  chainId: trimmedNonEmptyString,
  address: trimmedNonEmptyString,
})
  .strict()
  .transform((value, ctx) => {
    if (classifyTokenChainFamily(value.chainId) !== 'evm') {
      return value;
    }

    // `isAddress(..., { strict: true })` accepts a full 20-byte hex address
    // that is either all-lowercase or already a validly checksummed EIP-55
    // address, and rejects both malformed hex and a mixed-case address whose
    // casing does not match its real checksum. `getAddress` alone does not
    // reject a bad checksum — it silently re-checksums from the lowercase
    // form — so the explicit `isAddress` gate is what makes an invalid
    // mixed-case checksum a validation failure instead of a silent rewrite.
    if (!isAddress(value.address, { strict: true })) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: INVALID_EVM_ADDRESS_MESSAGE,
        path: ['address'],
      });
      return z.NEVER;
    }

    return { chainId: value.chainId, address: getAddress(value.address) };
  })
  .brand<'CanonicalTokenIdentifierV1'>();

export type CanonicalTokenIdentifierV1 = z.infer<typeof CanonicalTokenIdentifierV1Schema>;

/**
 * The address-family semantics a chain id resolves to. `evm` and `solana`
 * compare per their chain's own equivalence rule; `opaque` is any chain id
 * this classifier cannot derive a family for and never lowercases.
 */
export type TokenChainFamily = 'evm' | 'solana' | 'opaque';

const LEGACY_SOLANA_CHAIN_ID = 'solana';
const DECIMAL_CHAIN_ID_PATTERN = /^[0-9]+$/;
// CAIP-2 grammar (CAIP-2 §Syntax): `namespace:reference`, where
// `namespace` is `[-a-z0-9]{3,8}` and `reference` is `[-_a-zA-Z0-9]{1,32}`.
// Namespaces are syntactically lowercase-only, so an uppercase or mixed-case
// pseudo-CAIP-2 id such as `EIP155:1` is not a valid CAIP-2 identifier. A
// reference containing a colon, whitespace, or more than 32 characters is
// likewise not valid CAIP-2 syntax. Either defect must fall through to
// `opaque` instead of being derived into `evm`/`solana` semantics.
const CAIP2_CHAIN_ID_PATTERN = /^([-a-z0-9]{3,8}):([-_a-zA-Z0-9]{1,32})$/;

/**
 * Classifies a chain id into the address family that governs its identity
 * comparison. This is the sole authority for chain-family dispatch: legacy
 * decimal Ember chain ids and `eip155:*` CAIP-2 ids are `evm`, the legacy
 * `solana` literal and `solana:*` CAIP-2 ids are `solana`, and every other
 * chain id — including a syntactically invalid, non-lowercase, or malformed
 * pseudo-CAIP-2 id — is `opaque` and must never be silently lowercased.
 *
 * Validates `chainId` through the same non-empty/trimmed invariant enforced
 * by {@link CanonicalTokenIdentifierV1Schema} before dispatching on it, so a
 * caller cannot bypass that invariant by calling this function directly with
 * invalid (e.g. empty, all-whitespace, or leading/trailing-whitespace-padded)
 * input — it throws instead of silently trimming the value away.
 */
export function classifyTokenChainFamily(chainId: string): TokenChainFamily {
  const validated = trimmedNonEmptyString.parse(chainId);

  if (validated === LEGACY_SOLANA_CHAIN_ID) {
    return 'solana';
  }

  if (DECIMAL_CHAIN_ID_PATTERN.test(validated)) {
    return 'evm';
  }

  const namespace = CAIP2_CHAIN_ID_PATTERN.exec(validated)?.[1];

  if (namespace === 'eip155') {
    return 'evm';
  }

  if (namespace === LEGACY_SOLANA_CHAIN_ID) {
    return 'solana';
  }

  return 'opaque';
}

/**
 * Returns the canonical form of a token identity for its chain family: a
 * full evm address parses to its one deterministic EIP-55 checksum form
 * (accepting either legacy all-lowercase input or an already-checksummed
 * EIP-55 address, and rejecting an invalid mixed-case checksum), while
 * solana and opaque addresses preserve their exact case. EIP-55 — not
 * lowercase — is the sole canonical evm domain representation: there is no
 * second, lowercase-keyed convention anywhere behind this Interface.
 * Lowercase remains valid only as ingress a caller may submit, never as
 * canonical output.
 *
 * Delegates entirely to {@link CanonicalTokenIdentifierV1Schema}, which owns
 * both the non-empty/trimmed invariant and the evm address-format/checksum
 * invariant, so a caller cannot bypass either one by calling this helper
 * directly with an invalid chain id or address. {@link canonicalTokenIdentityKey}
 * and {@link tokenIdentitiesAreEquivalent} delegate here for the same reason;
 * {@link classifyTokenChainFamily} enforces the identical chain-id invariant
 * independently, since it is itself a public entry point a caller can invoke
 * directly.
 */
export function normalizeCanonicalTokenIdentifier(
  token: TokenIdentifier,
): CanonicalTokenIdentifierV1 {
  return CanonicalTokenIdentifierV1Schema.parse(token);
}

/**
 * A stable key for grouping/deduplicating token identities by chain-aware
 * equivalence. Both `chainId` and `address` may themselves contain `:`
 * (arbitrary V1 chain ids and CAIP-2 ids both can), so a bare
 * `${chainId}:${address}` concatenation is ambiguous — `(eip155:1, 0xab)` and
 * `(eip155, 1:0xab)` would collide. `JSON.stringify` on the fixed-arity pair
 * escapes both fields, so an ambiguous key cannot arise from that collision.
 */
export function canonicalTokenIdentityKey(token: TokenIdentifier): string {
  const normalized = normalizeCanonicalTokenIdentifier(token);

  return JSON.stringify([normalized.chainId, normalized.address]);
}

/** Whether two token identities refer to the same token under chain-aware identity semantics. */
export function tokenIdentitiesAreEquivalent(a: TokenIdentifier, b: TokenIdentifier): boolean {
  return canonicalTokenIdentityKey(a) === canonicalTokenIdentityKey(b);
}
