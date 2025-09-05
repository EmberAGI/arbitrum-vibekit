/**
 * Aave Configuration and Liquidation Threshold Utilities
 * Fetches liquidation thresholds directly from Aave contracts
 */

import {
    createPublicClient,
    http,
    formatUnits,
    type Address,
} from 'viem';
import { arbitrum } from 'viem/chains';

import { DATA_PROVIDER_ABI, LiquidationPreventionData, MinimalErc20Abi, PreventionConfig, type AssetData, type LiquidationPreventionContext, type PositionSummary } from '../context/types.js';
import { parseMcpToolResponsePayload } from 'arbitrum-vibekit-core';
import { GetWalletLendingPositionsResponseSchema } from 'ember-schemas';

// Aave configuration for Arbitrum
const ARBITRUM_CONFIG = {
    chainId: 42161,
    aaveProtocolDataProvider: "0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654" as Address,
    poolAddress: "0x794a61358D6845594F94dc1DB02A252b5b4814aD" as Address,
};

// Global token price cache
const tokenPricesCache: Record<string, number> = {};

// ✅ Fetch liquidation threshold for a specific asset
export async function getAssetLiquidationThreshold(
    assetAddress: string,
    context: LiquidationPreventionContext
): Promise<string> {
    try {
        // Set up QuickNode RPC configuration
        const quicknodeSubdomain = context.quicknode.subdomain;
        const quicknodeApiKey = context.quicknode.apiKey;
        const dynamicRpcUrl = `https://${quicknodeSubdomain}.arbitrum-mainnet.quiknode.pro/${quicknodeApiKey}`;

        // Create public client for Arbitrum
        const publicClient = createPublicClient({
            chain: arbitrum,
            transport: http(dynamicRpcUrl),
        });

        // Call getReserveConfigurationData on Aave Protocol Data Provider
        const result = await publicClient.readContract({
            address: ARBITRUM_CONFIG.aaveProtocolDataProvider as Address,
            abi: DATA_PROVIDER_ABI,
            functionName: 'getReserveConfigurationData',
            args: [assetAddress as Address],
        }) as [bigint, bigint, bigint, bigint, bigint, boolean, boolean, boolean, boolean, boolean];

        const liquidationThreshold = result[2]; // Third element is liquidationThreshold

        // Convert from basis points to percentage (e.g. 8400 -> 0.84)
        const thresholdPercentage = Number(liquidationThreshold) / 10000;

        console.log(`✅ Liquidation threshold for ${assetAddress}: ${thresholdPercentage} (${liquidationThreshold} basis points)`);

        return thresholdPercentage.toString();
    } catch (error) {
        console.error(`❌ Failed to fetch liquidation threshold for ${assetAddress}:`, error);
        return "0"; // Default fallback
    }
}

// Function to fetch token prices from CoinGecko API and update cache
async function fetchTokenPrices(tokenAddresses: string[]): Promise<Record<string, number>> {
    const prices: Record<string, number> = {};

    for (const addr of tokenAddresses) {
        const lowerAddr = addr.toLowerCase();
        // If already in cache, use cached value
        if (tokenPricesCache[lowerAddr] !== undefined) {
            prices[lowerAddr] = tokenPricesCache[lowerAddr];
            continue;
        }
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
                tokenPricesCache[lowerAddr] = data[lowerAddr].usd;
                console.log(`✅ Price fetched for ${lowerAddr}: ${data[lowerAddr].usd}`);
            } else {
                console.warn(`⚠️ No USD price in response for ${lowerAddr}`);
            }
        } catch (err) {
            console.error(`❌ Error fetching price for ${lowerAddr}`, err);
        }
    }
    return prices;
}

// ✅ Step 2: Get position-based assets (SUPPLIED and BORROWED)
export async function getPositionAssets(
    userAddress: string,
    context: LiquidationPreventionContext
): Promise<{ assets: AssetData[], positionSummary: PositionSummary }> {
    console.log(`📊 Fetching position assets for: ${userAddress}`);

    const emberClient = context.mcpClient;

    // Get user positions
    const positionsResult = await emberClient.callTool({
        name: 'getWalletLendingPositions',
        arguments: { walletAddress: userAddress },
    });

    if (positionsResult.isError) {
        throw new Error('Failed to fetch user positions for asset analysis');
    }

    const positionsData = parseMcpToolResponsePayload(positionsResult, GetWalletLendingPositionsResponseSchema);
    const positions = positionsData.positions || [];

    if (positions.length === 0) {
        return {
            assets: [],
            positionSummary: {
                totalCollateralUsd: "0",
                totalBorrowsUsd: "0",
                currentHealthFactor: "0"
            }
        };
    }

    const firstPosition = positions[0];
    const assets: AssetData[] = [];

    // Extract position summary
    const positionSummary: PositionSummary = {
        totalCollateralUsd: firstPosition?.totalCollateralUsd || "0",
        totalBorrowsUsd: firstPosition?.totalBorrowsUsd || "0",
        currentHealthFactor: firstPosition?.healthFactor || "0",
    };

    // Only fetch prices for tokens that are supplied or borrowed
    const tokensToFetch: string[] = [];
    for (const position of positions) {
        if (position.userReserves) {
            for (const reserve of position.userReserves) {
                const suppliedAmount = reserve.underlyingBalance || '0';
                const borrowedAmount = reserve.variableBorrows || '0';
                if (parseFloat(suppliedAmount) > 0 || parseFloat(borrowedAmount) > 0) {
                    const addr = reserve.token.tokenUid.address.toLowerCase();
                    if (tokenPricesCache[addr] === undefined && !tokensToFetch.includes(addr)) {
                        tokensToFetch.push(addr);
                    }
                }
            }
        }
    }
    // Fetch and cache prices for these tokens
    if (tokensToFetch.length > 0) {
        await fetchTokenPrices(tokensToFetch);
    }

    // Process user reserves
    for (const position of positions) {
        if (position.userReserves) {
            for (const reserve of position.userReserves) {
                const suppliedAmount = reserve.underlyingBalance || '0';
                const borrowedAmount = reserve.variableBorrows || '0';
                const token = reserve.token;
                const addr = token.tokenUid.address.toLowerCase();

                // Add SUPPLIED asset if user has supplied collateral
                if (parseFloat(suppliedAmount) > 0) {
                    // Get liquidation threshold for supplied asset
                    const liquidationThreshold = await getAssetLiquidationThreshold(
                        token.tokenUid.address,
                        context
                    );
                    // Get price from cache
                    const currentPrice = tokenPricesCache[addr] || 0;
                    const balanceUsd = (parseFloat(suppliedAmount) * currentPrice).toString();
                    assets.push({
                        type: "SUPPLIED",
                        symbol: token.symbol,
                        balance: suppliedAmount,
                        balanceUsd,
                        currentPrice: currentPrice.toString(),
                        liquidationThreshold,
                    });
                }
                // Add BORROWED asset if user has debt
                if (parseFloat(borrowedAmount) > 0) {
                    // Get price from cache
                    const currentPrice = tokenPricesCache[addr] || 0;
                    const balanceUsd = (parseFloat(borrowedAmount) * currentPrice).toString();
                    assets.push({
                        type: "BORROWED",
                        symbol: token.symbol,
                        balance: borrowedAmount,
                        balanceUsd,
                        currentPrice: currentPrice.toString(),
                    });
                }
            }
        }
    }

    console.log(`✅ Found ${assets.length} position assets (SUPPLIED/BORROWED)`);
    return { assets, positionSummary };
}

// ✅ Step 3: Get wallet-based assets (WALLET type)
export async function getWalletAssets(
    userAddress: string,
    context: LiquidationPreventionContext,
    borrowedTokens: string[] // List of token symbols that user is borrowing
): Promise<AssetData[]> {
    console.log(`💰 Fetching wallet assets for: ${userAddress}`);

    // First get position data to find relevant tokens
    const emberClient = context.mcpClient;

    const positionsResult = await emberClient.callTool({
        name: 'getWalletLendingPositions',
        arguments: { walletAddress: userAddress },
    });

    if (positionsResult.isError) {
        console.log('No positions found for wallet asset analysis');
        return [];
    }

    const positionsData = parseMcpToolResponsePayload(positionsResult, GetWalletLendingPositionsResponseSchema);
    const positions = positionsData.positions || [];

    if (positions.length === 0) {
        return [];
    }

    // Extract relevant tokens (those with active positions)
    const relevantTokens: Array<{
        token: any;
        hasSupply: boolean;
        hasBorrow: boolean;
    }> = [];

    for (const position of positions) {
        if (position.userReserves) {
            for (const reserve of position.userReserves) {
                const suppliedAmount = reserve.underlyingBalance || '0';
                const borrowedAmount = reserve.variableBorrows || '0';
                if (parseFloat(suppliedAmount) > 0 || parseFloat(borrowedAmount) > 0) {
                    relevantTokens.push({
                        token: reserve.token,
                        hasSupply: parseFloat(suppliedAmount) > 0,
                        hasBorrow: parseFloat(borrowedAmount) > 0,
                    });
                }
            }
        }
    }

    // Set up QuickNode RPC configuration for balance fetching
    const quicknodeSubdomain = context.quicknode.subdomain;
    const quicknodeApiKey = context.quicknode.apiKey;
    const dynamicRpcUrl = `https://${quicknodeSubdomain}.arbitrum-mainnet.quiknode.pro/${quicknodeApiKey}`;

    // Create public client for Arbitrum
    const publicClient = createPublicClient({
        chain: arbitrum,
        transport: http(dynamicRpcUrl),
    });

    const assets: AssetData[] = [];

    // Fetch wallet balances for relevant tokens
    for (const tokenInfo of relevantTokens) {
        try {
            const tokenAddress = tokenInfo.token.tokenUid.address;
            const addr = tokenAddress.toLowerCase();
            // Call balanceOf on the token contract
            const rawBalance = await publicClient.readContract({
                address: tokenAddress as Address,
                abi: MinimalErc20Abi,
                functionName: 'balanceOf',
                args: [userAddress as Address],
            }) as bigint;
            // Format balance using token decimals
            const formattedBalance = formatUnits(rawBalance, tokenInfo.token.decimals);
            if (parseFloat(formattedBalance) > 0) {
                // Try to get price from cache first
                let tokenPrice = tokenPricesCache[addr];
                if (tokenPrice === undefined || tokenPrice === 0) {
                    // Fetch and update cache if missing or zero
                    const fetched = await fetchTokenPrices([addr]);
                    tokenPrice = fetched[addr] || 0;
                }
                let balanceUsd = "0";
                let currentPrice: string | undefined;
                if (tokenPrice && parseFloat(formattedBalance) > 0) {
                    balanceUsd = (parseFloat(formattedBalance) * tokenPrice).toString();
                    currentPrice = tokenPrice.toString();
                } else {
                    // Fallback for stablecoins if CoinGecko API fails
                    const symbol = tokenInfo.token.symbol.toUpperCase();
                    if (["USDC", "USDT", "DAI"].includes(symbol)) {
                        balanceUsd = (parseFloat(formattedBalance) * 1.0).toString();
                        currentPrice = "1.0";
                    }
                }
                assets.push({
                    type: "WALLET",
                    symbol: tokenInfo.token.symbol,
                    balance: formattedBalance,
                    balanceUsd,
                    currentPrice,
                    canSupply: true, // Always true for wallet assets
                    canRepay: tokenInfo.hasBorrow, // True if user is borrowing this token
                });
                console.log(`✅ Wallet asset: ${tokenInfo.token.symbol} = ${formattedBalance} (${balanceUsd})`);
            }
        } catch (contractError) {
            console.error(`❌ Failed to fetch wallet balance for ${tokenInfo.token.symbol}:`, contractError);
        }
    }
    console.log(`✅ Found ${assets.length} wallet assets with non-zero balances`);
    return assets;
}

// ✅ Step 4: Combine everything into LiquidationPreventionData
export async function generateLiquidationPreventionData(
    userAddress: string,
    context: LiquidationPreventionContext,
    targetHealthFactor?: string
): Promise<LiquidationPreventionData> {
    console.log(`🧠 Generating LiquidationPreventionData for: ${userAddress}`);

    // Step 1: Get position assets and summary
    const { assets: positionAssets, positionSummary } = await getPositionAssets(userAddress, context);

    // Step 2: Get borrowed token symbols for wallet asset analysis
    const borrowedTokens = positionAssets
        .filter(asset => asset.type === "BORROWED")
        .map(asset => asset.symbol);

    // Step 3: Get wallet assets
    const walletAssets = await getWalletAssets(userAddress, context, borrowedTokens);

    // Step 4: Combine all assets
    const allAssets = [...positionAssets, ...walletAssets];

    // Step 5: Set up prevention config
    const preventionConfig: PreventionConfig = {
        targetHealthFactor: targetHealthFactor || context.thresholds.critical.toString(),
    };

    const result: LiquidationPreventionData = {
        assets: allAssets,
        positionSummary,
        preventionConfig,
    };

    console.log(`✅ Generated LiquidationPreventionData:`, {
        totalAssets: allAssets.length,
        suppliedAssets: allAssets.filter(a => a.type === "SUPPLIED").length,
        borrowedAssets: allAssets.filter(a => a.type === "BORROWED").length,
        walletAssets: allAssets.filter(a => a.type === "WALLET").length,
        currentHealthFactor: positionSummary.currentHealthFactor,
        targetHealthFactor: preventionConfig.targetHealthFactor,
    });

    return result;
}
