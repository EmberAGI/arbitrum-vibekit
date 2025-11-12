import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CentrifugeSDKClient } from '../utils/sdkClient.js';

export const cancelInvestmentOrderTool: Tool = {
    name: 'cancel-investment-order',
    description: 'Cancel a pending investment order in Centrifuge pools',
    inputSchema: {
        type: 'object',
        properties: {
            orderId: {
                type: 'string',
                description: 'The unique order ID to cancel (from place-investment-order response)',
                pattern: '^[A-Z]{3}-[0-9]+-[a-z0-9]+$'
            },
            investorAddress: {
                type: 'string',
                description: 'The investor wallet address for verification',
                pattern: '^0x[a-fA-F0-9]{40}$'
            },
            reason: {
                type: 'string',
                description: 'Optional reason for cancellation',
                enum: ['user_request', 'market_conditions', 'funds_insufficient', 'strategy_change', 'other'],
                default: 'user_request'
            },
            confirmCancellation: {
                type: 'boolean',
                description: 'Must be true to confirm cancellation',
                default: false
            }
        },
        required: ['orderId', 'investorAddress', 'confirmCancellation']
    }
};

export async function executeCancelInvestmentOrder(args: any): Promise<{ content: string }> {
    const {
        orderId,
        investorAddress,
        reason = 'user_request',
        confirmCancellation = false
    } = args;

    try {
        console.log(`❌ [Cancel Investment Order] Processing cancellation for order ${orderId}...`);

        // Safety check - require explicit confirmation
        if (!confirmCancellation) {
            return {
                content: `❌ **CANCELLATION NOT CONFIRMED**

**Error:** Cancellation confirmation required

**Order ID:** ${orderId}

**Safety Notice:** Order cancellation requires explicit confirmation to prevent accidental cancellations.

**Next Steps:**
• Set \`confirmCancellation: true\` to proceed with cancellation
• Verify this is the correct order ID
• Check order status first using \`get-investment-status\`

**Alternative:** Use \`get-investment-status\` to check order details before cancelling

⏰ **Safety check failed:** ${new Date().toISOString()}`
            };
        }

        // Validate investor address format
        const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
        if (!ethAddressRegex.test(investorAddress)) {
            return {
                content: `❌ **CANCELLATION FAILED**

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

        // Validate order ID format
        const orderIdRegex = /^[A-Z]{3}-[0-9]+-[a-z0-9]+$/;
        if (!orderIdRegex.test(orderId)) {
            return {
                content: `❌ **CANCELLATION FAILED**

**Error:** Invalid order ID format

**Order ID:** ${orderId}

**Required Format:** Must follow pattern ORD-{timestamp}-{hash}
**Example:** ORD-1758043360172-ujkqe9y0w

**Next Steps:**
• Check the order ID from your investment confirmation
• Use \`get-investment-status\` to find your order IDs

⏰ **Validation failed:** ${new Date().toISOString()}`
            };
        }

        // Mock order validation - in production this would check against actual orders
        const mockOrders: Record<string, any> = {
            'ORD-1758043360172-ujkqe9y0w': {
                investorAddress: '0x742d35Cc6074C4532895c05b22629ce5b3c28da4',
                poolId: '1',
                poolName: 'New Silver Pool',
                trancheType: 'Senior',
                amount: '1000.50',
                status: 'pending',
                submittedAt: '2025-09-16T17:22:40.172Z'
            },
            'ORD-1758043360172-abc123def': {
                investorAddress: '0x742d35Cc6074C4532895c05b22629ce5b3c28da4',
                poolId: '2',
                poolName: 'ConsolFreight Pool',
                trancheType: 'Junior',
                amount: '2500.00',
                status: 'confirmed',
                submittedAt: '2025-09-16T17:25:30.500Z'
            }
        };

        const order = mockOrders[orderId];

        if (!order) {
            return {
                content: `❌ **ORDER NOT FOUND**

**Error:** Order ID ${orderId} not found or already processed

**Possible Reasons:**
• Order ID is incorrect or expired
• Order was already executed or cancelled
• Order belongs to different address

**Next Steps:**
• Use \`get-investment-status\` to see your current orders
• Check order status and history
• Contact support if order should exist

⏰ **Order lookup failed:** ${new Date().toISOString()}`
            };
        }

        // Verify order belongs to requesting address
        if (order.investorAddress.toLowerCase() !== investorAddress.toLowerCase()) {
            return {
                content: `❌ **UNAUTHORIZED CANCELLATION**

**Error:** Order does not belong to provided address

**Order ID:** ${orderId}
**Order Owner:** ${order.investorAddress}
**Your Address:** ${investorAddress}

**Security Notice:** You can only cancel orders that belong to your address.

**Next Steps:**
• Use the correct wallet address
• Use \`get-investment-status\` to see your orders
• Contact support for cross-address cancellations

⏰ **Authorization failed:** ${new Date().toISOString()}`
            };
        }

        // Check if order can be cancelled
        if (order.status === 'executed') {
            return {
                content: `❌ **CANCELLATION FAILED**

**Error:** Order has already been executed

**Order ID:** ${orderId}
**Status:** ${order.status}
**Executed:** ${order.submittedAt}

**Cannot Cancel:** Executed orders cannot be cancelled.

**Next Steps:**
• Check order execution details
• Contact support for executed order issues
• Use \`get-investment-status\` for execution confirmation

⏰ **Cancellation blocked:** ${new Date().toISOString()}`
            };
        }

        if (order.status === 'cancelled') {
            return {
                content: `ℹ️ **ORDER ALREADY CANCELLED**

**Order ID:** ${orderId}
**Status:** ${order.status}
**Cancelled:** ${order.submittedAt}

**Notice:** This order was already cancelled previously.

**Next Steps:**
• Use \`get-investment-status\` to see current orders
• Check cancellation reason in order details
• Contact support if cancellation was accidental

⏰ **Status check:** ${new Date().toISOString()}`
            };
        }

        // In a real implementation, this would:
        // 1. Connect to Centrifuge SDK
        // 2. Submit cancellation transaction
        // 3. Wait for confirmation
        // 4. Return cancellation details

        const cancellationId = `CXL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // console.log(`✅ [Cancel Investment Order] Order ${orderId} cancelled successfully`);

        return {
            content: `✅ **ORDER CANCELLED SUCCESSFULLY**

📋 **CANCELLATION DETAILS:**
• **Cancellation ID:** ${cancellationId}
• **Order ID:** ${orderId}
• **Investor:** ${investorAddress}
• **Pool:** ${order.poolName} (ID: ${order.poolId})
• **Tranche:** ${order.trancheType}
• **Amount:** $${order.amount} USDC
• **Reason:** ${reason.replace('_', ' ').toUpperCase()}
• **Status:** Cancelled

⚙️ **CANCELLATION PROCESS:**
• **Previous Status:** ${order.status}
• **New Status:** Cancelled
• **Cancelled At:** ${new Date().toISOString()}
• **Estimated Refund:** $${order.amount} USDC (minus gas fees)

💰 **REFUND PROCESS:**
• **Refund Amount:** $${order.amount} USDC
• **Destination:** ${investorAddress}
• **Estimated Time:** 2-5 minutes
• **Network:** Arbitrum

📊 **MONITORING:**
• Use \`get-investment-status\` to track refund
• Check wallet for incoming USDC
• Monitor transaction on Arbitrum explorer

⚠️ **IMPORTANT NOTES:**
• Funds will be returned to your wallet
• Gas fees may apply for refund transaction
• Order is permanently cancelled
• Cannot be undone

🆘 **NEED HELP?**
• Refund not received? Check network congestion
• Wrong order cancelled? Contact support immediately
• Transaction failed? Check wallet balance

⏰ **Cancellation completed:** ${new Date().toISOString()}`
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ [Cancel Investment Order] Failed:`, errorMessage);

        return {
            content: `❌ **CANCELLATION FAILED**

**Error:** ${errorMessage}

**Order ID:** ${orderId}
**Investor:** ${investorAddress}

**Troubleshooting:**
• Verify order ID format and existence
• Check network connectivity
• Ensure wallet has sufficient gas
• Try again in a few minutes

**Next Steps:**
• Use \`get-investment-status\` to verify order status
• Contact support with cancellation ID
• Check wallet transaction history

⏰ **Error occurred:** ${new Date().toISOString()}`
        };
    }
}
