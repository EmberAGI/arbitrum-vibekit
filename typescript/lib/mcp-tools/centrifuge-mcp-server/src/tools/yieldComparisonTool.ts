import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CentrifugeSDKClient } from '../utils/sdkClient.js';

export const yieldComparisonTool: Tool = {
    name: 'yield-comparison-tool',
    description: 'Compare yields across different Centrifuge pools and strategies with risk-adjusted analysis',
    inputSchema: {
        type: 'object',
        properties: {
            comparisonType: {
                type: 'string',
                description: 'Type of yield comparison to perform',
                enum: ['pools', 'tranches', 'strategies', 'historical', 'benchmark'],
                default: 'pools'
            },
            investorAddress: {
                type: 'string',
                description: 'Investor address for personalized comparisons',
                pattern: '^0x[a-fA-F0-9]{40}$'
            },
            poolIds: {
                type: 'array',
                description: 'Specific pool IDs to compare (for pools comparison)',
                items: { type: 'string' },
                default: []
            },
            timeHorizon: {
                type: 'string',
                description: 'Time horizon for comparison',
                enum: ['1M', '3M', '6M', '1Y', '2Y'],
                default: '6M'
            },
            riskAdjustment: {
                type: 'boolean',
                description: 'Whether to include risk-adjusted yield metrics',
                default: true
            },
            includeBenchmarks: {
                type: 'boolean',
                description: 'Include traditional investment benchmarks',
                default: true
            },
            sortBy: {
                type: 'string',
                description: 'Sort results by specific metric',
                enum: ['yield', 'sharpe', 'sortino', 'risk_adjusted', 'total_return'],
                default: 'yield'
            },
            minLiquidity: {
                type: 'number',
                description: 'Minimum liquidity requirement (%)',
                minimum: 0,
                maximum: 100,
                default: 10
            }
        }
    }
};

export async function executeYieldComparisonTool(args: any): Promise<{ content: string }> {
    const {
        comparisonType = 'pools',
        investorAddress,
        poolIds = [],
        timeHorizon = '6M',
        riskAdjustment = true,
        includeBenchmarks = true,
        sortBy = 'yield',
        minLiquidity = 10
    } = args;

    try {
        console.log(`⚖️ [Yield Comparison] Performing ${comparisonType} comparison...`);

        // Validate investor address if provided
        if (investorAddress) {
            const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
            if (!ethAddressRegex.test(investorAddress)) {
                return {
                    content: `❌ **YIELD COMPARISON FAILED**

**Error:** Invalid Ethereum address format

**Your Address:** ${investorAddress}

**Required Format:** Must start with "0x" followed by 40 hexadecimal characters
**Example:** 0x742d35Cc6074C4532895c05b22629ce5b3c28da4

**Next Steps:**
• Verify your wallet address is correct
• Use a valid Ethereum address format
• Or omit address for general comparison

⏰ **Validation failed:** ${new Date().toISOString()}`
                };
            }
        }

        // Mock comparison data
        const mockComparisonData = {
            pools: [
                {
                    poolId: '1',
                    name: 'New Silver Pool',
                    trancheType: 'Senior',
                    yield: 8.5,
                    riskScore: 65,
                    liquidity: 75,
                    tvl: 2500000,
                    sharpeRatio: 1.72,
                    sortinoRatio: 2.15,
                    maxDrawdown: -8.7,
                    volatility: 12.3,
                    alpha: 3.2,
                    beta: 0.85,
                    category: 'Real Estate'
                },
                {
                    poolId: '2',
                    name: 'ConsolFreight Pool',
                    trancheType: 'Senior',
                    yield: 7.8,
                    riskScore: 68,
                    liquidity: 80,
                    tvl: 1800000,
                    sharpeRatio: 1.45,
                    sortinoRatio: 1.82,
                    maxDrawdown: -12.1,
                    volatility: 14.2,
                    alpha: 2.1,
                    beta: 0.92,
                    category: 'Trade Finance'
                },
                {
                    poolId: '1',
                    name: 'New Silver Pool',
                    trancheType: 'Junior',
                    yield: 12.0,
                    riskScore: 85,
                    liquidity: 75,
                    tvl: 2500000,
                    sharpeRatio: 1.28,
                    sortinoRatio: 1.65,
                    maxDrawdown: -18.3,
                    volatility: 18.7,
                    alpha: 5.8,
                    beta: 1.15,
                    category: 'Real Estate'
                },
                {
                    poolId: '3',
                    name: 'GreenEnergy Pool',
                    trancheType: 'Senior',
                    yield: 9.2,
                    riskScore: 62,
                    liquidity: 85,
                    tvl: 3200000,
                    sharpeRatio: 1.85,
                    sortinoRatio: 2.32,
                    maxDrawdown: -6.2,
                    volatility: 10.8,
                    alpha: 4.1,
                    beta: 0.78,
                    category: 'Green Energy'
                }
            ],
            benchmarks: [
                {
                    name: 'US Treasury 10Y',
                    yield: 4.2,
                    riskScore: 10,
                    sharpeRatio: 2.85,
                    volatility: 4.1,
                    category: 'Government Bond'
                },
                {
                    name: 'S&P 500 Index',
                    yield: 8.1,
                    riskScore: 75,
                    sharpeRatio: 1.35,
                    volatility: 15.2,
                    category: 'Equity Index'
                },
                {
                    name: 'Corporate Bond Index',
                    yield: 5.8,
                    riskScore: 45,
                    sharpeRatio: 1.92,
                    volatility: 8.3,
                    category: 'Corporate Bonds'
                }
            ],
            strategies: [
                {
                    name: 'Conservative Mix',
                    description: '80% Senior / 20% Junior',
                    yield: 8.9,
                    riskScore: 63,
                    sharpeRatio: 1.78,
                    volatility: 11.2,
                    maxDrawdown: -7.8
                },
                {
                    name: 'Balanced Approach',
                    description: '60% Senior / 40% Junior',
                    yield: 9.8,
                    riskScore: 72,
                    sharpeRatio: 1.52,
                    volatility: 14.1,
                    maxDrawdown: -11.5
                },
                {
                    name: 'Aggressive Yield',
                    description: '40% Senior / 60% Junior',
                    yield: 10.7,
                    riskScore: 81,
                    sharpeRatio: 1.35,
                    volatility: 16.8,
                    maxDrawdown: -15.2
                }
            ]
        };

        // Filter data based on criteria
        let comparisonData = [];

        switch (comparisonType) {
            case 'pools':
                comparisonData = mockComparisonData.pools.filter(pool =>
                    pool.liquidity >= minLiquidity &&
                    (poolIds.length === 0 || poolIds.includes(pool.poolId))
                );
                break;
            case 'tranches':
                comparisonData = mockComparisonData.pools.filter(pool =>
                    pool.liquidity >= minLiquidity &&
                    (poolIds.length === 0 || poolIds.includes(pool.poolId))
                );
                break;
            case 'strategies':
                comparisonData = mockComparisonData.strategies;
                break;
            case 'benchmark':
                comparisonData = includeBenchmarks ? [...mockComparisonData.pools, ...mockComparisonData.benchmarks] : mockComparisonData.pools;
                break;
            default:
                comparisonData = mockComparisonData.pools;
        }

        // Sort data based on criteria
        comparisonData.sort((a, b) => {
            switch (sortBy) {
                case 'yield':
                    return b.yield - a.yield;
                case 'sharpe':
                    return (b.sharpeRatio || 0) - (a.sharpeRatio || 0);
                case 'sortino':
                    const bSortino = 'sortinoRatio' in b ? (b as any).sortinoRatio || 0 : 0;
                    const aSortino = 'sortinoRatio' in a ? (a as any).sortinoRatio || 0 : 0;
                    return Number(bSortino) - Number(aSortino);
                case 'risk_adjusted':
                    return (b.yield / (b.riskScore || 1)) - (a.yield / (a.riskScore || 1));
                case 'total_return':
                    return b.yield - a.yield; // Simplified for demo
                default:
                    return b.yield - a.yield;
            }
        });

        // Generate response
        let response = `⚖️ **YIELD COMPARISON ANALYSIS**

📊 **Comparison Type:** ${comparisonType.charAt(0).toUpperCase() + comparisonType.slice(1)} Comparison
📅 **Time Horizon:** ${timeHorizon}
🎯 **Sort By:** ${sortBy.replace('_', ' ').toUpperCase()}
📈 **Risk Adjustment:** ${riskAdjustment ? 'Included' : 'Excluded'}
🏦 **Minimum Liquidity:** ${minLiquidity}%

`;

        if (investorAddress) {
            response += `👤 **Investor:** ${investorAddress}
`;
        }

        response += `
📋 **COMPARISON RESULTS:**

`;

        // Create comparison table
        response += `\`\`\`
Rank | Name | Tranche | Yield | Risk | Sharpe | Liquidity | Category
-----|------|---------|-------|------|--------|-----------|----------
`;

        comparisonData.slice(0, 10).forEach((item, index) => {
            const rank = (index + 1).toString().padStart(4);
            const name = (item.name || 'N/A').substring(0, 12).padEnd(12);
            const tranche = ('trancheType' in item ? (item as any).trancheType || '-' : '-').substring(0, 7).padEnd(7);
            const yieldVal = item.yield.toFixed(1).padStart(5);
            const risk = (item.riskScore || 0).toString().padStart(4);
            const sharpe = (item.sharpeRatio || 0).toFixed(2).padStart(6);
            const liquidity = ('liquidity' in item ? (item as any).liquidity || 0 : 0).toString().padStart(9);
            const category = ('category' in item ? (item as any).category || '-' : '-').substring(0, 10).padEnd(10);

            response += `${rank} | \${name} | \${tranche} | \${yieldVal}% | \${risk} | \${sharpe} | \${liquidity}% | \${category}
`;
        });

        response += `\`\`\`

`;

        // Performance Analysis
        const topPerformer = comparisonData.length > 0 ? comparisonData[0] : null;
        const avgYield = comparisonData.length > 0 ? comparisonData.reduce((sum, item) => sum + item.yield, 0) / comparisonData.length : 0;
        const avgRisk = comparisonData.length > 0 ? comparisonData.reduce((sum, item) => sum + (item.riskScore || 0), 0) / comparisonData.length : 0;

        response += `📈 **PERFORMANCE ANALYSIS:**

**Top Performer:** ${topPerformer ? `${topPerformer.name} (${('trancheType' in topPerformer ? topPerformer.trancheType || 'N/A' : 'N/A')}) - ${topPerformer.yield.toFixed(1)}% yield` : 'No data available'}
**Average Yield:** ${avgYield.toFixed(1)}%
**Average Risk Score:** ${avgRisk.toFixed(1)}/100
**Total Options:** ${comparisonData.length}

**Yield Distribution:**
• **High Yield (> 10%):** ${comparisonData.filter(item => item.yield > 10).length} options
• **Medium Yield (7-10%):** ${comparisonData.filter(item => item.yield >= 7 && item.yield <= 10).length} options
• **Low Yield (< 7%):** ${comparisonData.filter(item => item.yield < 7).length} options

`;

        // Risk-Return Analysis
        if (riskAdjustment) {
            response += `🎯 **RISK-ADJUSTED ANALYSIS:**

**Sharpe Ratio Leaders:**
`;

            comparisonData
                .filter(item => item.sharpeRatio)
                .sort((a, b) => (b.sharpeRatio || 0) - (a.sharpeRatio || 0))
                .slice(0, 3)
                .forEach((item, index) => {
                    response += `${index + 1}. ${item.name} (${('trancheType' in item ? item.trancheType || 'N/A' : 'N/A')}): ${item.sharpeRatio?.toFixed(2)} Sharpe Ratio\n`;
                });

            response += `
**Risk Efficiency Rankings:**
`;

            comparisonData
                .sort((a, b) => (b.yield / (b.riskScore || 1)) - (a.yield / (a.riskScore || 1)))
                .slice(0, 3)
                .forEach((item, index) => {
                    const efficiency = (item.yield / (item.riskScore || 1)).toFixed(3);
                    response += `${index + 1}. ${item.name}: ${efficiency} yield/risk ratio\n`;
                });

            response += `
`;
        }

        // Benchmark Comparison
        if (includeBenchmarks && comparisonType === 'benchmark') {
            response += `⚖️ **BENCHMARK COMPARISON:**

**Centrifuge vs Traditional Investments:**
`;

            const centrifugeAvg = mockComparisonData.pools.reduce((sum, pool) => sum + pool.yield, 0) / mockComparisonData.pools.length;
            const benchmarkAvg = mockComparisonData.benchmarks.reduce((sum, bench) => sum + bench.yield, 0) / mockComparisonData.benchmarks.length;

            response += `• **Centrifuge Average:** ${centrifugeAvg.toFixed(1)}%
• **Traditional Average:** ${benchmarkAvg.toFixed(1)}%
• **Outperformance:** ${(centrifugeAvg - benchmarkAvg).toFixed(1)}%

**Key Advantages:**
• Higher yields with similar risk profiles
• Diversified underlying assets
• Real-world impact investment
• Decentralized and transparent

`;
        }

        // Recommendations
        response += `💡 **INVESTMENT RECOMMENDATIONS:**

**Based on ${sortBy.replace('_', ' ').toUpperCase()} Priority:**

`;

        if (sortBy === 'yield') {
            response += `• **High Yield Focus:** ${topPerformer ? `Consider ${topPerformer.name} for maximum returns` : 'Focus on highest yielding options available'}
• **Balance Approach:** Mix high-yield with lower-risk options
• **Risk Consideration:** Higher yields typically come with higher risk
`;
        } else if (sortBy === 'sharpe') {
            response += `• **Efficiency Focus:** ${topPerformer ? `${topPerformer.name} offers best risk-adjusted returns` : 'Prioritize options with Sharpe ratio > 1.5'}
• **Stable Returns:** Prioritize Sharpe ratio > 1.5 for consistent performance
• **Long-term Holding:** Suitable for buy-and-hold strategies
`;
        } else if (sortBy === 'risk_adjusted') {
            response += `• **Optimal Balance:** ${topPerformer ? `${topPerformer.name} provides best yield per unit of risk` : 'Look for best risk-adjusted performance'}
• **Risk Tolerance:** Adjust based on your risk preferences
• **Diversification:** Combine multiple options for optimal portfolio
`;
        }

        response += `
🔧 **STRATEGY CONSIDERATIONS:**

**Time Horizon Impact:**
• **Short-term (< 6 months):** Focus on liquidity and low volatility
• **Medium-term (6-18 months):** Balance yield and risk metrics
• **Long-term (> 18 months):** Prioritize total return potential

**Risk Tolerance Guidelines:**
• **Conservative:** Sharpe ratio > 1.8, volatility < 12%
• **Moderate:** Sharpe ratio > 1.3, volatility < 18%
• **Aggressive:** Sharpe ratio > 1.0, volatility < 25%

`;

        response += `📋 **NEXT STEPS:**

1. **Detailed Analysis:** Use \`analyze-pool-details\` for specific pools
2. **Risk Assessment:** Use \`advanced-risk-assessment\` for deeper analysis
3. **Portfolio Planning:** Use \`portfolio-rebalancing\` for allocation strategy
4. **Performance Tracking:** Use \`investment-performance-tracking\` to monitor
5. **Alert Setup:** Use \`risk-alert-system\` for threshold monitoring

⚠️ **IMPORTANT NOTES:**
• Past performance doesn't guarantee future results
• Consider your risk tolerance and investment goals
• Diversification is key to managing risk
• Always do your own due diligence
• Market conditions can change rapidly

🆘 **NEED HELP?**
• **Strategy Advice:** Consult with financial advisor
• **Technical Support:** Contact platform support
• **Educational Resources:** Check documentation
• **Community:** Join investor discussions

⏰ **Analysis completed:** ${new Date().toISOString()}`;

        // console.log(`✅ [Yield Comparison] ${comparisonType} comparison completed`);
        return { content: response };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ [Yield Comparison] Failed:`, errorMessage);

        return {
            content: `❌ **YIELD COMPARISON FAILED**

**Error:** ${errorMessage}

**Parameters:**
• Comparison Type: ${comparisonType}
• Time Horizon: ${timeHorizon}
• Sort By: ${sortBy}
• Risk Adjustment: ${riskAdjustment}

**Troubleshooting:**
• Verify all parameters are valid
• Check network connectivity
• Try different comparison types
• Contact support if issues persist

**Alternative Tools:**
• Use \`discover-centrifuge-pools\` for basic discovery
• Use \`yield-optimization\` for personalized recommendations
• Use \`advanced-risk-assessment\` for risk analysis

⏰ **Error occurred:** ${new Date().toISOString()}`
        };
    }
}
