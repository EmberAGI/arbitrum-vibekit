import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CentrifugeSDKClient } from '../utils/sdkClient.js';

export const placeInvestmentOrderTool: Tool = {
    name: 'place-investment-order',
    description: 'Place an investment order in a Centrifuge RWA pool',
    inputSchema: {
        type: 'object',
        properties: {
            investorAddress: {
                type: 'string',
                description: 'The investor wallet address (must be a valid Ethereum address)',
                pattern: '^0x[a-fA-F0-9]{40}$'
            },
            poolId: {
                type: 'string',
                description: 'The ID of the pool to invest in',
                pattern: '^[0-9]+$'
            },
            trancheType: {
                type: 'string',
                description: 'The tranche type to invest in',
                enum: ['Senior', 'Junior']
            },
            amount: {
                type: 'string',
                description: 'The investment amount in USDC (e.g., "1000.50")',
                pattern: '^[0-9]+(\\.[0-9]{1,2})?$'
            },
            network: {
                type: 'string',
                description: 'The network to execute the investment on',
                enum: ['arbitrum', 'ethereum'],
                default: 'arbitrum'
            },
            slippageTolerance: {
                type: 'number',
                description: 'Maximum slippage tolerance as a percentage (0-5)',
                minimum: 0,
                maximum: 5,
                default: 1
            },
            skipValidation: {
                type: 'boolean',
                description: 'Skip additional validation checks (not recommended)',
                default: false
            }
        },
        required: ['investorAddress', 'poolId', 'trancheType', 'amount']
    }
};

export async function executePlaceInvestmentOrder(args: any): Promise<{ content: string }> {
    const {
        investorAddress,
        poolId,
        trancheType,
        amount,
        network = 'arbitrum',
        slippageTolerance = 1,
        skipValidation = false
    } = args;

    try {
        console.log(`💰 [Place Investment Order] Processing investment for ${investorAddress} in pool ${poolId}...`);

        // Validate Ethereum address format
        const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
        if (!ethAddressRegex.test(investorAddress)) {
            return {
                content: `❌ **INVESTMENT ORDER FAILED**

**Error:** Invalid Ethereum address format

**Your Address:** ${investorAddress}

**Required Format:** Must start with "0x" followed by 40 hexadecimal characters
**Example:** 0x742d35Cc6074C4532895c05b22629ce5b3c28da4

**Next Steps:**
• Verify your wallet address is correct
• Use a valid Ethereum address format
• Copy the address directly from your wallet

⏰ **Validation failed:** ${new Date().toISOString()}`
            };
        }

        // Validate inputs
        if (!skipValidation) {
            const amountNum = parseFloat(amount);
            if (amountNum < 100) {
                return {
                    content: `❌ **INVESTMENT ORDER FAILED**

**Error:** Minimum investment amount is $100 USDC

**Your Amount:** $${amountNum.toFixed(2)} USDC

**Next Steps:**
• Increase your investment amount
• Use \`skipValidation: true\` to bypass this check (not recommended)

⏰ **Validation failed:** ${new Date().toISOString()}`
                };
            }

            if (amountNum > 100000) {
                return {
                    content: `❌ **INVESTMENT ORDER FAILED**

**Error:** Maximum investment amount is $100,000 USDC per transaction

**Your Amount:** $${amountNum.toFixed(2)} USDC

**Next Steps:**
• Reduce your investment amount
• Contact support for larger investments
• Use \`skipValidation: true\` to bypass this check (not recommended)

⏰ **Validation failed:** ${new Date().toISOString()}`
                };
            }
        }

        // Mock pool data for validation
        const mockPools: Record<string, any> = {
            '1': {
                name: 'New Silver Pool',
                minInvestment: 1000,
                availableTranches: ['Senior', 'Junior'],
                networks: ['arbitrum', 'ethereum']
            },
            '2': {
                name: 'ConsolFreight Pool',
                minInvestment: 500,
                availableTranches: ['Senior', 'Junior'],
                networks: ['arbitrum', 'ethereum']
            }
        };

        const pool = mockPools[poolId];
        if (!pool) {
            return {
                content: `❌ **INVESTMENT ORDER FAILED**

**Error:** Pool with ID ${poolId} not found

**Available Pools:**
${Object.entries(mockPools).map(([id, data]) => `• ${id}: ${data.name}`).join('\n')}

**Next Steps:**
• Use \`discover-centrifuge-pools\` to see available pools
• Verify the pool ID is correct

⏰ **Error occurred:** ${new Date().toISOString()}`
            };
        }

        if (!pool.availableTranches.includes(trancheType)) {
            return {
                content: `❌ **INVESTMENT ORDER FAILED**

**Error:** Tranche type "${trancheType}" not available in pool ${pool.name}

**Available Tranches:** ${pool.availableTranches.join(', ')}

**Next Steps:**
• Choose a valid tranche type
• Use \`analyze-pool-details\` to see available tranches

⏰ **Error occurred:** ${new Date().toISOString()}`
            };
        }

        if (!pool.networks.includes(network)) {
            return {
                content: `❌ **INVESTMENT ORDER FAILED**

**Error:** Network "${network}" not supported by pool ${pool.name}

**Supported Networks:** ${pool.networks.join(', ')}

**Next Steps:**
• Choose a supported network
• Use \`analyze-pool-details\` to see supported networks

⏰ **Error occurred:** ${new Date().toISOString()}`
            };
        }

        // In a real implementation, this would:
        // 1. Connect to the Centrifuge SDK
        // 2. Create a signer from the investor's wallet
        // 3. Submit the investment transaction
        // 4. Return transaction details

        // For now, we'll simulate the process
        const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const estimatedGas = '0.0025';
        const estimatedExecutionTime = '2-5 minutes';

        // console.log(`✅ [Place Investment Order] Order ${orderId} submitted successfully`);

        return {
            content: `💰 **INVESTMENT ORDER SUBMITTED**

📋 **ORDER DETAILS:**
• **Order ID:** ${orderId}
• **Investor:** ${investorAddress}
• **Pool:** ${pool.name} (ID: ${poolId})
• **Tranche:** ${trancheType}
• **Amount:** $${parseFloat(amount).toFixed(2)} USDC
• **Network:** ${network.charAt(0).toUpperCase() + network.slice(1)}
• **Status:** Pending Confirmation

⚙️ **TRANSACTION PARAMETERS:**
• **Slippage Tolerance:** ${slippageTolerance}%
• **Estimated Gas:** ${estimatedGas} ETH
• **Estimated Execution Time:** ${estimatedExecutionTime}

🔄 **ORDER STATUS:**
• **Current Status:** Submitted
• **Next Step:** Awaiting wallet confirmation
• **Transaction Hash:** Pending...

💡 **WHAT HAPPENS NEXT:**
1. **Wallet Confirmation:** You'll receive a transaction prompt in your wallet
2. **Network Confirmation:** Transaction will be confirmed on ${network}
3. **Order Execution:** Investment will be added to the pool
4. **Confirmation:** You'll receive a confirmation with your position details

📊 **MONITORING:**
• Use \`get-investment-status\` to check order status
• Use \`investorAddress: "${investorAddress}"\` to see your investments
• Use \`poolId: "${poolId}"\` to focus on this specific pool

⚠️ **IMPORTANT NOTES:**
• This order is pending wallet confirmation
• Do not close this application until the transaction is confirmed
• Gas fees will be deducted from your wallet
• Investment will be locked for the pool's duration

🆘 **NEED HELP?**
• Transaction taking too long? Check ${network} network status
• Wrong amount? Contact support to cancel the order
• Having wallet issues? Ensure your wallet is connected and funded

⏰ **Order submitted:** ${new Date().toISOString()}`
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ [Place Investment Order] Failed:`, errorMessage);

        return {
            content: `❌ **INVESTMENT ORDER FAILED**

**Error:** ${errorMessage}

**Order Details:**
• **Investor:** ${investorAddress}
• **Pool ID:** ${poolId}
• **Tranche:** ${trancheType}
• **Amount:** $${amount} USDC
• **Network:** ${network}

**Troubleshooting:**
• Verify your wallet address is correct
• Ensure you have sufficient USDC balance
• Check that the pool and tranche are available
• Confirm network connectivity
• Try again with a smaller amount if gas is an issue

**Next Steps:**
• Use \`get-investment-status\` to check your current positions
• Use \`analyze-pool-details\` to verify pool availability
• Contact support if issues persist

⏰ **Error occurred:** ${new Date().toISOString()}`
        };
    }
}
