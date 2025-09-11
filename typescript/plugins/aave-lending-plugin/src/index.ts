import type { ActionDefinition, EmberPlugin, LendingActions } from 'plugins/core/dist/index.js';
import { AAVEAdapter, type AAVEAdapterParams } from './adapter.js';

/**
 * Get the AAVE Ember plugin.
 * @param params - Configuration parameters for the AAVEAdapter, including chainId and rpcUrl.
 * @returns The AAVE Ember plugin.
 */
export async function getAaveEmberPlugin(
  params: AAVEAdapterParams
): Promise<EmberPlugin<'lending'>> {
  const adapter = new AAVEAdapter(params);

  return {
    id: `AAVE_CHAIN_${params.chainId}`,
    type: 'lending',
    name: `AAVE lending for ${params.chainId}`,
    description: 'Aave V3 lending protocol',
    website: 'https://aave.com',
    x: 'https://x.com/aave',
    actions: await getAaveActions(adapter),
    queries: {
      getPositions: adapter.getUserSummary.bind(adapter),
    },
  };
}

/**
 * Get the AAVE actions for the lending protocol.
 * @param adapter - An instance of AAVEAdapter to interact with the AAVE protocol.
 * @returns An array of action definitions for the AAVE lending protocol.
 */
export async function getAaveActions(
  adapter: AAVEAdapter
): Promise<ActionDefinition<LendingActions>[]> {
  const reservesResponse = await adapter.getReserves();

  const underlyingAssets: string[] = reservesResponse.reservesData.map(
    reserve => reserve.underlyingAsset
  );
  const aTokens: string[] = reservesResponse.reservesData.map(reserve => reserve.aTokenAddress);
  const borrowableAssets = reservesResponse.reservesData
    .filter(reserve => reserve.borrowingEnabled)
    .map(reserve => reserve.underlyingAsset);

  return [
    // Supply any of the underlying assets to get aTokens
    {
      type: 'lending-supply',
      name: `AAVE lending pools in chain ${adapter.chain.id}`,
      inputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: underlyingAssets,
          },
        ]),
      outputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: aTokens,
          },
        ]),
      callback: adapter.createSupplyTransaction.bind(adapter),
    },

    // Borrow any of the borrowable assets if you have some alpha tokens as collateral
    {
      type: 'lending-borrow',
      name: `AAVE borrow in chain ${adapter.chain.id}`,
      inputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: aTokens,
          },
        ]),
      outputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: borrowableAssets,
          },
        ]),
      callback: adapter.createBorrowTransaction.bind(adapter),
    },

    // Repay your borrow with the underlying asset
    {
      type: 'lending-repay',
      name: `AAVE repay in chain ${adapter.chain.id}`,
      inputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: borrowableAssets,
          },
        ]),
      // Empty output tokens as this doesn't generate any token
      outputTokens: async () => Promise.resolve([]),
      callback: adapter.createRepayTransaction.bind(adapter),
    },

    // Repay your borrow with aTokens
    {
      type: 'lending-repay',
      name: `AAVE repay with aTokens in chain ${adapter.chain.id}`,
      inputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: aTokens,
          },
        ]),
      // Empty output tokens as this doesn't generate any token
      outputTokens: async () => Promise.resolve([]),
      callback: adapter.createRepayTransactionWithATokens.bind(adapter),
    },

    // Withdraw from your aTokens to get the underlying asset back
    {
      type: 'lending-withdraw',
      name: `AAVE withdraw in chain ${adapter.chain.id}`,
      inputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: aTokens,
          },
        ]),
      outputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: underlyingAssets,
          },
        ]),
      callback: adapter.createWithdrawTransaction.bind(adapter),
    },
  ];
}

// Re-export type
export type { AAVEAdapterParams };
