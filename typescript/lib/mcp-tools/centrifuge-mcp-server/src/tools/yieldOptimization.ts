import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CentrifugeSDKClient } from '../utils/sdkClient.js';

export const yieldOptimizationTool: Tool = {
    name: 'yield-optimization',
    description: 'Find and analyze the best yield opportunities across Centrifuge pools',
    inputSchema: {
        type: 'object',
        properties: {
            investorAddress: {
                type: 'string',
                description: 'The investor wallet address for personalized recommendations',
                pattern: '^0x[a-fA-F0-9]{40}$'
            },
            riskTolerance: {
                type: 'string',
                description: 'Risk tolerance for yield optimization',
                enum: ['conservative', 'moderate', 'aggressive'],
                default: 'moderate'
            },
            minYield: {
                type: 'number',
                description: 'Minimum yield percentage to consider',
                minimum: 0,
                maximum: 50,
                default: 5
            },
            maxRisk: {
                type: 'number',
                description: 'Maximum risk score to consider (0-100)',
                minimum: 0,
                maximum: 100,
                default: 70
            },
            investmentAmount: {
                type: 'number',
                description: 'Investment amount for yield calculations',
                minimum: 100,
                maximum: 100000,
                default: 1000
            },
            timeHorizon: {
                type: 'string',
                description: 'Investment time horizon',
                enum: ['short_term', 'medium_term', 'long_term'],
                default: 'medium_term'
            },
            includeLiquidity: {
                type: 'boolean',
                description: 'Whether to consider liquidity scores',
                default: true
            },
            maxResults: {
                type: 'number',
                description: 'Maximum number of recommendations',
                minimum: 1,
                maximum: 20,
                default: 10
            }
        }
    }
};

export async function executeYieldOptimization(args: any): Promise<{ content: string }> {
    const {
        investorAddress,
        riskTolerance = 'moderate',
        minYield = 5,
        maxRisk = 70,
        investmentAmount = 1000,
        timeHorizon = 'medium_term',
        includeLiquidity = true,
        maxResults = 10
    } = args;

    try {
        // console.log(`📈 [Yield Optimization] Finding best opportunities for ${investorAddress || 'anonymous user'}...`);

        // Validate Ethereum address if provided
        if (investorAddress) {
            const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
            if (!ethAddressRegex.test(investorAddress)) {
                return {
                    content: `❌ **YIELD OPTIMIZATION FAILED**

**Error:** Invalid Ethereum address format

**Your Address:** ${investorAddress}

**Required Format:** Must start with "0x" followed by 40 hexadecimal characters
**Example:** 0x742d35Cc6074C4532895c05b22629ce5b3c28da4

**Next Steps:**
• Verify your wallet address is correct
• Use a valid Ethereum address format
• Or omit the address for general recommendations

⏰ **Validation failed:** ${new Date().toISOString()}`
                };
            }
        }

        // Mock yield opportunities data - in production this would come from SDK
        const yieldOpportunities = [
            {
                poolId: '1',
                poolName: 'New Silver Pool',
                trancheType: 'Senior',
                yield: 8.5,
                riskScore: 65,
                liquidityScore: 75,
                tvl: 2500000,
                minInvestment: 1000,
                assetType: 'Real Estate',
                networks: ['arbitrum', 'ethereum'],
                lockupPeriod: '30 days',
                projectedAnnualReturn: 8.5,
                impermanentLoss: 'Low',
                category: 'conservative'
            },
            {
                poolId: '2',
                poolName: 'ConsolFreight Pool',
                trancheType: 'Senior',
                yield: 7.8,
                riskScore: 68,
                liquidityScore: 80,
                tvl: 1800000,
                minInvestment: 500,
                assetType: 'Trade Finance',
                networks: ['arbitrum', 'ethereum'],
                lockupPeriod: '60 days',
                projectedAnnualReturn: 7.8,
                impermanentLoss: 'Medium',
                category: 'moderate'
            },
            {
                poolId: '1',
                poolName: 'New Silver Pool',
                trancheType: 'Junior',
                yield: 12.0,
                riskScore: 85,
                liquidityScore: 75,
                tvl: 2500000,
                minInvestment: 1000,
                assetType: 'Real Estate',
                networks: ['arbitrum', 'ethereum'],
                lockupPeriod: '90 days',
                projectedAnnualReturn: 12.0,
                impermanentLoss: 'High',
                category: 'aggressive'
            },
            {
                poolId: '3',
                poolName: 'GreenEnergy Pool',
                trancheType: 'Senior',
                yield: 9.2,
                riskScore: 62,
                liquidityScore: 85,
                tvl: 3200000,
                minInvestment: 2000,
                assetType: 'Green Energy',
                networks: ['arbitrum'],
                lockupPeriod: '45 days',
                projectedAnnualReturn: 9.2,
                impermanentLoss: 'Low',
                category: 'conservative'
            },
            {
                poolId: '4',
                poolName: 'TechGrowth Pool',
                trancheType: 'Junior',
                yield: 15.5,
                riskScore: 92,
                liquidityScore: 65,
                tvl: 950000,
                minInvestment: 5000,
                assetType: 'Technology',
                networks: ['arbitrum', 'ethereum'],
                lockupPeriod: '180 days',
                projectedAnnualReturn: 15.5,
                impermanentLoss: 'Very High',
                category: 'aggressive'
            },
            {
                poolId: '5',
                poolName: 'Healthcare Fund',
                trancheType: 'Senior',
                yield: 8.8,
                riskScore: 58,
                liquidityScore: 90,
                tvl: 4100000,
                minInvestment: 1000,
                assetType: 'Healthcare',
                networks: ['arbitrum', 'ethereum'],
                lockupPeriod: '30 days',
                projectedAnnualReturn: 8.8,
                impermanentLoss: 'Low',
                category: 'conservative'
            },
            {
                poolId: '6',
                poolName: 'Logistics Chain',
                trancheType: 'Senior',
                yield: 9.5,
                riskScore: 64,
                liquidityScore: 82,
                tvl: 2750000,
                minInvestment: 1500,
                assetType: 'Supply Chain',
                networks: ['arbitrum'],
                lockupPeriod: '60 days',
                projectedAnnualReturn: 9.5,
                impermanentLoss: 'Medium',
                category: 'moderate'
            }
        ];

        // Filter opportunities based on criteria
        let filteredOpportunities = yieldOpportunities.filter(opp => {
            // Basic filters
            if (opp.yield < minYield) return false;
            if (opp.riskScore > maxRisk) return false;
            if (opp.minInvestment > investmentAmount) return false;

            // Risk tolerance filter
            if (riskTolerance === 'conservative' && opp.category === 'aggressive') return false;
            if (riskTolerance === 'moderate' && opp.category === 'aggressive' && opp.riskScore > 80) return false;

            // Liquidity filter
            if (includeLiquidity && opp.liquidityScore < 60) return false;

            return true;
        });

        // Sort by yield (highest first)
        filteredOpportunities.sort((a, b) => b.yield - a.yield);

        // Take top results
        const topOpportunities = filteredOpportunities.slice(0, maxResults);

        // Generate response
        let response = `📈 **YIELD OPTIMIZATION ANALYSIS**

`;

        if (investorAddress) {
            response += `👤 **Investor:** ${investorAddress}
`;
        }

        response += `📅 **Analysis Date:** ${new Date().toISOString().split('T')[0]}
🎯 **Risk Tolerance:** ${riskTolerance.charAt(0).toUpperCase() + riskTolerance.slice(1)}
💰 **Investment Amount:** $${investmentAmount.toLocaleString()}
⏰ **Time Horizon:** ${timeHorizon.replace('_', ' ').toUpperCase()}

🔍 **FILTERS APPLIED:**
• **Minimum Yield:** ${minYield}%
• **Maximum Risk:** ${maxRisk}/100
• **Include Liquidity:** ${includeLiquidity ? 'Yes' : 'No'}

📊 **TOP YIELD OPPORTUNITIES:**

`;

        if (topOpportunities.length === 0) {
            response += `❌ **NO SUITABLE OPPORTUNITIES FOUND**

**Possible Reasons:**
• Your criteria are too restrictive
• No pools match your risk tolerance
• Investment amount too low for available pools

**Suggestions:**
• Increase minimum yield threshold
• Adjust risk tolerance
• Increase investment amount
• Remove liquidity requirements

`;
        } else {
            topOpportunities.forEach((opp, index) => {
                const annualReturn = (investmentAmount * opp.yield / 100).toFixed(2);
                const riskLevel = opp.riskScore < 60 ? 'Low' : opp.riskScore < 80 ? 'Medium' : 'High';

                response += `**${index + 1}. ${opp.poolName} (${opp.trancheType})**
• **Yield:** ${opp.yield}% APY
• **Annual Return:** $${annualReturn} (on $${investmentAmount.toLocaleString()})
• **Risk Score:** ${opp.riskScore}/100 (${riskLevel})
• **Liquidity:** ${opp.liquidityScore}/100
• **Asset Type:** ${opp.assetType}
• **Min Investment:** $${opp.minInvestment.toLocaleString()}
• **TVL:** $${opp.tvl.toLocaleString()}
• **Lockup Period:** ${opp.lockupPeriod}
• **Networks:** ${opp.networks.join(', ')}
• **Impermanent Loss Risk:** ${opp.impermanentLoss}

`;
            });
        }

        response += `📈 **PERFORMANCE METRICS:**

**By Risk Level:**
• Conservative (Risk < 60): ${topOpportunities.filter(o => o.riskScore < 60).length} opportunities
• Moderate (Risk 60-80): ${topOpportunities.filter(o => o.riskScore >= 60 && o.riskScore <= 80).length} opportunities
• Aggressive (Risk > 80): ${topOpportunities.filter(o => o.riskScore > 80).length} opportunities

**Average Yield by Category:**
• Conservative: ${Number((topOpportunities.filter(o => o.category === 'conservative').reduce((sum, o) => sum + o.yield, 0) / Math.max(1, topOpportunities.filter(o => o.category === 'conservative').length)).toFixed(1))}%
• Moderate: ${Number((topOpportunities.filter(o => o.category === 'moderate').reduce((sum, o) => sum + o.yield, 0) / Math.max(1, topOpportunities.filter(o => o.category === 'moderate').length)).toFixed(1))}%
• Aggressive: ${Number((topOpportunities.filter(o => o.category === 'aggressive').reduce((sum, o) => sum + o.yield, 0) / Math.max(1, topOpportunities.filter(o => o.category === 'aggressive').length)).toFixed(1))}%

💡 **IMPLEMENTATION STEPS:**

1. **Review Opportunities:** Compare yields, risks, and lockup periods
2. **Check Eligibility:** Ensure you meet minimum investment requirements
3. **Due Diligence:** Use \`analyze-pool-details\` for deeper analysis
4. **Execute Investment:** Use \`place-investment-order\` to invest
5. **Monitor Performance:** Use \`get-investment-status\` to track returns

⚠️ **IMPORTANT CONSIDERATIONS:**
• Higher yields typically come with higher risks
• Consider lockup periods and liquidity needs
• Diversification reduces overall portfolio risk
• Past performance doesn't guarantee future results
• Always do your own research

🆘 **NEED MORE ANALYSIS?**
• Use \`analyze-pool-details\` for specific pool information
• Use \`portfolio-rebalancing\` for allocation optimization
• Use \`get-investment-status\` to check existing positions

⏰ **Analysis completed:** ${new Date().toISOString()}`;

        // console.log(`✅ [Yield Optimization] Found ${topOpportunities.length} opportunities`);
        return { content: response };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        // console.error(`❌ [Yield Optimization] Failed:`, errorMessage);

        return {
            content: `❌ **YIELD OPTIMIZATION FAILED**

**Error:** ${errorMessage}

**Parameters:**
• Risk Tolerance: ${riskTolerance}
• Min Yield: ${minYield}%
• Max Risk: ${maxRisk}
• Investment Amount: $${investmentAmount}

**Troubleshooting:**
• Adjust filter criteria if too restrictive
• Check network connectivity
• Verify investment amount meets pool requirements
• Try again with different parameters

**Next Steps:**
• Use \`discover-centrifuge-pools\` for basic pool discovery
• Contact support if issues persist

⏰ **Error occurred:** ${new Date().toISOString()}`
        };
    }
}
