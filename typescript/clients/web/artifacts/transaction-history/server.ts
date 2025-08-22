import 'server-only';

import { auth } from '@/app/(auth)/auth';
import { getAgentTransactionsByUserAndAgent, getAgentTransactionsByUser } from '@/lib/db/queries';
import { createDocumentHandler } from '@/lib/artifacts/server';
import type { Session } from 'next-auth';

export interface TransactionHistoryParams {
  agentId: string;
  userAddress: string;
}

export async function getTransactionHistory({
  agentId,
  userAddress,
}: TransactionHistoryParams) {
  const session = await auth() as Session;
  
  if (!session || !session.user || session.user.address !== userAddress) {
    throw new Error('Unauthorized: User address does not match session');
  }

  try {
    const transactions = await getAgentTransactionsByUserAndAgent(userAddress, agentId);
    
    // Get agent type from first transaction if available
    const agentType = transactions.length > 0 ? transactions[0].agentType : 'Unknown';
    
    return {
      transactions,
      agentId,
      agentType,
      userAddress,
    };
  } catch (error) {
    console.error('Failed to fetch transaction history:', error);
    throw new Error('Failed to fetch transaction history');
  }
}

async function createTransactionHistoryContent(
  userAddress: string,
  agentId?: string
): Promise<string> {
  try {
    let transactions: any;
    let agentType = 'Unknown';

    if (agentId && agentId !== 'all') {
      transactions = await getAgentTransactionsByUserAndAgent(userAddress, agentId);
      if (transactions.length > 0) {
        agentType = transactions[0].agentType;
      }
    } else {
      transactions = await getAgentTransactionsByUser(userAddress);
      agentType = 'All Agents';
    }

    return JSON.stringify({
      transactions,
      agentId: agentId || 'all',
      agentType,
      userAddress,
    });
  } catch (error) {
    console.error('Failed to create transaction history content:', error);
    return JSON.stringify({
      transactions: [],
      agentId: agentId || 'all',
      agentType: 'Unknown',
      userAddress,
      error: 'Failed to load transaction history',
    });
  }
}

export const transactionHistoryDocumentHandler = createDocumentHandler({
  kind: 'transaction-history' as any,
  onCreateDocument: async ({ title, dataStream, session }) => {
    const userAddress = session?.user?.address;
    
    if (!userAddress) {
      throw new Error('User address not found in session');
    }

    // Extract agentId from title if present
    const agentIdMatch = title.match(/Agent:\s*([^\s]+)/i);
    const agentId = agentIdMatch ? agentIdMatch[1] : undefined;

    dataStream.writeData({
      type: 'text-delta',
      content: 'Loading transaction history...',
    });

    const content = await createTransactionHistoryContent(userAddress, agentId);

    dataStream.writeData({
      type: 'text-delta',
      content: content,
    });

    return content;
  },
  onUpdateDocument: async ({ document, description, dataStream, session }) => {
    const userAddress = session?.user?.address;
    
    if (!userAddress) {
      throw new Error('User address not found in session');
    }

    // Parse existing content to get agentId
    let agentId: string | undefined;
    try {
      if (document.content) {
        const existingData = JSON.parse(document.content);
        agentId = existingData.agentId;
      }
    } catch (error) {
      console.error('Failed to parse existing document content:', error);
    }

    dataStream.writeData({
      type: 'text-delta',
      content: 'Refreshing transaction history...',
    });

    const content = await createTransactionHistoryContent(userAddress, agentId);

    dataStream.writeData({
      type: 'text-delta',
      content: content,
    });

    return content;
  },
});