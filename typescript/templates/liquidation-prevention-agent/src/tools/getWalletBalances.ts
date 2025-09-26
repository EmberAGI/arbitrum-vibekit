/**
 * getWalletBalances Tool
 * 
 * Fetches wallet token balances for tokens that have supply or borrow positions
 * by calling token contracts directly since getWalletBalances is not available in emberClient.
 */

import { createSuccessTask, createErrorTask, type VibkitToolDefinition, parseMcpToolResponsePayload } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import { GetWalletLendingPositionsResponseSchema } from 'ember-schemas';
import { MinimalErc20Abi, TokenBalance, ChainConfig, type LiquidationPreventionContext } from '../context/types.js';
import {
  createPublicClient,
  http,
  formatUnits,
  type Address,
} from 'viem';
import { arbitrum } from 'viem/chains';

// ChainConfig interface is imported from '../context/types.js'


async function fetchTokenPrices(tokenAddresses: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};

  for (const addr of tokenAddresses) {
    const lowerAddr = addr.toLowerCase();
    const url = `https://api.coingecko.com/api/v3/simple/token_price/arbitrum-one?contract_addresses=${lowerAddr}&vs_currencies=usd`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`⚠️ Failed to fetch price for ${lowerAddr}: ${response.status} ${response.statusText}`);
        continue;
      }

      const data = await response.json() as Record<string, { usd: number }>;
      if (data[lowerAddr] && typeof data[lowerAddr].usd === 'number') {
        prices[lowerAddr] = data[lowerAddr].usd;
        console.log(`✅ Price fetched for ${lowerAddr}: $${data[lowerAddr].usd}`);
      } else {
        console.warn(`⚠️ No USD price in response for ${lowerAddr}`);
      }

    } catch (err) {
      console.error(`❌ Error fetching price for ${lowerAddr}`, err);
    }
  }

  return prices;
}


// Input schema for getWalletBalances tool
const GetWalletBalancesParams = z.object({
  walletAddress: z.string().describe('The wallet address to fetch token balances for'),
});

// Define types for the response structure


const chainIdMap: Record<string, ChainConfig> = {
  '42161': { viemChain: arbitrum, quicknodeSegment: 'arbitrum-mainnet' },
};

function getChainConfigById(chainId: string): ChainConfig {
  const config = chainIdMap[chainId];
  if (!config) {
    throw new Error(`Unsupported chainId: ${chainId}. Currently only Arbitrum (42161) is supported.`);
  }
  return config;
}

// getWalletBalances tool implementation
export const getWalletBalancesTool: VibkitToolDefinition<typeof GetWalletBalancesParams, any, LiquidationPreventionContext, any> = {
  name: 'get-wallet-balances',
  description: 'Fetch wallet token balances for tokens with supply/borrow positions and analyze for liquidation prevention strategies',
  parameters: GetWalletBalancesParams,
  execute: async (args, context) => {
    try {
      console.log(`💰 Fetching wallet balances for: ${args.walletAddress}`);

      // Step 1: Get user positions to find relevant tokens
      const emberClient = context.custom.mcpClient;

      const positionsResult = await emberClient.callTool({
        name: 'getWalletLendingPositions',
        arguments: {
          walletAddress: args.walletAddress,
        },
      });

      if (positionsResult.isError) {
        throw new Error('Failed to fetch user positions for balance analysis');
      }

      // Parse position data to extract relevant tokens
      const positionsData = parseMcpToolResponsePayload(positionsResult, GetWalletLendingPositionsResponseSchema);
      const positions = positionsData.positions || [];

      if (positions.length === 0) {
        console.log('No lending positions found - returning empty balance analysis');

        return createSuccessTask(
          'get-wallet-balances',
          undefined,
          `💰 Balance Analysis: No lending positions found. No relevant tokens to check for liquidation prevention strategies.`
        );
      }

      // Step 2: Extract tokens that have either supply > 0 or borrow > 0
      const relevantTokens: Array<{
        token: any;
        hasSupply: boolean;
        hasBorrow: boolean;
        suppliedAmount: string;
        borrowedAmount: string;
      }> = [];

      for (const position of positions) {
        if (position.userReserves) {
          for (const reserve of position.userReserves) {
            const suppliedAmount = reserve.underlyingBalance || '0';
            const borrowedAmount = reserve.variableBorrows || '0';

            // Only include tokens that have either supplied > 0 or borrowed > 0
            if (parseFloat(suppliedAmount) > 0 || parseFloat(borrowedAmount) > 0) {
              relevantTokens.push({
                token: reserve.token,
                hasSupply: parseFloat(suppliedAmount) > 0,
                hasBorrow: parseFloat(borrowedAmount) > 0,
                suppliedAmount,
                borrowedAmount,
              });

              console.log(`📋 Found relevant token: ${reserve.token.symbol} (Supplied: ${suppliedAmount}, Borrowed: ${borrowedAmount})`);
            }
          }
        }
      }

      if (relevantTokens.length === 0) {
        return createSuccessTask(
          'get-wallet-balances',
          undefined,
          `💰 Balance Analysis: No tokens with active supply or borrow positions found.`
        );
      }

      // Step 3: Fetch token prices from CoinGecko API
      const tokenAddresses = relevantTokens.map(t => t.token.tokenUid.address);
      const tokenPrices = await fetchTokenPrices(tokenAddresses);
      console.log('tokenPrices', tokenPrices);

      // Step 4: Fetch wallet balances for relevant tokens using direct contract calls
      const tokenBalances: TokenBalance[] = [];
      let totalBalanceUsd = 0;

      // Set up QuickNode RPC configuration (from context)
      const quicknodeSubdomain = context.custom.quicknode.subdomain;
      const quicknodeApiKey = context.custom.quicknode.apiKey;

      for (const tokenInfo of relevantTokens) {
        try {
          const chainId = tokenInfo.token.tokenUid.chainId;
          const tokenAddress = tokenInfo.token.tokenUid.address;

          // Get chain configuration
          const chainConfig = getChainConfigById(chainId);
          const dynamicRpcUrl = `https://${quicknodeSubdomain}.${chainConfig.quicknodeSegment}.quiknode.pro/${quicknodeApiKey}`;

          // Create public client for this chain
          const publicClient = createPublicClient({
            chain: chainConfig.viemChain,
            transport: http(dynamicRpcUrl),
          });

          // Call balanceOf on the token contract
          const rawBalance = await publicClient.readContract({
            address: tokenAddress as Address,
            abi: MinimalErc20Abi,
            functionName: 'balanceOf',
            args: [args.walletAddress as Address],
          }) as bigint;

          // Format balance using token decimals
          const formattedBalance = formatUnits(rawBalance, tokenInfo.token.decimals);

          // Calculate USD value using CoinGecko prices
          let balanceUsd: number | undefined;
          const tokenPrice = tokenPrices[tokenAddress.toLowerCase()];

          if (tokenPrice && parseFloat(formattedBalance) > 0) {
            balanceUsd = parseFloat(formattedBalance) * tokenPrice;
            totalBalanceUsd += balanceUsd;
            console.log(`💲 ${tokenInfo.token.symbol}: $${tokenPrice} × ${formattedBalance} = $${balanceUsd.toFixed(2)}`);
          } else if (parseFloat(formattedBalance) > 0) {
            // Fallback for stablecoins if CoinGecko API fails
            const symbol = tokenInfo.token.symbol.toUpperCase();
            if (['USDC', 'USDT', 'DAI'].includes(symbol)) {
              balanceUsd = parseFloat(formattedBalance) * 1.0; // Approximate $1 for stablecoins
              totalBalanceUsd += balanceUsd;
              console.log(`💲 ${tokenInfo.token.symbol}: Using $1.00 fallback × ${formattedBalance} = $${balanceUsd.toFixed(2)}`);
            } else {
              console.log(`⚠️ ${tokenInfo.token.symbol}: No price data available`);
            }
          }

          const tokenBalance: TokenBalance = {
            tokenSymbol: tokenInfo.token.symbol,
            tokenAddress: tokenAddress,
            chainId: chainId,
            balance: formattedBalance,
            balanceUsd,
            decimals: tokenInfo.token.decimals,
            hasSupply: tokenInfo.hasSupply,
            hasBorrow: tokenInfo.hasBorrow,
            suppliedAmount: tokenInfo.suppliedAmount,
            borrowedAmount: tokenInfo.borrowedAmount,
          };

          tokenBalances.push(tokenBalance);

          console.log(`✅ ${tokenInfo.token.symbol}: Wallet balance ${formattedBalance}, Supplied: ${tokenInfo.suppliedAmount}, Borrowed: ${tokenInfo.borrowedAmount}`);

        } catch (contractError) {
          console.error(`❌ Failed to fetch balance for ${tokenInfo.token.symbol}:`, contractError);
          // Continue with other tokens rather than failing completely
        }
      }

      // Step 5: Analyze balances for liquidation prevention strategies
      const collateralTokens = tokenBalances.filter(token =>
        ['USDC', 'USDT', 'DAI', 'ETH', 'WETH', 'WBTC', 'RSETH'].includes(token.tokenSymbol.toUpperCase()) &&
        parseFloat(token.balance) > 0
      );

      const stablecoins = tokenBalances.filter(token =>
        ['USDC', 'USDT', 'DAI'].includes(token.tokenSymbol.toUpperCase()) &&
        parseFloat(token.balance) > 0
      );

      // Strategy recommendations
      const strategies = [];

      if (collateralTokens.length > 0) {
        const totalCollateralValue = collateralTokens.reduce((sum, token) => sum + (token.balanceUsd || 0), 0);
        strategies.push(`💪 Supply collateral: $${totalCollateralValue.toLocaleString()} available in quality collateral tokens`);
      }

      if (stablecoins.length > 0) {
        const totalStableValue = stablecoins.reduce((sum, token) => sum + (token.balanceUsd || 0), 0);
        strategies.push(`💸 Repay debt: $${totalStableValue.toLocaleString()} available in stablecoins for debt repayment`);
      }

      // Check for tokens where user has both wallet balance and debt
      const repayableDebt = tokenBalances.filter(token =>
        token.hasBorrow && parseFloat(token.balance) > 0
      );

      if (repayableDebt.length > 0) {
        strategies.push(`🎯 Direct debt repayment: You have wallet balances for ${repayableDebt.length} tokens that you're currently borrowing`);
      }

      if (strategies.length === 0) {
        strategies.push('⚠️ Limited options: Consider acquiring more assets or emergency liquidation');
      }
      // print strategies in proper manner with bullet points
      console.log(strategies.map(strategy => `• ${strategy}`).join('\n'));

      // Create detailed response
      const message = [
        `💰 **Wallet Balance Analysis for ${args.walletAddress}**`,
        ``,
        `📊 **Total Balance:** $${totalBalanceUsd.toLocaleString()}`,
        `🪙 **Relevant Tokens:** ${tokenBalances.length} (with active positions)`,
        `💡 **Price Source:** Real-time prices from CoinGecko API`,
        ``,
        `**Token Balances (Position-Related):**`,
        ...tokenBalances.map(token => {
          const usdDisplay = token.balanceUsd ? ` ($${token.balanceUsd.toLocaleString()})` : '';
          const positionInfo = [];
          if (token.hasSupply) positionInfo.push(`Supply: ${token.suppliedAmount}`);
          if (token.hasBorrow) positionInfo.push(`Borrow: ${token.borrowedAmount}`);
          const positionDisplay = positionInfo.length > 0 ? ` | ${positionInfo.join(', ')}` : '';

          return `• ${token.tokenSymbol}: ${token.balance}${usdDisplay}${positionDisplay}`;
        }),
        ``,
        `**Liquidation Prevention Strategies:**`,
        ...strategies.map(strategy => `• ${strategy}`),
        ``,
        `🕐 **Last Updated:** ${new Date().toLocaleString()}`,
      ].join('\n');

      console.log(`✅ Successfully fetched balances and prices for ${tokenBalances.length} relevant tokens. Total: $${totalBalanceUsd.toLocaleString()}`);

      return createSuccessTask(
        'get-wallet-balances',
        undefined,
        `💰 Balance Analysis: Found ${tokenBalances.length} tokens with positions worth $${totalBalanceUsd.toLocaleString()}. ${strategies.length} liquidation prevention strategies available. ${message}`
      );

    } catch (error) {
      console.error('❌ getWalletBalances tool error:', error);
      return createErrorTask(
        'get-wallet-balances',
        error instanceof Error ? error : new Error(`Failed to fetch wallet balances: ${error}`)
      );
    }
  },
}; 
