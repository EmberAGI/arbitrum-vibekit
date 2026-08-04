import { describe, expect, it } from 'vitest';

import {
  canonicalTokenIdentityKey,
  classifyTokenChainFamily,
  normalizeCanonicalTokenIdentifier,
} from './canonicalTokenIdentity.js';

describe('classifyTokenChainFamily', () => {
  it('classifies legacy decimal Ember chain ids as evm', () => {
    expect(classifyTokenChainFamily('1')).toBe('evm');
    expect(classifyTokenChainFamily('42161')).toBe('evm');
  });

  it('classifies the legacy solana literal as solana', () => {
    expect(classifyTokenChainFamily('solana')).toBe('solana');
  });

  it('trims surrounding whitespace before classifying', () => {
    expect(classifyTokenChainFamily('  42161  ')).toBe('evm');
    expect(classifyTokenChainFamily('  solana  ')).toBe('solana');
  });

  it('is case-insensitive on the CAIP-2 namespace', () => {
    expect(classifyTokenChainFamily('EIP155:42161')).toBe('evm');
    expect(classifyTokenChainFamily('Solana:mainnet-beta')).toBe('solana');
  });

  it('treats an unknown CAIP-2 namespace as opaque without collapsing case', () => {
    expect(classifyTokenChainFamily('cosmos:cosmoshub-4')).toBe('opaque');
    expect(classifyTokenChainFamily('bip122:000000000019d6689c085ae165831e93')).toBe('opaque');
  });

  it('treats a non-decimal, non-CAIP-2 identifier as opaque', () => {
    expect(classifyTokenChainFamily('mainnet')).toBe('opaque');
    expect(classifyTokenChainFamily('eip155')).toBe('opaque');
    expect(classifyTokenChainFamily('')).toBe('opaque');
  });
});

describe('normalizeCanonicalTokenIdentifier', () => {
  it('lowercases only the address for evm identities', () => {
    expect(normalizeCanonicalTokenIdentifier({ chainId: '42161', address: '0xABCDEF' })).toEqual({
      chainId: '42161',
      address: '0xabcdef',
    });
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
});

describe('canonicalTokenIdentityKey', () => {
  it('combines the trimmed chain id and normalized address', () => {
    expect(canonicalTokenIdentityKey({ chainId: ' 42161 ', address: ' 0xABCDEF ' })).toBe(
      '42161:0xabcdef',
    );
  });

  it('keeps opaque-family keys exact-case so distinct casings never collide', () => {
    expect(canonicalTokenIdentityKey({ chainId: 'unknown', address: 'AbC' })).not.toBe(
      canonicalTokenIdentityKey({ chainId: 'unknown', address: 'abc' }),
    );
  });
});
