import { describe, expect, it } from 'vitest';

import {
  collectUniqueChainNames,
  collectUniqueTokenSymbols,
  mergeUniqueStrings,
  normalizeStringList,
} from './agentCollections';
import { canonicalizeChainLabel } from './iconResolution';

describe('agentCollections', () => {
  it('normalizes unknown values into string arrays', () => {
    expect(normalizeStringList(undefined)).toEqual([]);
    expect(normalizeStringList('USDC')).toEqual(['USDC']);
    expect(normalizeStringList(['USDC', 42, 'ARB'])).toEqual(['USDC', 'ARB']);
  });

  it('merges unique strings in stable order after mapping', () => {
    const result = mergeUniqueStrings({
      primary: ['Arbitrum One', ''],
      secondary: ['arbitrum', '  Arbitrum  ', 'Arbitrum One'],
      mapFn: canonicalizeChainLabel,
      keyFn: (value) => canonicalizeChainLabel(value).toLowerCase(),
    });

    expect(result).toEqual(['Arbitrum']);
  });

  it('collects unique chain names across groups with canonicalization', () => {
    const result = collectUniqueChainNames({
      groups: [
        { chains: ['Arbitrum One', 'Arbitrum'] },
        { chains: ['Arbitrum', 'Optimism'] },
      ],
      mapFn: canonicalizeChainLabel,
    });

    expect(result).toEqual(['Arbitrum', 'Optimism']);
  });

  it('collects unique token symbols with protocol fallbacks', () => {
    const result = collectUniqueTokenSymbols({
      groups: [
        { tokens: ['usdc', 'WETH'], protocols: ['Camelot'] },
        { tokens: ['USDC', 'arb'], protocols: ['Pendle'] },
      ],
      protocolTokenFallback: {
        Camelot: 'GRAIL',
        Pendle: 'PENDLE',
      },
    });

    expect(result).toEqual(['USDC', 'WETH', 'GRAIL', 'ARB', 'PENDLE']);
  });
});
