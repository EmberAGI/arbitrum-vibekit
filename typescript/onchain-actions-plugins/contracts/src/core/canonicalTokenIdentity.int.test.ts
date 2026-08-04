import { describe, expect, it } from 'vitest';

import {
  canonicalTokenIdentityKey,
  classifyTokenChainFamily,
  normalizeCanonicalTokenIdentifier,
  tokenIdentitiesAreEquivalent,
} from '@emberai/onchain-actions-contracts/core';

const EVM_CHAIN_ID = '42161';
const SOLANA_CHAIN_ID = 'solana';
const SOLANA_ADDRESS_MIXED_CASE = 'B62qkYzZ8vKxV3vNfoxjJExhKZ4t1qJyz9uWFxbY6Zw2';
const SOLANA_ADDRESS_LOWERCASED = SOLANA_ADDRESS_MIXED_CASE.toLowerCase();

describe('@emberai/onchain-actions-contracts/core chain-aware canonical token identity', () => {
  it('treats EVM address case variants on the same chain as equivalent', () => {
    const lower = { chainId: EVM_CHAIN_ID, address: '0xabc0000000000000000000000000000000000f' };
    const upper = { chainId: EVM_CHAIN_ID, address: '0xABC0000000000000000000000000000000000F' };

    expect(classifyTokenChainFamily(EVM_CHAIN_ID)).toBe('evm');
    expect(tokenIdentitiesAreEquivalent(lower, upper)).toBe(true);
    expect(canonicalTokenIdentityKey(lower)).toBe(canonicalTokenIdentityKey(upper));
  });

  it('treats case-distinct Solana Base58 addresses as distinct while identical ones remain equal', () => {
    const mixedCase = { chainId: SOLANA_CHAIN_ID, address: SOLANA_ADDRESS_MIXED_CASE };
    const lowerCased = { chainId: SOLANA_CHAIN_ID, address: SOLANA_ADDRESS_LOWERCASED };
    const mixedCaseAgain = { chainId: SOLANA_CHAIN_ID, address: SOLANA_ADDRESS_MIXED_CASE };

    expect(classifyTokenChainFamily(SOLANA_CHAIN_ID)).toBe('solana');
    expect(tokenIdentitiesAreEquivalent(mixedCase, lowerCased)).toBe(false);
    expect(tokenIdentitiesAreEquivalent(mixedCase, mixedCaseAgain)).toBe(true);
  });

  it('keeps identities on different chain ids distinct even with the same address', () => {
    const onArbitrum = {
      chainId: EVM_CHAIN_ID,
      address: '0xabc0000000000000000000000000000000000f',
    };
    const onOtherEvmChain = {
      chainId: '1',
      address: '0xabc0000000000000000000000000000000000f',
    };

    expect(tokenIdentitiesAreEquivalent(onArbitrum, onOtherEvmChain)).toBe(false);
  });

  it('never silently collapses case-distinct addresses for an unknown or unsupported chain family', () => {
    const opaqueChainId = 'unknown-chain-family';
    const mixedCase = { chainId: opaqueChainId, address: 'Case-Sensitive-ID' };
    const lowerCased = { chainId: opaqueChainId, address: 'case-sensitive-id' };

    expect(classifyTokenChainFamily(opaqueChainId)).toBe('opaque');
    expect(tokenIdentitiesAreEquivalent(mixedCase, lowerCased)).toBe(false);
    expect(normalizeCanonicalTokenIdentifier(mixedCase).address).toBe('Case-Sensitive-ID');
  });

  it('derives family from a self-describing CAIP-2 namespace without enumerating individual networks', () => {
    expect(classifyTokenChainFamily('eip155:42161')).toBe('evm');
    expect(classifyTokenChainFamily('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')).toBe('solana');
    expect(classifyTokenChainFamily('cosmos:cosmoshub-4')).toBe('opaque');
  });

  it('treats an invalid uppercase pseudo-CAIP-2 namespace as opaque exact-case rather than a valid CAIP-2 id', () => {
    expect(classifyTokenChainFamily('EIP155:42161')).toBe('opaque');
    expect(classifyTokenChainFamily('SOLANA:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')).toBe('opaque');

    const upper = { chainId: 'EIP155:42161', address: '0xABCDEF' };
    const upperOtherCase = { chainId: 'EIP155:42161', address: '0xabcdef' };

    expect(tokenIdentitiesAreEquivalent(upper, upperOtherCase)).toBe(false);
  });

  it('keys the (chainId, address) tuple unambiguously so distinct pairs never collide on a shared colon', () => {
    const evmChainIdWithColon = canonicalTokenIdentityKey({ chainId: 'eip155:1', address: '0xab' });
    const opaqueChainIdWithColonInAddress = canonicalTokenIdentityKey({
      chainId: 'eip155',
      address: '1:0xab',
    });

    expect(evmChainIdWithColon).not.toBe(opaqueChainIdWithColonInAddress);
  });

  it('validates through the public schema instead of letting a direct call bypass the non-empty invariant', () => {
    expect(() => canonicalTokenIdentityKey({ chainId: '', address: '0xabc' })).toThrow();
  });
});
