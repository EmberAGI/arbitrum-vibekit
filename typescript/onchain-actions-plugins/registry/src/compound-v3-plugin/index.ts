import { 
  type ActionDefinition, 
  type EmberPlugin, 
  type LendingActions, 
  type SupplyTokensRequest, 
  type SupplyTokensResponse, 
  type WithdrawTokensRequest, 
  type WithdrawTokensResponse,
  type ChainConfig,
  PublicEmberPluginRegistry
} from '../index.js';

const COMP_V3_USDC_COMET = '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf';

export function getCompoundV3EmberPlugin(): EmberPlugin<'lending'> {
  return {
    id: 'compound-v3-arbitrum',
    type: 'lending',
    name: 'Compound v3 (Arbitrum)',
    description: 'Protocol integration for Compound v3 USDC market on Arbitrum.',
    website: 'https://compound.finance',
    x: 'https://x.com/compoundfinance',
    actions: [
      {
        id: 'lending-supply',
        name: 'Supply',
        description: 'Supply assets to Compound v3',
        inputTokens: async () => Promise.resolve([{ chainId: '42161', tokens: [] }]), // Simplified for now
        outputTokens: async () => Promise.resolve([{ chainId: '42161', tokens: [] }]),
        callback: async (req: SupplyTokensRequest): Promise<SupplyTokensResponse> => {
          const selector = 'f2b9fdb8';
          const cleanAsset = req.supplyToken.address.replace('0x', '').toLowerCase().padStart(64, '0');
          const amountHex = req.amount.toString(16).padStart(64, '0');
          const data = `0x${selector}${cleanAsset}${amountHex}`;

          return {
            transactions: [
              {
                to: COMP_V3_USDC_COMET,
                data,
                value: '0',
                description: `Supply ${req.amount.toString()} of ${req.supplyToken.symbol} to Compound v3`,
              },
            ],
          };
        },
      },
      {
        id: 'lending-withdraw',
        name: 'Withdraw',
        description: 'Withdraw assets from Compound v3',
        inputTokens: async () => Promise.resolve([{ chainId: '42161', tokens: [] }]),
        outputTokens: async () => Promise.resolve([{ chainId: '42161', tokens: [] }]),
        callback: async (req: WithdrawTokensRequest): Promise<WithdrawTokensResponse> => {
          const selector = 'f3fef3a3';
          const cleanAsset = req.tokenToWithdraw.address.replace('0x', '').toLowerCase().padStart(64, '0');
          const amountHex = req.amount.toString(16).padStart(64, '0');
          const data = `0x${selector}${cleanAsset}${amountHex}`;

          return {
            transactions: [
              {
                to: COMP_V3_USDC_COMET,
                data,
                value: '0',
                description: `Withdraw ${req.amount.toString()} of ${req.tokenToWithdraw.symbol} from Compound v3`,
              },
            ],
          };
        },
      },
    ],
    queries: {
      getPositions: async () => {
        // Placeholder for position fetching logic
        return {
          userReserves: [],
          totalLiquidityUsd: '0',
          totalCollateralUsd: '0',
          totalBorrowsUsd: '0',
          netWorthUsd: '0',
          availableBorrowsUsd: '0',
          currentLoanToValue: '0',
          currentLiquidationThreshold: '0',
          healthFactor: '0',
        };
      },
    },
  };
}

export function registerCompoundV3(chainConfig: ChainConfig, registry: PublicEmberPluginRegistry) {
  if (chainConfig.chainId !== 42161) return;
  registry.registerPlugin(getCompoundV3EmberPlugin());
}
