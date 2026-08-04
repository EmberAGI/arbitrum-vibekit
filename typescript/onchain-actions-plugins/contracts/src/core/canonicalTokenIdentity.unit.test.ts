import { describe, expect, it } from 'vitest';

import {
  CanonicalTokenIdentifierV1Schema,
  canonicalTokenIdentityKey,
  classifyTokenChainFamily,
  normalizeCanonicalTokenIdentifier,
  tokenIdentitiesAreEquivalent,
} from './canonicalTokenIdentity.js';
import {
  EVM_ADDRESS_CHECKSUMMED,
  EVM_ADDRESS_INVALID_CHECKSUM,
  EVM_ADDRESS_LOWERCASE,
  EVM_ZERO_ADDRESS,
} from './canonicalTokenIdentity.testFixtures.js';

describe('classifyTokenChainFamily', () => {
  it('classifies legacy decimal Ember chain ids as evm', () => {
    expect(classifyTokenChainFamily('1')).toBe('evm');
    expect(classifyTokenChainFamily('42161')).toBe('evm');
  });

  it('classifies the legacy solana literal as solana', () => {
    expect(classifyTokenChainFamily('solana')).toBe('solana');
  });

  it('rejects whitespace-padded or empty chain ids instead of silently trimming them', () => {
    // classifyTokenChainFamily is itself a public identity operation: it must
    // enforce the same non-empty/trimmed invariant as every other exported
    // function in this module rather than laundering invalid input through
    // an internal `.trim()` before dispatch.
    expect(() => classifyTokenChainFamily('  42161  ')).toThrow();
    expect(() => classifyTokenChainFamily('  solana  ')).toThrow();
    expect(() => classifyTokenChainFamily('')).toThrow();
    expect(() => classifyTokenChainFamily('   ')).toThrow();
  });

  it('requires a syntactically valid lowercase CAIP-2 namespace and treats uppercase pseudo-CAIP-2 ids as opaque', () => {
    expect(classifyTokenChainFamily('EIP155:42161')).toBe('opaque');
    expect(classifyTokenChainFamily('Solana:mainnet-beta')).toBe('opaque');
    expect(classifyTokenChainFamily('eip155:42161')).toBe('evm');
    expect(classifyTokenChainFamily('solana:mainnet-beta')).toBe('solana');
  });

  it('treats an unknown CAIP-2 namespace as opaque without collapsing case', () => {
    expect(classifyTokenChainFamily('cosmos:cosmoshub-4')).toBe('opaque');
    expect(classifyTokenChainFamily('bip122:000000000019d6689c085ae165831e93')).toBe('opaque');
  });

  it('treats a non-decimal, non-CAIP-2 identifier as opaque', () => {
    expect(classifyTokenChainFamily('mainnet')).toBe('opaque');
    expect(classifyTokenChainFamily('eip155')).toBe('opaque');
  });

  it('treats a syntactically malformed CAIP-2 reference as opaque rather than deriving evm/solana semantics', () => {
    // CAIP-2 reference grammar is `[-_a-zA-Z0-9]{1,32}`. A reference with an
    // embedded colon, whitespace, or more than 32 characters is not a valid
    // CAIP-2 id and must fall through to `opaque`, not `evm`/`solana`.
    expect(classifyTokenChainFamily('eip155:1:extra')).toBe('opaque');
    expect(classifyTokenChainFamily('eip155:has space')).toBe('opaque');
    expect(classifyTokenChainFamily('solana:' + 'a'.repeat(33))).toBe('opaque');
    expect(classifyTokenChainFamily('eip155:')).toBe('opaque');
  });
});

describe('normalizeCanonicalTokenIdentifier', () => {
  it('normalizes a lowercase evm address to its EIP-55 checksum form', () => {
    expect(
      normalizeCanonicalTokenIdentifier({ chainId: '42161', address: EVM_ADDRESS_LOWERCASE }),
    ).toEqual({
      chainId: '42161',
      address: EVM_ADDRESS_CHECKSUMMED,
    });
  });

  it('preserves an already-checksummed EIP-55 evm address exactly', () => {
    expect(
      normalizeCanonicalTokenIdentifier({ chainId: '42161', address: EVM_ADDRESS_CHECKSUMMED }),
    ).toEqual({
      chainId: '42161',
      address: EVM_ADDRESS_CHECKSUMMED,
    });
  });

  it('rejects an evm address with an invalid mixed-case checksum instead of silently correcting it', () => {
    expect(() =>
      normalizeCanonicalTokenIdentifier({ chainId: '42161', address: EVM_ADDRESS_INVALID_CHECKSUM }),
    ).toThrow();
  });

  it('rejects an evm address that is not a full 20-byte hexadecimal address', () => {
    expect(() =>
      normalizeCanonicalTokenIdentifier({ chainId: '42161', address: '0xABCDEF' }),
    ).toThrow();
    expect(() =>
      normalizeCanonicalTokenIdentifier({ chainId: '42161', address: 'not-an-address' }),
    ).toThrow();
  });

  it('preserves address case for solana identities', () => {
    expect(
      normalizeCanonicalTokenIdentifier({ chainId: 'solana', address: 'MixedCaseAddress' }),
    ).toEqual({ chainId: 'solana', address: 'MixedCaseAddress' });
  });

  it('preserves address case for opaque chain families', () => {
    expect(
      normalizeCanonicalTokenIdentifier({
        chainId: 'cosmos:cosmoshub-4',
        address: 'MixedCaseAddress',
      }),
    ).toEqual({ chainId: 'cosmos:cosmoshub-4', address: 'MixedCaseAddress' });
  });

  it('rejects untrimmed chainId/address instead of silently trimming them away', () => {
    expect(() =>
      normalizeCanonicalTokenIdentifier({ chainId: ' 42161 ', address: '0xabcdef' }),
    ).toThrow();
    expect(() =>
      normalizeCanonicalTokenIdentifier({ chainId: '42161', address: ' 0xabcdef ' }),
    ).toThrow();
  });
});

describe('canonicalTokenIdentityKey', () => {
  it('combines the chain id and normalized (EIP-55 checksummed) address as an unambiguous tuple', () => {
    expect(canonicalTokenIdentityKey({ chainId: '42161', address: EVM_ADDRESS_LOWERCASE })).toBe(
      JSON.stringify(['42161', EVM_ADDRESS_CHECKSUMMED]),
    );
  });

  it('keeps opaque-family keys exact-case so distinct casings never collide', () => {
    expect(canonicalTokenIdentityKey({ chainId: 'unknown', address: 'AbC' })).not.toBe(
      canonicalTokenIdentityKey({ chainId: 'unknown', address: 'abc' }),
    );
  });

  it('encodes the (chainId, address) tuple unambiguously so delimiter concatenation cannot collide', () => {
    // Naive `${chainId}:${address}` concatenation collides here: both keys
    // would serialize to the literal string
    // `eip155:1:${EVM_ADDRESS_LOWERCASE}`.
    const evmChainIdWithColon = canonicalTokenIdentityKey({
      chainId: 'eip155:1',
      address: EVM_ADDRESS_LOWERCASE,
    });
    const opaqueChainIdWithColonInAddress = canonicalTokenIdentityKey({
      chainId: 'eip155',
      address: `1:${EVM_ADDRESS_LOWERCASE}`,
    });

    expect(evmChainIdWithColon).not.toBe(opaqueChainIdWithColonInAddress);
  });

  it('validates through the public schema so a caller cannot bypass the non-empty/trimmed invariant', () => {
    expect(() => canonicalTokenIdentityKey({ chainId: '', address: '0xabc' })).toThrow();
    expect(() => canonicalTokenIdentityKey({ chainId: '   ', address: '0xabc' })).toThrow();
    expect(() => canonicalTokenIdentityKey({ chainId: '42161', address: '' })).toThrow();
  });

  it('rejects untrimmed chainId/address instead of silently trimming them away', () => {
    // A transforming `.trim()` in the schema would silently accept these and
    // fold ' 42161 ' into '42161' — the public schema must reject leading or
    // trailing whitespace as invalid input, not launder it into a valid key.
    expect(() =>
      canonicalTokenIdentityKey({ chainId: ' 42161 ', address: '0xabcdef' }),
    ).toThrow();
    expect(() =>
      canonicalTokenIdentityKey({ chainId: '42161', address: ' 0xabcdef ' }),
    ).toThrow();
    expect(() =>
      canonicalTokenIdentityKey({ chainId: '42161', address: '0xabcdef\t' }),
    ).toThrow();
  });
});

describe('tokenIdentitiesAreEquivalent', () => {
  it('rejects an invalid empty identity instead of silently treating it as equivalent', () => {
    expect(() =>
      tokenIdentitiesAreEquivalent({ chainId: '', address: '0xabc' }, { chainId: '', address: '0xabc' }),
    ).toThrow();
  });

  it('treats a lowercase and its EIP-55 checksummed form as the same evm identity after canonicalization', () => {
    expect(
      tokenIdentitiesAreEquivalent(
        { chainId: '42161', address: EVM_ADDRESS_LOWERCASE },
        { chainId: '42161', address: EVM_ADDRESS_CHECKSUMMED },
      ),
    ).toBe(true);
  });

  it('preserves the existing V1 zero-address convention for a native-token evm identity', () => {
    // Zero/near-zero placeholder addresses contain no letters, so EIP-55
    // checksumming is a no-op for them -- they must still parse and compare
    // exactly as before under the new stricter format/checksum validation.
    expect(
      normalizeCanonicalTokenIdentifier({ chainId: '42161', address: EVM_ZERO_ADDRESS }),
    ).toEqual({
      chainId: '42161',
      address: EVM_ZERO_ADDRESS,
    });
    expect(
      tokenIdentitiesAreEquivalent(
        { chainId: '42161', address: EVM_ZERO_ADDRESS },
        { chainId: '42161', address: EVM_ZERO_ADDRESS },
      ),
    ).toBe(true);
  });
});

describe('CanonicalTokenIdentifierV1Schema', () => {
  it('is the single validation point every public identity operation runs through -- a direct parse rejects the same invalid mixed-case checksum', () => {
    const result = CanonicalTokenIdentifierV1Schema.safeParse({
      chainId: '42161',
      address: EVM_ADDRESS_INVALID_CHECKSUM,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['address']);
    }
  });

  it('normalizes a valid evm address to EIP-55 on direct parse', () => {
    expect(
      CanonicalTokenIdentifierV1Schema.parse({ chainId: '42161', address: EVM_ADDRESS_LOWERCASE }),
    ).toEqual({ chainId: '42161', address: EVM_ADDRESS_CHECKSUMMED });
  });
});
