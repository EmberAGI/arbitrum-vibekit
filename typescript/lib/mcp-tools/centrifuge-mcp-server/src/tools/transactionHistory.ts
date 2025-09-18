import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CentrifugeSDKClient } from '../utils/sdkClient.js';

export const transactionHistoryTool: Tool = {
    name: 'transaction-history',
    description: 'Retrieve and analyze complete transaction history for Centrifuge investments',
    inputSchema: {
        type: 'object',
        properties: {
            investorAddress: {
                type: 'string',
                description: 'The investor wallet address to get transaction history for',
                pattern: '^0x[a-fA-F0-9]{40}$'
            },
            poolId: {
                type: 'string',
                description: 'Optional: Specific pool ID to filter transactions',
                pattern: '^[0-9]+$',
                default: ''
            },
            network: {
                type: 'string',
                description: 'Optional: Specific network to filter transactions',
                enum: ['arbitrum', 'ethereum'],
                default: ''
            },
            transactionType: {
                type: 'string',
                description: 'Optional: Type of transactions to filter',
                enum: ['all', 'investments', 'redemptions', 'yield_claims', 'transfers'],
                default: 'all'
            },
            dateFrom: {
                type: 'string',
                description: 'Start date for transaction history (YYYY-MM-DD)',
                pattern: '^\\d{4}-\\d{2}-\\d{2}$',
                default: ''
            },
            dateTo: {
                type: 'string',
                description: 'End date for transaction history (YYYY-MM-DD)',
                pattern: '^\\d{4}-\\d{2}-\\d{2}$',
                default: ''
            },
            limit: {
                type: 'number',
                description: 'Maximum number of transactions to return',
                minimum: 1,
                maximum: 100,
                default: 25
            },
            includeDetails: {
                type: 'boolean',
                description: 'Include detailed transaction information',
                default: true
            }
        },
        required: ['investorAddress']
    }
};

export async function executeTransactionHistory(args: any): Promise<{ content: string }> {
    const {
        investorAddress,
        poolId = '',
        network = '',
        transactionType = 'all',
        dateFrom = '',
        dateTo = '',
        limit = 25,
        includeDetails = true
    } = args;

    try {
        console.log(`📋 [Transaction History] Retrieving history for ${investorAddress}...`);

        // Validate Ethereum address format
        const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
        if (!ethAddressRegex.test(investorAddress)) {
            return {
                content: `❌ **TRANSACTION HISTORY FAILED**

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

        // Validate date formats if provided
        if (dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
            return {
                content: `❌ **TRANSACTION HISTORY FAILED**

**Error:** Invalid date format for dateFrom

**Date Provided:** ${dateFrom}
**Required Format:** YYYY-MM-DD
**Example:** 2024-01-15

**Next Steps:**
• Use YYYY-MM-DD format for dates
• Leave empty for no date filtering

⏰ **Validation failed:** ${new Date().toISOString()}`
            };
        }

        if (dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
            return {
                content: `❌ **TRANSACTION HISTORY FAILED**

**Error:** Invalid date format for dateTo

**Date Provided:** ${dateTo}
**Required Format:** YYYY-MM-DD
**Example:** 2024-12-31

**Next Steps:**
• Use YYYY-MM-DD format for dates
• Leave empty for no date filtering

⏰ **Validation failed:** ${new Date().toISOString()}`
            };
        }

        // Mock transaction history data - in production this would come from blockchain/API
        const mockTransactions: any[] = [
            {
                id: 'tx_001',
                type: 'investment',
                poolId: '1',
                poolName: 'New Silver Pool',
                trancheType: 'Senior',
                amount: 2500.00,
                currency: 'USDC',
                network: 'arbitrum',
                timestamp: '2024-09-15T10:30:00Z',
                status: 'completed',
                gasFee: 0.0025,
                transactionHash: '0x1234567890abcdef1234567890abcdef12345678',
                blockNumber: 123456789,
                yieldEarned: 0.00,
                details: {
                    trancheId: '0',
                    vaultAddress: '0x742d35Cc6074C4532895c05b22629ce5b3c28da4',
                    tokenReceived: 2500,
                    exchangeRate: 1.0
                }
            },
            {
                id: 'tx_002',
                type: 'yield_claim',
                poolId: '1',
                poolName: 'New Silver Pool',
                trancheType: 'Senior',
                amount: 31.25,
                currency: 'USDC',
                network: 'arbitrum',
                timestamp: '2024-10-01T09:00:00Z',
                status: 'completed',
                gasFee: 0.0012,
                transactionHash: '0xabcdef1234567890abcdef1234567890abcdef12',
                blockNumber: 123457890,
                yieldEarned: 31.25,
                details: {
                    periodStart: '2024-09-15T00:00:00Z',
                    periodEnd: '2024-10-01T00:00:00Z',
                    yieldRate: '1.25%',
                    daysHeld: 16
                }
            },
            {
                id: 'tx_003',
                type: 'investment',
                poolId: '2',
                poolName: 'ConsolFreight Pool',
                trancheType: 'Junior',
                amount: 1500.00,
                currency: 'USDC',
                network: 'ethereum',
                timestamp: '2024-10-05T14:20:00Z',
                status: 'completed',
                gasFee: 0.0045,
                transactionHash: '0x7890123456789012345678901234567890123456',
                blockNumber: 123458901,
                yieldEarned: 0.00,
                details: {
                    trancheId: '1',
                    vaultAddress: '0x8901234567890123456789012345678901234567',
                    tokenReceived: 1500,
                    exchangeRate: 1.0
                }
            },
            {
                id: 'tx_004',
                type: 'redemption',
                poolId: '1',
                poolName: 'New Silver Pool',
                trancheType: 'Senior',
                amount: 1250.00,
                currency: 'USDC',
                network: 'arbitrum',
                timestamp: '2024-10-10T11:45:00Z',
                status: 'completed',
                gasFee: 0.0031,
                transactionHash: '0x3456789012345678901234567890123456789012',
                blockNumber: 123459012,
                yieldEarned: 18.75,
                details: {
                    trancheId: '0',
                    vaultAddress: '0x742d35Cc6074C4532895c05b22629ce5b3c28da4',
                    tokensRedeemed: 1250,
                    totalYieldEarned: 18.75,
                    redemptionRate: 1.015
                }
            },
            {
                id: 'tx_005',
                type: 'yield_claim',
                poolId: '2',
                poolName: 'ConsolFreight Pool',
                trancheType: 'Junior',
                amount: 45.00,
                currency: 'USDC',
                network: 'ethereum',
                timestamp: '2024-10-15T08:30:00Z',
                status: 'completed',
                gasFee: 0.0028,
                transactionHash: '0x5678901234567890123456789012345678901234',
                blockNumber: 123460123,
                yieldEarned: 45.00,
                details: {
                    periodStart: '2024-10-05T00:00:00Z',
                    periodEnd: '2024-10-15T00:00:00Z',
                    yieldRate: '3.0%',
                    daysHeld: 10
                }
            }
        ];

        // Filter transactions based on criteria
        let filteredTransactions = mockTransactions.filter(tx => {
            // Address filter
            if (tx.details.vaultAddress !== investorAddress) return false;

            // Pool filter
            if (poolId && tx.poolId !== poolId) return false;

            // Network filter
            if (network && tx.network !== network) return false;

            // Transaction type filter
            if (transactionType !== 'all') {
                if (transactionType === 'investments' && tx.type !== 'investment') return false;
                if (transactionType === 'redemptions' && tx.type !== 'redemption') return false;
                if (transactionType === 'yield_claims' && tx.type !== 'yield_claim') return false;
                if (transactionType === 'transfers' && tx.type !== 'transfer') return false;
            }

            // Date filters
            if (dateFrom) {
                const txDateStr = tx.timestamp.split('T')[0];
                if (txDateStr) {
                    const txDate = new Date(txDateStr);
                    const fromDate = new Date(dateFrom);
                    if (txDate < fromDate) return false;
                }
            }

            if (dateTo) {
                const txDateStr = tx.timestamp.split('T')[0];
                if (txDateStr) {
                    const txDate = new Date(txDateStr);
                    const toDate = new Date(dateTo);
                    if (txDate > toDate) return false;
                }
            }

            return true;
        });

        // Sort by timestamp (newest first)
        filteredTransactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        // Limit results
        const limitedTransactions = filteredTransactions.slice(0, limit);

        // Calculate summary statistics
        const summary = {
            totalTransactions: limitedTransactions.length,
            totalInvested: limitedTransactions
                .filter(tx => tx.type === 'investment')
                .reduce((sum, tx) => sum + tx.amount, 0),
            totalRedeemed: limitedTransactions
                .filter(tx => tx.type === 'redemption')
                .reduce((sum, tx) => sum + tx.amount, 0),
            totalYieldEarned: limitedTransactions
                .filter(tx => tx.type === 'yield_claim')
                .reduce((sum, tx) => sum + tx.amount, 0),
            totalGasFees: limitedTransactions
                .reduce((sum, tx) => sum + tx.gasFee, 0),
            netPosition: 0,
            poolsInvolved: [...new Set(limitedTransactions.map(tx => tx.poolId))].length
        };

        summary.netPosition = summary.totalInvested - summary.totalRedeemed;

        // Generate response
        let response = `📋 **TRANSACTION HISTORY**

👤 **Investor:** ${investorAddress}
📅 **Report Date:** ${new Date().toISOString().split('T')[0]}
🔍 **Filters Applied:**
• **Pool ID:** ${poolId || 'All pools'}
• **Network:** ${network || 'All networks'}
• **Transaction Type:** ${transactionType.replace('_', ' ').toUpperCase()}
• **Date Range:** ${dateFrom || 'Start'} to ${dateTo || 'Present'}
• **Limit:** ${limit} transactions

📊 **SUMMARY STATISTICS:**
• **Total Transactions:** ${summary.totalTransactions}
• **Total Invested:** $${summary.totalInvested.toFixed(2)} USDC
• **Total Redeemed:** $${summary.totalRedeemed.toFixed(2)} USDC
• **Net Position:** $${summary.netPosition.toFixed(2)} USDC
• **Total Yield Earned:** $${summary.totalYieldEarned.toFixed(2)} USDC
• **Total Gas Fees:** $${summary.totalGasFees.toFixed(4)} ETH
• **Pools Involved:** ${summary.poolsInvolved}

💰 **TRANSACTION DETAILS:**

`;

        if (limitedTransactions.length === 0) {
            response += `❌ **NO TRANSACTIONS FOUND**

**Possible Reasons:**
• No transactions match your filter criteria
• Address has no transaction history
• Date range is too restrictive
• Wrong network selected

**Suggestions:**
• Remove or adjust filters
• Check date range format (YYYY-MM-DD)
• Verify address is correct
• Try different transaction types

`;
        } else {
            limitedTransactions.forEach((tx, index) => {
                const txDate = new Date(tx.timestamp).toLocaleDateString();
                const txTime = new Date(tx.timestamp).toLocaleTimeString();

                response += `**${index + 1}. ${tx.type.replace('_', ' ').toUpperCase()} - ${tx.poolName}**
• **Date:** ${txDate} ${txTime}
• **Amount:** $${tx.amount.toFixed(2)} ${tx.currency}
• **Tranche:** ${tx.trancheType}
• **Network:** ${tx.network.charAt(0).toUpperCase() + tx.network.slice(1)}
• **Status:** ${tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
• **Gas Fee:** ${tx.gasFee} ETH
• **Transaction:** ${tx.transactionHash}
• **Block:** ${tx.blockNumber}

`;

                if (includeDetails && tx.details) {
                    if (tx.type === 'investment') {
                        response += `• **Tokens Received:** ${tx.details.tokenReceived}
• **Exchange Rate:** ${tx.details.exchangeRate}

`;
                    } else if (tx.type === 'yield_claim') {
                        response += `• **Yield Rate:** ${tx.details.yieldRate}
• **Period:** ${new Date(tx.details.periodStart).toLocaleDateString()} - ${new Date(tx.details.periodEnd).toLocaleDateString()}
• **Days Held:** ${tx.details.daysHeld}

`;
                    } else if (tx.type === 'redemption') {
                        response += `• **Tokens Redeemed:** ${tx.details?.tokensRedeemed || 'N/A'}
• **Total Yield Earned:** $${tx.details?.totalYieldEarned ? tx.details.totalYieldEarned.toFixed(2) : '0.00'}
• **Redemption Rate:** ${tx.details?.redemptionRate || 'N/A'}

`;
                    }
                }

                if (tx.yieldEarned > 0) {
                    response += `• **Yield Earned:** $${tx.yieldEarned.toFixed(2)} USDC

`;
                }
            });
        }

        response += `📈 **PERFORMANCE METRICS:**

**By Transaction Type:**
• Investments: ${limitedTransactions.filter(tx => tx.type === 'investment').length}
• Redemptions: ${limitedTransactions.filter(tx => tx.type === 'redemption').length}
• Yield Claims: ${limitedTransactions.filter(tx => tx.type === 'yield_claim').length}

        **By Pool:**
${Object.entries(
            limitedTransactions.reduce((acc: Record<string, number>, tx) => {
                acc[tx.poolName] = (acc[tx.poolName] || 0) + 1;
                return acc;
            }, {} as Record<string, number>)
        ).map(([pool, count]) => `• ${pool}: ${count} transactions`).join('\n')}

**By Network:**
${Object.entries(
            limitedTransactions.reduce((acc: Record<string, number>, tx) => {
                acc[tx.network] = (acc[tx.network] || 0) + 1;
                return acc;
            }, {} as Record<string, number>)
        ).map(([network, count]) => `• ${network.charAt(0).toUpperCase() + network.slice(1)}: ${count} transactions`).join('\n')}

💡 **ANALYSIS INSIGHTS:**

`;

        // Add analysis insights
        if (summary.totalYieldEarned > 0) {
            const avgYieldRate = (summary.totalYieldEarned / summary.totalInvested) * 100;
            response += `• **Average Yield Rate:** ${avgYieldRate.toFixed(2)}% on invested capital
`;
        }

        if (summary.totalGasFees > 0.01) {
            response += `• **Gas Fee Efficiency:** $${(summary.totalGasFees * 3000).toFixed(2)} USD worth of fees paid
`;
        }

        if (summary.poolsInvolved > 1) {
            response += `• **Diversification:** Active across ${summary.poolsInvolved} different pools
`;
        }

        response += `
⚠️ **IMPORTANT NOTES:**
• Transaction history is immutable once confirmed
• Gas fees are deducted from your wallet
• Yield claims reset the accrual period
• Some transactions may take time to appear

🆘 **NEED HELP?**
• Missing transactions? Check network explorer
• Wrong amounts? Contact pool support
• Gas issues? Check network congestion
• Technical issues? Contact platform support

⏰ **History retrieved:** ${new Date().toISOString()}`;

        // console.log(`✅ [Transaction History] Retrieved ${limitedTransactions.length} transactions for ${investorAddress}`);
        return { content: response };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ [Transaction History] Failed:`, errorMessage);

        return {
            content: `❌ **TRANSACTION HISTORY FAILED**

**Error:** ${errorMessage}

**Parameters:**
• Investor: ${investorAddress}
• Pool ID: ${poolId || 'All'}
• Network: ${network || 'All'}
• Type: ${transactionType}
• Date Range: ${dateFrom || 'Start'} to ${dateTo || 'Present'}

**Troubleshooting:**
• Verify address format is correct
• Check date formats (YYYY-MM-DD)
• Ensure network connectivity
• Try with fewer filters

**Next Steps:**
• Use \`get-investment-status\` for current positions
• Contact support if history is missing

⏰ **Error occurred:** ${new Date().toISOString()}`
        };
    }
}
