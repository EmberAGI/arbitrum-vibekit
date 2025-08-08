import { z } from 'zod';
import { defineSkill } from 'arbitrum-vibekit-core';
import { TransactionHistoryResourceProvider, InMemoryTransactionStorage } from '../resources/transactionHistory.js';

// Query schema for transaction history requests
const TransactionHistoryQuerySchema = z.object({
  query: z.string().optional().describe('Search term to filter transactions'),
  status: z.enum(['pending', 'confirmed', 'failed', 'all']).default('all').describe('Filter by transaction status'),
  chainId: z.string().optional().describe('Filter by blockchain chain ID'),
  agentType: z.string().optional().describe('Filter by agent type (e.g., swap, lending, liquidity)'),
  skillName: z.string().optional().describe('Filter by skill that initiated the transaction'),
  toolName: z.string().optional().describe('Filter by specific tool that executed the transaction'),
  dateFrom: z.string().datetime().optional().describe('Filter transactions from this date (ISO 8601 format)'),
  dateTo: z.string().datetime().optional().describe('Filter transactions until this date (ISO 8601 format)'),
  limit: z.number().min(1).max(1000).default(50).describe('Maximum number of transactions to return'),
  offset: z.number().min(0).default(0).describe('Number of transactions to skip for pagination'),
  format: z.enum(['json', 'csv', 'summary']).default('json').describe('Output format for the transaction data'),
});

/**
 * Transaction History Skill
 * Provides persistent, queryable transaction logs for this agent
 */
export const transactionHistorySkill = defineSkill({
  id: 'transaction-history',
  name: 'Transaction History',
  description: 'Query and retrieve transaction history for this agent with advanced filtering capabilities',
  tags: ['defi', 'transactions', 'history', 'analytics'],
  examples: [
    'Show me my transaction history',
    'Get failed transactions from last 24 hours',
    'Show all swap transactions on Arbitrum',
    'Export transaction history as CSV',
    'Get pending transactions for lending operations',
  ],
  inputSchema: TransactionHistoryQuerySchema,
  tools: [], // This skill uses resources instead of tools
  
  // Note: Handler will be provided through MCP resources and tools
});

/**
 * Format transaction data as CSV
 */
function formatAsCSV(data: any): string {
  if (!data || !data.transactions || !Array.isArray(data.transactions)) {
    return 'No transaction data available\n';
  }

  const headers = [
    'Date',
    'Status',
    'Chain',
    'TX Hash',
    'Agent Type',
    'Skill',
    'Tool',
    'Method',
    'Gas Used',
    'Gas Price',
    'Value',
    'Block Number',
    'Contract Address',
  ];

  const rows = data.transactions.map((tx: any) => [
    tx.executedAt,
    tx.status,
    tx.chainId,
    tx.txHash,
    tx.agentType,
    tx.skillName || '',
    tx.toolName || '',
    tx.methodName || '',
    tx.gasUsed || '',
    tx.gasPrice || '',
    tx.value || '',
    tx.blockNumber || '',
    tx.contractAddress || '',
  ]);

  return [headers.join(','), ...rows.map((row: string[]) => row.join(','))].join('\n');
}