import { z } from 'zod';
import { Tool } from '@modelcontextprotocol/sdk';
import { Agent } from './agent.js';

// Schema for GMX market information
const MarketInfoSchema = z.object({
  marketAddress: z.string().describe('The address of the GMX market'),
  marketName: z.string().describe('The name of the market (e.g., ETH/USD)'),
  indexToken: z.object({
    address: z.string().describe('The address of the index token'),
    symbol: z.string().describe('The symbol of the index token (e.g., ETH)'),
    decimals: z.number().describe('The number of decimals for the index token'),
  }),
  longToken: z.object({
    address: z.string().describe('The address of the long token'),
    symbol: z.string().describe('The symbol of the long token (e.g., ETH)'),
    decimals: z.number().describe('The number of decimals for the long token'),
  }),
  shortToken: z.object({
    address: z.string().describe('The address of the short token'),
    symbol: z.string().describe('The symbol of the short token (e.g., USDC)'),
    decimals: z.number().describe('The number of decimals for the short token'),
  }),
});

// Schema for position information
const PositionInfoSchema = z.object({
  account: z.string().describe('The account address for the position'),
  market: z.string().describe('The market name (e.g., ETH/USD)'),
  marketAddress: z.string().describe('The market address'),
  side: z.enum(['LONG', 'SHORT']).describe('Position side (LONG or SHORT)'),
  size: z.string().describe('Position size in USD'),
  collateral: z.string().describe('Collateral amount'),
  leverage: z.string().describe('Current leverage'),
  entryPrice: z.string().describe('Entry price'),
  markPrice: z.string().describe('Current mark price'),
  liquidationPrice: z.string().describe('Liquidation price'),
  pnl: z.string().describe('Current PnL (Profit and Loss)'),
  pnlPercentage: z.string().describe('PnL as a percentage'),
});

// Schema for creating a position
const CreatePositionSchema = z.object({
  marketAddress: z.string().describe('The market address to create a position in'),
  side: z.enum(['LONG', 'SHORT']).describe('Position side (LONG or SHORT)'),
  collateralTokenAddress: z.string().describe('The address of the collateral token'),
  collateralAmount: z.string().describe('The amount of collateral to use'),
  leverage: z.number().describe('The leverage to use for the position'),
  slippage: z.number().optional().describe('Allowed slippage in basis points (50 = 0.5%)'),
});

// Schema for decreasing a position
const DecreasePositionSchema = z.object({
  marketAddress: z.string().describe('The market address of the position to decrease'),
  collateralTokenAddress: z.string().describe('The address of the collateral token'),
  collateralAmount: z.string().describe('The amount of collateral to withdraw'),
  isClosePosition: z.boolean().describe('Whether to completely close the position'),
  slippage: z.number().optional().describe('Allowed slippage in basis points (50 = 0.5%)'),
});

/**
 * Set up GMX tool handlers for MCP
 */
export function setupGmxToolHandlers(agent: Agent): Tool[] {
  return [
    // Get market information
    {
      name: 'getGmxMarkets',
      description: 'Get information about available GMX markets',
      parameters: z.object({}),
      handler: async () => {
        try {
          const marketInfo = await agent.getMarketInfo();
          if (!marketInfo.success) {
            return {
              error: true,
              message: marketInfo.message || 'Failed to fetch GMX market information',
            };
          }

          return {
            success: true,
            marketCount: marketInfo.marketCount,
            markets: marketInfo.markets.map((market: any) => ({
              marketAddress: market.marketAddress,
              marketName: market.marketInfo?.indexToken?.symbol 
                ? `${market.marketInfo.indexToken.symbol}/USD` 
                : 'Unknown Market',
              indexToken: {
                address: market.marketInfo?.indexToken?.address || '',
                symbol: market.marketInfo?.indexToken?.symbol || '',
                decimals: market.marketInfo?.indexToken?.decimals || 18,
              },
              longToken: {
                address: market.marketInfo?.longToken?.address || '',
                symbol: market.marketInfo?.longToken?.symbol || '',
                decimals: market.marketInfo?.longToken?.decimals || 18,
              },
              shortToken: {
                address: market.marketInfo?.shortToken?.address || '',
                symbol: market.marketInfo?.shortToken?.symbol || '',
                decimals: market.marketInfo?.shortToken?.decimals || 6,
              },
            })),
          };
        } catch (error) {
          console.error('Error in getGmxMarkets:', error);
          return {
            error: true,
            message: error instanceof Error ? error.message : 'Unknown error fetching GMX markets',
          };
        }
      },
    },

    // Get position information
    {
      name: 'getGmxPositions',
      description: 'Get information about GMX positions for a specific account',
      parameters: z.object({
        account: z.string().describe('Wallet address to get position information for'),
      }),
      handler: async (params: { account: string }) => {
        try {
          if (!params.account || !params.account.startsWith('0x')) {
            return {
              error: true,
              message: 'Invalid wallet address. Please provide a valid Ethereum address starting with 0x',
            };
          }

          const positionInfo = await agent.getPositionInfo(params.account);
          if (!positionInfo.success) {
            return {
              error: true,
              message: positionInfo.message || 'Failed to fetch position information',
            };
          }

          return {
            success: true,
            positionCount: positionInfo.positions?.length || 0,
            positions: positionInfo.positions || [],
          };
        } catch (error) {
          console.error('Error in getGmxPositions:', error);
          return {
            error: true,
            message: error instanceof Error ? error.message : 'Unknown error fetching GMX positions',
          };
        }
      },
    },

    // Create a new position
    {
      name: 'createGmxPosition',
      description: 'Create a new GMX position (long or short)',
      parameters: CreatePositionSchema,
      handler: async (params: {
        marketAddress: string;
        side: 'LONG' | 'SHORT';
        collateralTokenAddress: string;
        collateralAmount: string;
        leverage: number;
        slippage?: number;
      }) => {
        try {
          if (!params.marketAddress || !params.collateralTokenAddress || !params.collateralAmount) {
            return {
              error: true,
              message: 'Missing required parameters for creating a position',
            };
          }

          // Get market info first to validate the market exists
          const marketInfo = await agent.getMarketInfo();
          if (!marketInfo.success) {
            return {
              error: true,
              message: 'Failed to fetch market information',
            };
          }

          // Find the requested market
          const market = marketInfo.markets.find((m: any) => m.marketAddress === params.marketAddress);
          if (!market) {
            return {
              error: true,
              message: 'Market not found with the provided address',
            };
          }

          // Create the position
          const result = await agent.createIncreasePosition({
            marketAddress: params.marketAddress,
            collateralTokenAddress: params.collateralTokenAddress,
            collateralAmount: params.collateralAmount,
            leverage: params.leverage || 1,
            slippage: params.slippage || 50,
            isLong: params.side === 'LONG',
            rawMarketData: market.rawMarketData,
            fullMarketInfo: market,
          });

          if (!result.success) {
            return {
              error: true,
              message: result.error || 'Failed to create position',
            };
          }

          return {
            success: true,
            orderType: 'INCREASE',
            side: params.side,
            marketAddress: params.marketAddress,
            marketName: market.marketInfo?.indexToken?.symbol 
              ? `${market.marketInfo.indexToken.symbol}/USD` 
              : 'Unknown Market',
            collateralAmount: params.collateralAmount,
            leverage: params.leverage,
            orderDetails: result.orderDetails || {},
          };
        } catch (error) {
          console.error('Error in createGmxPosition:', error);
          return {
            error: true,
            message: error instanceof Error ? error.message : 'Unknown error creating GMX position',
          };
        }
      },
    },

    // Decrease or close a position
    {
      name: 'decreaseGmxPosition',
      description: 'Decrease or close an existing GMX position',
      parameters: DecreasePositionSchema,
      handler: async (params: {
        marketAddress: string;
        collateralTokenAddress: string;
        collateralAmount: string;
        isClosePosition: boolean;
        slippage?: number;
      }) => {
        try {
          if (!params.marketAddress || !params.collateralTokenAddress) {
            return {
              error: true,
              message: 'Missing required parameters for decreasing a position',
            };
          }

          // Get market info to validate the market exists
          const marketInfo = await agent.getMarketInfo();
          if (!marketInfo.success) {
            return {
              error: true,
              message: 'Failed to fetch market information',
            };
          }

          // Find the requested market
          const market = marketInfo.markets.find((m: any) => m.marketAddress === params.marketAddress);
          if (!market) {
            return {
              error: true,
              message: 'Market not found with the provided address',
            };
          }

          // Create the decrease position request
          const result = await agent.createDecreasePosition({
            marketAddress: params.marketAddress,
            collateralTokenAddress: params.collateralTokenAddress,
            collateralAmount: params.collateralAmount,
            isClosePosition: !!params.isClosePosition,
            slippage: params.slippage || 50,
            rawMarketData: market.rawMarketData,
            fullMarketInfo: market,
          });

          if (!result.success) {
            return {
              error: true,
              message: result.error || 'Failed to decrease position',
            };
          }

          return {
            success: true,
            orderType: 'DECREASE',
            isClosePosition: !!params.isClosePosition,
            marketAddress: params.marketAddress,
            marketName: market.marketInfo?.indexToken?.symbol 
              ? `${market.marketInfo.indexToken.symbol}/USD` 
              : 'Unknown Market',
            collateralAmount: params.collateralAmount,
            orderDetails: result.orderDetails || {},
          };
        } catch (error) {
          console.error('Error in decreaseGmxPosition:', error);
          return {
            error: true,
            message: error instanceof Error ? error.message : 'Unknown error decreasing GMX position',
          };
        }
      },
    },
  ];
} 