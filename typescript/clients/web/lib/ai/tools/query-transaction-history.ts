
import { type DataStreamWriter, tool } from 'ai';
import { z } from 'zod';
import type { Session } from 'next-auth';
import { cookies } from 'next/headers';
import { getAgentTransactionsByUserAndAgent, getAgentTransactionsByUser } from '@/lib/db/queries';

interface QueryTransactionHistoryProps {
  session: Session;
  dataStream: DataStreamWriter;
}

export const queryTransactionHistory = ({ session, dataStream }: QueryTransactionHistoryProps) =>
  tool({
    description:
      'Query and display transaction history for a specific agent or all agents. Returns detailed transaction information in a readable format.',
    parameters: z.object({
      agentId: z.string().optional().describe('Specific agent ID to query transactions for. Leave empty for all agents.'),
      query: z.string().optional().describe('Natural language description of what transaction history to show'),
    }),
    execute: async ({ agentId, query }) => {
      const userAddress = session?.user?.address;

      if (!userAddress) {
        throw new Error('User wallet not connected. Please connect your wallet to view transaction history.');
      }

      try {
        // Get current agent from cookies if not specified
        const cookieStore = await cookies();
        const currentAgentId = agentId || cookieStore.get("agent")?.value || 'all';

        // console.log('🔍 [queryTransactionHistory] Current agent:', currentAgentId);
        // console.log('🔍 [queryTransactionHistory] User address:', userAddress);

        // Fetch transactions
        let transactions: any;
        let agentType = 'Unknown';

        if (currentAgentId && currentAgentId !== 'all') {
          transactions = await getAgentTransactionsByUserAndAgent(userAddress, currentAgentId);
          if (transactions.length > 0) {
            agentType = transactions[0].agentType;
          }
          // console.log('🔍 [queryTransactionHistory] Agent-specific transactions:', transactions.length);
        } else {
          transactions = await getAgentTransactionsByUser(userAddress);
          agentType = 'All Agents';
          // console.log('🔍 [queryTransactionHistory] All transactions:', transactions.length);
        }

        // Format transactions for inline display
        if (transactions.length === 0) {
          return {
            success: true,
            message: `No transactions found${currentAgentId && currentAgentId !== 'all' ? ` for agent ${currentAgentId} (${agentType})` : ''}.`,
            transactionCount: 0,
            agentId: currentAgentId || 'all',
            agentType,
          };
        }

        // Format transaction details for readable display
        const formattedTransactions = transactions.map((tx: any, index: number) => {
          const date = new Date(tx.executedAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });

          const chainNames: Record<string, string> = {
            '1': 'Ethereum',
            '42161': 'Arbitrum One',
            '137': 'Polygon',
            '10': 'Optimism',
            '8453': 'Base',
          };

          const chain = chainNames[tx.chainId] || `Chain ${tx.chainId}`;

          return `**Transaction ${index + 1}:**
- Status: ${tx.status.charAt(0).toUpperCase() + tx.status.slice(1)} ${tx.status === 'confirmed' ? '✅' : tx.status === 'failed' ? '❌' : '⏳'}
- Method: ${tx.methodName || 'N/A'}
- Chain: ${chain}
- Date: ${date}
- Tx Hash: \`${tx.txHash.slice(0, 10)}...${tx.txHash.slice(-8)}\`
- Explorer: [View Transaction](${getExplorerUrl(tx.chainId, tx.txHash)})`;
        }).join('\n\n');

        return {
          success: true,
          message: `Found ${transactions.length} transaction${transactions.length === 1 ? '' : 's'}${currentAgentId && currentAgentId !== 'all' ? ` for ${agentType}` : ''}:\n\n${formattedTransactions}`,
          transactionCount: transactions.length,
          agentId: currentAgentId || 'all',
          agentType,
          transactions: transactions.map((tx: any) => ({
            hash: tx.txHash,
            status: tx.status,
            method: tx.methodName,
            chain: tx.chainId,
            date: tx.executedAt,
          }))
        };
      } catch (error) {
        console.error('Error querying transaction history:', error);
        throw new Error(`Failed to query transaction history: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

// Helper function for explorer URLs
function getExplorerUrl(chainId: string, txHash: string): string {
  const explorerUrls: Record<string, string> = {
    '1': 'https://etherscan.io/tx/',
    '42161': 'https://arbiscan.io/tx/',
    '137': 'https://polygonscan.com/tx/',
    '10': 'https://optimistic.etherscan.io/tx/',
    '8453': 'https://basescan.org/tx/',
    '56': 'https://bscscan.com/tx/',
    '43114': 'https://snowtrace.io/tx/',
  };

  const baseUrl = explorerUrls[chainId] || 'https://etherscan.io/tx/';
  return `${baseUrl}${txHash}`;
}