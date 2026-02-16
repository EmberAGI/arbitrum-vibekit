import { describe, expect, it } from 'vitest';
import { arbitrum, mainnet } from 'viem/chains';

import { defaultEvmChain, getEvmChainOrDefault, getSupportedEvmChain } from './evmChains';

describe('evmChains config', () => {
  it('resolves supported chains and returns null for unsupported ids', () => {
    expect(getSupportedEvmChain(arbitrum.id)?.id).toBe(arbitrum.id);
    expect(getSupportedEvmChain(999999)).toBeNull();
  });

  it('falls back to default chain for null and unsupported chain ids', () => {
    expect(defaultEvmChain.id).toBe(arbitrum.id);
    expect(getEvmChainOrDefault(null).id).toBe(arbitrum.id);
    expect(getEvmChainOrDefault(undefined).id).toBe(arbitrum.id);
    expect(getEvmChainOrDefault(999999).id).toBe(arbitrum.id);
    expect(getEvmChainOrDefault(mainnet.id).id).toBe(mainnet.id);
  });
});
