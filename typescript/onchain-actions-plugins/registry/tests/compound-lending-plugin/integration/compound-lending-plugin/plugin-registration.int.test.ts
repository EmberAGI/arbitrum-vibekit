import { describe, it, expect } from 'vitest';
import { getCompoundEmberPlugin } from '../../../../src/compound-lending-plugin/index.js';

describe('Plugin Integration', () => {
  it('should register plugin correctly', () => {
    const plugin = getCompoundEmberPlugin({
      chainId: 42161,
      rpcUrl: 'test',
      marketId: 'USDC',
    });

    expect(plugin.type).toBe('lending');
    expect(plugin.actions).toHaveLength(0);
  });
});
