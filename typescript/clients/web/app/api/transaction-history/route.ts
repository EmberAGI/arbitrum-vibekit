import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { getAgentTransactionsByUserAndAgent, getAgentTransactionsByUser } from '@/lib/db/queries';

// GET /api/transaction-history?userAddress=0x...&agentId=agent123&format=artifact
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.address) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('userAddress') || session.user.address;
    const agentId = searchParams.get('agentId');
    const format = searchParams.get('format'); // 'artifact' | 'json'

    // Verify user can only query their own transactions
    if (userAddress !== session.user.address) {
      return NextResponse.json(
        { error: 'Unauthorized: Cannot query other users\' transactions' },
        { status: 403 }
      );
    }

    let transactions: any;
    let agentType = 'Unknown';

    if (agentId) {
      // Get transactions for specific agent
      transactions = await getAgentTransactionsByUserAndAgent(userAddress, agentId);
      if (transactions.length > 0) {
        agentType = transactions[0].agentType;
      }
    } else {
      // Get all transactions for user
      transactions = await getAgentTransactionsByUser(userAddress);
      agentType = 'All Agents';
    }

    if (format === 'artifact') {
      // Return data formatted for artifact creation
      const artifactData = {
        transactions,
        agentId: agentId || 'all',
        agentType,
        userAddress,
      };

      return NextResponse.json({
        success: true,
        artifactData,
        message: `Found ${transactions.length} transactions${agentId ? ` for agent ${agentId}` : ''}`,
        artifactTitle: `Transaction History - ${agentType}`,
      });
    }

    // Return raw transaction data
    return NextResponse.json({
      transactions,
      agentId: agentId || 'all',
      agentType,
      userAddress,
    });
  } catch (error) {
    console.error('Failed to fetch transaction history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transaction history' },
      { status: 500 }
    );
  }
}