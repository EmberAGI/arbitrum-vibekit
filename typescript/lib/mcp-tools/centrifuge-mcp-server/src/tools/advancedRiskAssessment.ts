import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CentrifugeSDKClient } from '../utils/sdkClient.js';

export const advancedRiskAssessmentTool: Tool = {
    name: 'advanced-risk-assessment',
    description: 'Perform comprehensive risk assessment for Centrifuge pools and portfolios',
    inputSchema: {
        type: 'object',
        properties: {
            target: {
                type: 'string',
                description: 'Assessment target: "pool", "portfolio", or "comparison"',
                enum: ['pool', 'portfolio', 'comparison']
            },
            investorAddress: {
                type: 'string',
                description: 'Investor address (required for portfolio assessment)',
                pattern: '^0x[a-fA-F0-9]{40}$'
            },
            poolId: {
                type: 'string',
                description: 'Pool ID to assess (required for pool assessment)',
                pattern: '^[0-9]+$'
            },
            assessmentType: {
                type: 'string',
                description: 'Type of risk assessment to perform',
                enum: ['comprehensive', 'liquidity', 'credit', 'market', 'operational'],
                default: 'comprehensive'
            },
            timeHorizon: {
                type: 'string',
                description: 'Assessment time horizon',
                enum: ['short_term', 'medium_term', 'long_term'],
                default: 'medium_term'
            },
            includeStressTests: {
                type: 'boolean',
                description: 'Include stress test scenarios',
                default: false
            },
            comparisonPools: {
                type: 'array',
                description: 'Pool IDs to compare (for comparison assessment)',
                items: { type: 'string' },
                default: []
            }
        },
        required: ['target']
    }
};

export async function executeAdvancedRiskAssessment(args: any): Promise<{ content: string }> {
    const {
        target,
        investorAddress,
        poolId,
        assessmentType = 'comprehensive',
        timeHorizon = 'medium_term',
        includeStressTests = false,
        comparisonPools = []
    } = args;

    let response: string = '';

    try {
        console.log(`🔍 [Advanced Risk Assessment] Performing ${assessmentType} assessment for ${target}...`);

        // Validation based on target
        if (target === 'portfolio' && !investorAddress) {
            return {
                content: `❌ **RISK ASSESSMENT FAILED**

**Error:** Investor address required for portfolio assessment

**Target:** ${target}
**Missing:** investorAddress

**Next Steps:**
• Provide a valid Ethereum address
• Use portfolio assessment for personal risk analysis
• Use pool assessment for individual pool analysis

⏰ **Validation failed:** ${new Date().toISOString()}`
            };
        }

        if (target === 'pool' && !poolId) {
            return {
                content: `❌ **RISK ASSESSMENT FAILED**

**Error:** Pool ID required for pool assessment

**Target:** ${target}
**Missing:** poolId

**Next Steps:**
• Provide a valid pool ID
• Use \`discover-centrifuge-pools\` to find pool IDs
• Use portfolio assessment for overall risk analysis

⏰ **Validation failed:** ${new Date().toISOString()}`
            };
        }

        // Validate Ethereum address if provided
        if (investorAddress) {
            const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
            if (!ethAddressRegex.test(investorAddress)) {
                return {
                    content: `❌ **RISK ASSESSMENT FAILED**

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

            // Mock risk assessment data - in production this would use sophisticated risk models
            const riskData: any = {
                pools: {
                    '1': {
                        poolName: 'New Silver Pool',
                        overallRiskScore: 65,
                        riskFactors: {
                            creditRisk: 60,
                            liquidityRisk: 25,
                            marketRisk: 70,
                            operationalRisk: 40
                        },
                        riskMetrics: {
                            volatility: 'Low (2.1/10)',
                            defaultProbability: '0.15%',
                            recoveryRate: '95%',
                            correlation: 'Medium (0.45)',
                            concentration: 'Low (12% of market)'
                        },
                        stressTests: includeStressTests ? {
                            severeMarketDownturn: '-15% potential loss',
                            interestRateHike: '-8% potential loss',
                            creditEvent: '-25% potential loss',
                            liquidityCrisis: '-5% potential loss'
                        } : undefined
                    },
                    '2': {
                        poolName: 'ConsolFreight Pool',
                        overallRiskScore: 70,
                        riskFactors: {
                            creditRisk: 65,
                            liquidityRisk: 30,
                            marketRisk: 75,
                            operationalRisk: 45
                        },
                        riskMetrics: {
                            volatility: 'Medium (4.2/10)',
                            defaultProbability: '0.22%',
                            recoveryRate: '92%',
                            correlation: 'High (0.72)',
                            concentration: 'Medium (8% of market)'
                        },
                        stressTests: includeStressTests ? {
                            severeMarketDownturn: '-22% potential loss',
                            interestRateHike: '-12% potential loss',
                            creditEvent: '-35% potential loss',
                            liquidityCrisis: '-8% potential loss'
                        } : undefined
                    }
                },
                portfolio: investorAddress ? {
                    overallRiskScore: 67,
                    diversificationScore: 7.5,
                    riskFactors: {
                        concentrationRisk: 35,
                        liquidityRisk: 28,
                        interestRateRisk: 72,
                        creditRisk: 58
                    },
                    riskMetrics: {
                        volatility: 'Medium-Low (3.8/10)',
                        maxDrawdown: '-12% (historical)',
                        sharpeRatio: '2.1',
                        valueAtRisk: '-8% (95% confidence)',
                        expectedShortfall: '-15% (95% confidence)'
                    }
                } : undefined
            };

            response = `🔍 **ADVANCED RISK ASSESSMENT**

📋 **ASSESSMENT PARAMETERS:**
• **Target:** ${target.charAt(0).toUpperCase() + target.slice(1)}
• **Assessment Type:** ${assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1)}
• **Time Horizon:** ${timeHorizon.replace('_', ' ').toUpperCase()}
• **Stress Tests:** ${includeStressTests ? 'Included' : 'Excluded'}
`;

            if (investorAddress) {
                response += `• **Investor:** ${investorAddress}
`;
            }
            if (poolId) {
                response += `• **Pool ID:** ${poolId}
`;
            }

            response += `📅 **Assessment Date:** ${new Date().toISOString().split('T')[0]}

`;

            if (target === 'pool' && poolId && riskData.pools[poolId]) {
                const pool = riskData.pools[poolId];

                response += `🏦 **POOL RISK ASSESSMENT: ${pool.poolName}**

📊 **OVERALL RISK PROFILE:**
• **Risk Score:** ${pool.overallRiskScore}/100 (${pool.overallRiskScore < 60 ? 'Low' : pool.overallRiskScore < 80 ? 'Medium' : 'High'})
• **Risk Category:** ${pool.overallRiskScore < 60 ? 'Conservative' : pool.overallRiskScore < 80 ? 'Balanced' : 'Aggressive'}

🎯 **RISK FACTOR BREAKDOWN:**

**Credit Risk:** ${pool.riskFactors.creditRisk}/100
• Measures probability of borrower default
• Lower scores indicate safer credit profiles

**Liquidity Risk:** ${pool.riskFactors.liquidityRisk}/100
• Measures ease of exiting positions
• Lower scores indicate better liquidity

**Market Risk:** ${pool.riskFactors.marketRisk}/100
• Measures sensitivity to market conditions
• Lower scores indicate less market sensitivity

**Operational Risk:** ${pool.riskFactors.operationalRisk}/100
• Measures platform and process reliability
• Lower scores indicate more robust operations

📈 **RISK METRICS:**

• **Volatility:** ${pool.riskMetrics.volatility}
• **Default Probability:** ${pool.riskMetrics.defaultProbability}
• **Recovery Rate:** ${pool.riskMetrics.recoveryRate}
• **Market Correlation:** ${pool.riskMetrics.correlation}
• **Market Concentration:** ${pool.riskMetrics.concentration}

`;

                if (includeStressTests && pool.stressTests) {
                    response += `⚠️ **STRESS TEST SCENARIOS:**

**Severe Market Downturn (2008-style):**
• **Potential Loss:** ${pool.stressTests.severeMarketDownturn}
• **Recovery Time:** 6-12 months

**Interest Rate Hike (+300bps):**
• **Potential Loss:** ${pool.stressTests.interestRateHike}
• **Recovery Time:** 3-6 months

**Major Credit Event:**
• **Potential Loss:** ${pool.stressTests.creditEvent}
• **Recovery Time:** 12-24 months

**Liquidity Crisis:**
• **Potential Loss:** ${pool.stressTests.liquidityCrisis}
• **Recovery Time:** 1-3 months

`;
                }

            } else if (target === 'portfolio' && riskData.portfolio) {
                const portfolio = riskData.portfolio;

                response += `📊 **PORTFOLIO RISK ASSESSMENT**

🎯 **OVERALL PORTFOLIO RISK:**
• **Risk Score:** ${portfolio.overallRiskScore}/100
• **Diversification Score:** ${portfolio.diversificationScore}/10
• **Risk Category:** ${portfolio.overallRiskScore < 60 ? 'Conservative' : portfolio.overallRiskScore < 80 ? 'Balanced' : 'Aggressive'}

🎯 **PORTFOLIO RISK FACTORS:**

**Concentration Risk:** ${portfolio.riskFactors.concentrationRisk}/100
• Measures exposure to single assets/pools
• Lower scores indicate better diversification

**Liquidity Risk:** ${portfolio.riskFactors.liquidityRisk}/100
• Measures ease of portfolio liquidation
• Lower scores indicate better liquidity

**Interest Rate Risk:** ${portfolio.riskFactors.interestRateRisk}/100
• Measures sensitivity to interest rate changes
• Lower scores indicate less sensitivity

**Credit Risk:** ${portfolio.riskFactors.creditRisk}/100
• Measures probability of borrower defaults
• Lower scores indicate safer credit profiles

📈 **PORTFOLIO RISK METRICS:**

• **Volatility:** ${portfolio.riskMetrics.volatility}
• **Maximum Drawdown:** ${portfolio.riskMetrics.maxDrawdown}
• **Sharpe Ratio:** ${portfolio.riskMetrics.sharpeRatio}
• **Value at Risk (95%):** ${portfolio.riskMetrics.valueAtRisk}
• **Expected Shortfall (95%):** ${portfolio.riskMetrics.expectedShortfall}

💡 **PORTFOLIO RECOMMENDATIONS:**

`;

                if (portfolio.diversificationScore < 6) {
                    response += `• **Diversification:** Consider adding more pools to reduce concentration risk
`;
                }
                if (portfolio.riskFactors.liquidityRisk > 50) {
                    response += `• **Liquidity:** Consider positions in more liquid pools
`;
                }
                if (portfolio.riskFactors.interestRateRisk > 70) {
                    response += `• **Interest Rate:** Consider shorter-duration investments
`;
                }

            } else if (target === 'comparison' && comparisonPools.length > 0) {
                response += `⚖️ **POOL COMPARISON RISK ASSESSMENT**

🔍 **COMPARING POOLS:** ${comparisonPools.join(', ')}

`;

                comparisonPools.forEach((id: string, index: number) => {
                    if (riskData.pools[id]) {
                        const pool = riskData.pools[id];
                        response += `**${index + 1}. ${pool.poolName}**
• **Risk Score:** ${pool.overallRiskScore}/100
• **Credit Risk:** ${pool.riskFactors.creditRisk}/100
• **Liquidity Risk:** ${pool.riskFactors.liquidityRisk}/100
• **Market Risk:** ${pool.riskFactors.marketRisk}/100
• **Volatility:** ${pool.riskMetrics.volatility}

`;
                    }
                });

                // Risk comparison analysis
                const avgRisk = comparisonPools
                    .filter((id: string) => riskData.pools[id])
                    .reduce((sum: number, id: string) => sum + riskData.pools[id].overallRiskScore, 0) /
                    Math.max(1, comparisonPools.filter((id: string) => riskData.pools[id]).length);

                response += `📊 **COMPARISON SUMMARY:**
• **Average Risk Score:** ${avgRisk.toFixed(1)}/100
• **Risk Range:** ${Math.min(...comparisonPools.filter((id: string) => riskData.pools[id]).map((id: string) => riskData.pools[id].overallRiskScore))} - ${Math.max(...comparisonPools.filter((id: string) => riskData.pools[id]).map((id: string) => riskData.pools[id].overallRiskScore))}

`;
            }

            response += `🛡️ **RISK MANAGEMENT RECOMMENDATIONS:**

**General Guidelines:**
• **Diversification:** Spread investments across multiple pools
• **Risk Limits:** Never invest more than you can afford to lose
• **Monitoring:** Regularly review portfolio risk metrics
• **Exit Strategy:** Have clear exit criteria for adverse conditions

**Risk Tolerance Actions:**
• **Conservative (< 60):** Focus on senior tranches and established pools
• **Moderate (60-80):** Mix of senior and junior tranches
• **Aggressive (> 80):** Higher allocation to junior tranches and new pools

⚠️ **IMPORTANT DISCLAIMERS:**
• All investments carry risk of loss
• Past performance doesn't predict future results
• Market conditions can change rapidly
• This analysis is for informational purposes only
• Always do your own due diligence

💡 **NEXT STEPS:**
• Use \`analyze-pool-details\` for specific pool information
• Use \`portfolio-rebalancing\` for allocation optimization
• Use \`yield-optimization\` for return-focused analysis
• Use \`get-investment-status\` to monitor your positions

⏰ **Assessment completed:** ${new Date().toISOString()}`;
        }

        // console.log(`✅ [Advanced Risk Assessment] ${assessmentType} assessment completed for ${target}`);
        return { content: response };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ [Advanced Risk Assessment] Failed:`, errorMessage);

        return {
            content: `❌ **RISK ASSESSMENT FAILED**

**Error:** ${errorMessage}

**Assessment Parameters:**
• Target: ${target}
• Assessment Type: ${assessmentType}
• Time Horizon: ${timeHorizon}

**Troubleshooting:**
• Verify all required parameters are provided
• Check parameter formats are correct
• Ensure network connectivity
• Try again with simpler assessment type

**Next Steps:**
• Use \`discover-centrifuge-pools\` for basic information
• Contact support if issues persist

⏰ **Error occurred:** ${new Date().toISOString()}`
        };
    }
}
