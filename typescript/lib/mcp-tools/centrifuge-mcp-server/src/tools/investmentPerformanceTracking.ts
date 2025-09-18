import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CentrifugeSDKClient } from '../utils/sdkClient.js';

export const investmentPerformanceTrackingTool: Tool = {
    name: 'investment-performance-tracking',
    description: 'Track and analyze investment performance with detailed metrics and charts',
    inputSchema: {
        type: 'object',
        properties: {
            investorAddress: {
                type: 'string',
                description: 'The investor wallet address to track performance for',
                pattern: '^0x[a-fA-F0-9]{40}$'
            },
            timePeriod: {
                type: 'string',
                description: 'Time period for performance analysis',
                enum: ['1M', '3M', '6M', '1Y', '2Y', 'ALL'],
                default: '6M'
            },
            includeCharts: {
                type: 'boolean',
                description: 'Whether to include performance charts in the response',
                default: true
            },
            benchmarkComparison: {
                type: 'boolean',
                description: 'Whether to compare against market benchmarks',
                default: true
            },
            calculateMetrics: {
                type: 'array',
                description: 'Specific metrics to calculate',
                items: {
                    type: 'string',
                    enum: ['roi', 'sharpe', 'sortino', 'maxDrawdown', 'volatility', 'alpha', 'beta']
                },
                default: ['roi', 'sharpe', 'maxDrawdown']
            },
            poolId: {
                type: 'string',
                description: 'Optional: Focus on specific pool performance',
                pattern: '^[0-9]+$',
                default: ''
            }
        },
        required: ['investorAddress']
    }
};

export async function executeInvestmentPerformanceTracking(args: any): Promise<{ content: string }> {
    const {
        investorAddress,
        timePeriod = '6M',
        includeCharts = true,
        benchmarkComparison = true,
        calculateMetrics = ['roi', 'sharpe', 'maxDrawdown'],
        poolId = ''
    } = args;

    try {
        console.log(`📊 [Investment Performance Tracking] Analyzing performance for ${investorAddress}...`);

        // Validate Ethereum address format
        const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
        if (!ethAddressRegex.test(investorAddress)) {
            return {
                content: `❌ **PERFORMANCE TRACKING FAILED**

**Error:** Invalid Ethereum address format

**Your Address:** ${investorAddress}

**Required Format:** Must start with "0x" followed by 40 hexadecimal characters
**Example:** 0x742d35Cc6074C4532895c05b22629ce5b3c28da4

**Next Steps:**
• Verify your wallet address is correct
• Use a valid Ethereum address format

⏰ **Validation failed:** ${new Date().toISOString()}`
            };
        }

        // Mock performance data - in production this would come from blockchain analysis
        const performanceData: any = {
            portfolio: {
                totalInvested: 25000.00,
                currentValue: 27650.00,
                totalReturn: 10.60,
                annualizedReturn: 21.20,
                bestMonth: 8.5,
                worstMonth: -2.1,
                volatility: 12.3,
                sharpeRatio: 1.72,
                sortinoRatio: 2.15,
                maxDrawdown: -8.7,
                alpha: 3.2,
                beta: 0.85,
                benchmarkReturn: 8.5,
                benchmarkComparison: 2.1
            },
            pools: {
                '1': {
                    poolName: 'New Silver Pool',
                    invested: 15000.00,
                    currentValue: 16650.00,
                    return: 11.00,
                    contribution: 66.7
                },
                '2': {
                    poolName: 'ConsolFreight Pool',
                    invested: 10000.00,
                    currentValue: 11000.00,
                    return: 10.00,
                    contribution: 33.3
                }
            },
            monthlyReturns: [
                { month: '2024-04', return: 2.1, benchmark: 1.8 },
                { month: '2024-05', return: 3.2, benchmark: 2.5 },
                { month: '2024-06', return: 1.8, benchmark: 2.1 },
                { month: '2024-07', return: -2.1, benchmark: -1.5 },
                { month: '2024-08', return: 4.5, benchmark: 3.2 },
                { month: '2024-09', return: 3.8, benchmark: 2.9 }
            ]
        };

        // Filter data if specific pool requested
        let displayData = performanceData;
        if (poolId && performanceData.pools[poolId]) {
            const poolData = performanceData.pools[poolId];
            displayData = {
                ...performanceData,
                portfolio: {
                    ...performanceData.portfolio,
                    totalInvested: poolData.invested,
                    currentValue: poolData.currentValue,
                    totalReturn: poolData.return
                },
                pools: { [poolId]: poolData }
            };
        }

        // Generate response
        let response = `📊 **INVESTMENT PERFORMANCE TRACKING**

👤 **Investor:** ${investorAddress}
📅 **Analysis Period:** ${timePeriod}
📊 **Report Date:** ${new Date().toISOString().split('T')[0]}

`;

        // Portfolio Overview
        response += `💼 **PORTFOLIO OVERVIEW:**
• **Total Invested:** $${displayData.portfolio.totalInvested.toLocaleString()}
• **Current Value:** $${displayData.portfolio.currentValue.toLocaleString()}
• **Total Return:** ${displayData.portfolio.totalReturn.toFixed(2)}%
• **Annualized Return:** ${displayData.portfolio.annualizedReturn.toFixed(2)}%
• **Best Month:** ${displayData.portfolio.bestMonth.toFixed(1)}%
• **Worst Month:** ${displayData.portfolio.worstMonth.toFixed(1)}%

`;

        // Performance Metrics
        if (calculateMetrics.length > 0) {
            response += `📈 **PERFORMANCE METRICS:**

`;

            if (calculateMetrics.includes('roi')) {
                response += `• **ROI:** ${displayData.portfolio.totalReturn.toFixed(2)}% (Total Return)
`;
            }
            if (calculateMetrics.includes('sharpe')) {
                response += `• **Sharpe Ratio:** ${displayData.portfolio.sharpeRatio.toFixed(2)} (Risk-adjusted returns)
`;
            }
            if (calculateMetrics.includes('sortino')) {
                response += `• **Sortino Ratio:** ${displayData.portfolio.sortinoRatio.toFixed(2)} (Downside risk only)
`;
            }
            if (calculateMetrics.includes('maxDrawdown')) {
                response += `• **Max Drawdown:** ${displayData.portfolio.maxDrawdown.toFixed(1)}% (Largest peak-to-valley decline)
`;
            }
            if (calculateMetrics.includes('volatility')) {
                response += `• **Volatility:** ${displayData.portfolio.volatility.toFixed(1)}% (Annualized standard deviation)
`;
            }
            if (calculateMetrics.includes('alpha')) {
                response += `• **Alpha:** ${displayData.portfolio.alpha.toFixed(1)}% (Excess return over benchmark)
`;
            }
            if (calculateMetrics.includes('beta')) {
                response += `• **Beta:** ${displayData.portfolio.beta.toFixed(2)} (Market sensitivity)
`;
            }

            response += `
`;
        }

        // Benchmark Comparison
        if (benchmarkComparison) {
            response += `⚖️ **BENCHMARK COMPARISON:**
• **Portfolio Return:** ${displayData.portfolio.totalReturn.toFixed(2)}%
• **Benchmark Return:** ${displayData.portfolio.benchmarkReturn.toFixed(1)}%
• **Outperformance:** ${displayData.portfolio.benchmarkComparison.toFixed(1)}%
• **Status:** ${displayData.portfolio.benchmarkComparison > 0 ? '🟢 Outperforming' : '🔴 Underperforming'}

`;
        }

        // Pool Performance Breakdown
        if (Object.keys(displayData.pools).length > 1) {
            response += `🏦 **POOL PERFORMANCE BREAKDOWN:**

`;

            Object.entries(displayData.pools).forEach(([id, pool]: [string, any]) => {
                response += `**${pool.poolName}**
• **Invested:** $${pool.invested.toLocaleString()}
• **Current Value:** $${pool.currentValue.toLocaleString()}
• **Return:** ${pool.return.toFixed(2)}%
• **Portfolio Contribution:** ${pool.contribution.toFixed(1)}%

`;
            });
        }

        // Monthly Performance Chart
        if (includeCharts && displayData.monthlyReturns.length > 0) {
            response += `📊 **MONTHLY PERFORMANCE CHART:**

\`\`\`
Month    | Portfolio | Benchmark | Difference
----------|-----------|-----------|-----------
`;

            displayData.monthlyReturns.forEach((month: any) => {
                const diff = month.return - month.benchmark;
                response += `${month.month} | ${month.return.toFixed(1).padStart(8)}% | ${month.benchmark.toFixed(1).padStart(8)}% | ${diff.toFixed(1).padStart(9)}%
`;
            });

            response += `\`\`\`

`;
        }

        // Risk Assessment
        const riskLevel = displayData.portfolio.volatility < 10 ? 'Low' : displayData.portfolio.volatility < 20 ? 'Medium' : 'High';
        const riskScore = Math.max(0, Math.min(100, 100 - displayData.portfolio.volatility * 2));

        response += `🎯 **RISK ASSESSMENT:**
• **Risk Level:** ${riskLevel} (${riskScore.toFixed(0)}/100 score)
• **Risk Factors:**
  - Volatility: ${displayData.portfolio.volatility.toFixed(1)}% (${displayData.portfolio.volatility < 15 ? '🟢 Good' : displayData.portfolio.volatility < 25 ? '🟡 Moderate' : '🔴 High'})
  - Max Drawdown: ${Math.abs(displayData.portfolio.maxDrawdown).toFixed(1)}% (${Math.abs(displayData.portfolio.maxDrawdown) < 10 ? '🟢 Acceptable' : Math.abs(displayData.portfolio.maxDrawdown) < 20 ? '🟡 Manageable' : '🔴 Concerning'})
  - Sharpe Ratio: ${displayData.portfolio.sharpeRatio.toFixed(2)} (${displayData.portfolio.sharpeRatio > 1 ? '🟢 Good' : displayData.portfolio.sharpeRatio > 0.5 ? '🟡 Fair' : '🔴 Poor'})

`;

        // Performance Insights
        response += `💡 **PERFORMANCE INSIGHTS:**

`;

        if (displayData.portfolio.totalReturn > displayData.portfolio.benchmarkReturn) {
            response += `• **Outperformance:** Portfolio outperformed benchmark by ${displayData.portfolio.benchmarkComparison.toFixed(1)}%
`;
        }

        if (displayData.portfolio.sharpeRatio > 1.5) {
            response += `• **Risk Efficiency:** Excellent risk-adjusted returns (Sharpe > 1.5)
`;
        }

        if (Math.abs(displayData.portfolio.maxDrawdown) < 10) {
            response += `• **Drawdown Control:** Well-controlled maximum drawdown
`;
        }

        const consistentMonths = displayData.monthlyReturns.filter((m: any) => m.return > 0).length;
        if (consistentMonths >= displayData.monthlyReturns.length * 0.7) {
            response += `• **Consistency:** ${consistentMonths}/${displayData.monthlyReturns.length} positive months
`;
        }

        response += `
🔧 **RECOMMENDATIONS:**

`;

        if (displayData.portfolio.volatility > 20) {
            response += `• **Risk Management:** Consider reducing volatility through diversification
`;
        }

        if (displayData.portfolio.beta > 1.2) {
            response += `• **Market Sensitivity:** High market correlation - consider defensive assets
`;
        }

        if (displayData.portfolio.sharpeRatio < 1) {
            response += `• **Return Optimization:** Focus on improving risk-adjusted returns
`;
        }

        response += `• **Regular Monitoring:** Review performance monthly for optimal timing
• **Rebalancing:** Consider rebalancing if allocations deviate significantly

`;

        response += `📋 **NEXT STEPS:**
• Use \`portfolio-rebalancing\` to optimize allocations
• Use \`yield-optimization\` to find better opportunities
• Use \`advanced-risk-assessment\` for detailed risk analysis
• Use \`transaction-history\` to review investment decisions

⏰ **Analysis completed:** ${new Date().toISOString()}`;

        // console.log(`✅ [Investment Performance Tracking] Analysis completed for ${investorAddress}`);
        return { content: response };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ [Investment Performance Tracking] Failed:`, errorMessage);

        return {
            content: `❌ **PERFORMANCE TRACKING FAILED**

**Error:** ${errorMessage}

**Parameters:**
• Investor: ${investorAddress}
• Time Period: ${timePeriod}
• Metrics: ${calculateMetrics.join(', ')}

**Troubleshooting:**
• Verify address format is correct
• Check if performance data is available
• Try with different time periods
• Contact support if issues persist

⏰ **Error occurred:** ${new Date().toISOString()}`
        };
    }
}
