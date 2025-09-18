import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CentrifugeSDKClient } from '../utils/sdkClient.js';

export const portfolioRebalancingTool: Tool = {
    name: 'portfolio-rebalancing',
    description: 'Analyze and suggest portfolio rebalancing strategies for Centrifuge investments',
    inputSchema: {
        type: 'object',
        properties: {
            investorAddress: {
                type: 'string',
                description: 'The investor wallet address to analyze',
                pattern: '^0x[a-fA-F0-9]{40}$'
            },
            riskTolerance: {
                type: 'string',
                description: 'Risk tolerance level for rebalancing strategy',
                enum: ['conservative', 'moderate', 'aggressive'],
                default: 'moderate'
            },
            targetAllocations: {
                type: 'object',
                description: 'Target allocation percentages for different tranches',
                properties: {
                    senior: {
                        type: 'number',
                        description: 'Target percentage for Senior tranche (low risk)',
                        minimum: 0,
                        maximum: 100,
                        default: 60
                    },
                    junior: {
                        type: 'number',
                        description: 'Target percentage for Junior tranche (high risk)',
                        minimum: 0,
                        maximum: 100,
                        default: 40
                    }
                }
            },
            includeNewPools: {
                type: 'boolean',
                description: 'Whether to include new pool recommendations',
                default: true
            },
            maxRecommendations: {
                type: 'number',
                description: 'Maximum number of rebalancing recommendations',
                minimum: 1,
                maximum: 10,
                default: 5
            }
        },
        required: ['investorAddress']
    }
};

export async function executePortfolioRebalancing(args: any): Promise<{ content: string }> {
    const {
        investorAddress,
        riskTolerance = 'moderate',
        targetAllocations = { senior: 60, junior: 40 },
        includeNewPools = true,
        maxRecommendations = 5
    } = args;

    try {
        console.log(`⚖️ [Portfolio Rebalancing] Analyzing portfolio for ${investorAddress}...`);

        // Validate Ethereum address format
        const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
        if (!ethAddressRegex.test(investorAddress)) {
            return {
                content: `❌ **PORTFOLIO ANALYSIS FAILED**

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

        // Validate target allocations
        const totalAllocation = targetAllocations.senior + targetAllocations.junior;
        if (Math.abs(totalAllocation - 100) > 0.1) {
            return {
                content: `❌ **PORTFOLIO ANALYSIS FAILED**

**Error:** Target allocations must total 100%

**Your Allocations:**
• Senior: ${targetAllocations.senior}%
• Junior: ${targetAllocations.junior}%
• Total: ${totalAllocation}%

**Required:** Senior + Junior = 100%

**Next Steps:**
• Adjust allocation percentages
• Ensure they add up to exactly 100%

⏰ **Validation failed:** ${new Date().toISOString()}`
            };
        }

        // Mock current portfolio data - in production this would come from the SDK
        const mockPortfolio = {
            totalValue: 7500.00,
            positions: [
                {
                    poolId: '1',
                    poolName: 'New Silver Pool',
                    trancheType: 'Senior',
                    invested: 5000.00,
                    currentValue: 5125.00,
                    yield: 8.5,
                    riskLevel: 'Low'
                },
                {
                    poolId: '2',
                    poolName: 'ConsolFreight Pool',
                    trancheType: 'Junior',
                    invested: 2500.00,
                    currentValue: 2650.00,
                    yield: 10.5,
                    riskLevel: 'Medium'
                }
            ],
            performance: {
                totalReturn: 6.33,
                seniorAllocation: 66.7,
                juniorAllocation: 33.3,
                averageYield: 9.0
            }
        };

        // Calculate current allocations
        const seniorValue = mockPortfolio.positions
            .filter(p => p.trancheType === 'Senior')
            .reduce((sum, p) => sum + p.currentValue, 0);

        const juniorValue = mockPortfolio.positions
            .filter(p => p.trancheType === 'Junior')
            .reduce((sum, p) => sum + p.currentValue, 0);

        const currentSeniorPct = (seniorValue / mockPortfolio.totalValue) * 100;
        const currentJuniorPct = (juniorValue / mockPortfolio.totalValue) * 100;

        // Calculate rebalancing needs
        const seniorTarget = targetAllocations.senior;
        const juniorTarget = targetAllocations.junior;

        const seniorAdjustment = seniorTarget - currentSeniorPct;
        const juniorAdjustment = juniorTarget - currentJuniorPct;

        // Generate rebalancing recommendations
        const recommendations = [];

        if (Math.abs(seniorAdjustment) > 5) {
            const adjustmentAmount = Math.abs(mockPortfolio.totalValue * seniorAdjustment / 100);
            const action = seniorAdjustment > 0 ? 'increase' : 'decrease';

            recommendations.push({
                type: 'allocation_adjustment',
                tranche: 'Senior',
                action,
                amount: adjustmentAmount,
                reason: `Current ${currentSeniorPct.toFixed(1)}% vs target ${seniorTarget}%`,
                priority: Math.abs(seniorAdjustment) > 10 ? 'High' : 'Medium'
            });
        }

        if (Math.abs(juniorAdjustment) > 5) {
            const adjustmentAmount = Math.abs(mockPortfolio.totalValue * juniorAdjustment / 100);
            const action = juniorAdjustment > 0 ? 'increase' : 'decrease';

            recommendations.push({
                type: 'allocation_adjustment',
                tranche: 'Junior',
                action,
                amount: adjustmentAmount,
                reason: `Current ${currentJuniorPct.toFixed(1)}% vs target ${juniorTarget}%`,
                priority: Math.abs(juniorAdjustment) > 10 ? 'High' : 'Medium'
            });
        }

        // Add yield optimization recommendations
        if (includeNewPools) {
            const yieldOpportunities = [
                {
                    poolId: '3',
                    poolName: 'GreenEnergy Pool',
                    trancheType: 'Senior',
                    yield: 9.2,
                    riskLevel: 'Low',
                    reason: 'Higher yield than current senior positions'
                },
                {
                    poolId: '4',
                    poolName: 'TechGrowth Pool',
                    trancheType: 'Junior',
                    yield: 12.0,
                    riskLevel: 'High',
                    reason: 'Superior yield for risk-tolerant investors'
                }
            ];

            yieldOpportunities.forEach(opp => {
                if (recommendations.length < maxRecommendations) {
                    recommendations.push({
                        type: 'yield_optimization',
                        poolId: opp.poolId,
                        poolName: opp.poolName,
                        trancheType: opp.trancheType,
                        yield: opp.yield,
                        reason: opp.reason,
                        priority: opp.yield > 10 ? 'High' : 'Medium'
                    });
                }
            });
        }

        // Generate response
        let response = `⚖️ **PORTFOLIO REBALANCING ANALYSIS**

👤 **Investor:** ${investorAddress}
📅 **Analysis Date:** ${new Date().toISOString().split('T')[0]}
🎯 **Risk Tolerance:** ${riskTolerance.charAt(0).toUpperCase() + riskTolerance.slice(1)}

📊 **CURRENT PORTFOLIO:**
• **Total Value:** $${mockPortfolio.totalValue.toFixed(2)}
• **Total Return:** ${mockPortfolio.performance.totalReturn.toFixed(2)}%
• **Senior Allocation:** ${currentSeniorPct.toFixed(1)}% (Target: ${seniorTarget}%)
• **Junior Allocation:** ${currentJuniorPct.toFixed(1)}% (Target: ${juniorTarget}%)

🏦 **CURRENT POSITIONS:**
`;

        mockPortfolio.positions.forEach((position, index) => {
            response += `**${index + 1}. ${position.poolName} (${position.trancheType})**
• **Invested:** $${position.invested.toFixed(2)}
• **Current Value:** $${position.currentValue.toFixed(2)}
• **Yield:** ${position.yield}%
• **Risk Level:** ${position.riskLevel}
• **Return:** ${(((position.currentValue - position.invested) / position.invested) * 100).toFixed(2)}%

`;
        });

        response += `🎯 **REBALANCING RECOMMENDATIONS:**

`;

        if (recommendations.length === 0) {
            response += `✅ **PORTFOLIO IS WELL-BALANCED**

Your current allocations are within acceptable ranges of your targets.
No immediate rebalancing actions are recommended.

`;
        } else {
            recommendations.slice(0, maxRecommendations).forEach((rec, index) => {
                response += `**${index + 1}. ${rec.priority} Priority - ${rec.type.replace('_', ' ').toUpperCase()}**
`;

                if (rec.type === 'allocation_adjustment') {
                    response += `• **Action:** ${rec.action.toUpperCase()} ${rec.tranche} allocation
• **Amount:** $${rec.amount.toFixed(2)}
• **Reason:** ${rec.reason}
• **Impact:** ${rec.action === 'increase' ? 'Reduces' : 'Increases'} portfolio risk

`;
                } else if (rec.type === 'yield_optimization') {
                    // For yield optimization recommendations, we need to look up the pool data
                    response += `• **Action:** Consider yield optimization opportunities
• **Reason:** ${rec.reason}
• **Priority:** ${rec.priority}

`;
                }
            });
        }

        response += `📈 **IMPLEMENTATION STEPS:**

1. **Review Recommendations:** Assess which changes align with your goals
2. **Execute Adjustments:** Use \`place-investment-order\` for new positions
3. **Monitor Changes:** Use \`get-investment-status\` to track progress
4. **Reassess Regularly:** Portfolio needs change over time

⚠️ **RISK CONSIDERATIONS:**
• Rebalancing may incur gas fees
• Market conditions can change quickly
• Consider tax implications of adjustments
• Diversification reduces but doesn't eliminate risk

💡 **NEXT STEPS:**
• Use \`place-investment-order\` to implement recommendations
• Use \`analyze-pool-details\` to research recommended pools
• Use \`get-investment-status\` to monitor portfolio changes

⏰ **Analysis completed:** ${new Date().toISOString()}`;

        // console.log(`✅ [Portfolio Rebalancing] Analysis completed for ${investorAddress}`);
        return { content: response };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ [Portfolio Rebalancing] Failed:`, errorMessage);

        return {
            content: `❌ **PORTFOLIO ANALYSIS FAILED**

**Error:** ${errorMessage}

**Investor Address:** ${investorAddress}

**Troubleshooting:**
• Verify address format is correct
• Check network connectivity
• Ensure portfolio data is accessible
• Try again in a few minutes

**Next Steps:**
• Use \`get-investment-status\` to verify portfolio access
• Contact support if issues persist

⏰ **Error occurred:** ${new Date().toISOString()}`
        };
    }
}
