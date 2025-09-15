import { type NextRequest, NextResponse } from 'next/server';
import { getAgentTransactionsByUser, getAgentTransactionsByUserAndAgent, insertAgentTransaction } from '@/lib/db/queries';
import type { InsertTransactionInput } from '@/components/artifact';

// GET /api/transactions?userAddress=0x...&agentId=agent123
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('userAddress');
    const agentId = searchParams.get('agentId');

    if (!userAddress) {
      return NextResponse.json(
        { error: 'userAddress parameter is required' },
        { status: 400 }
      );
    }

    let transactions: any;
    if (agentId) {
      // Get transactions for specific agent
      transactions = await getAgentTransactionsByUserAndAgent(userAddress, agentId);
    } else {
      // Get all transactions for user
      transactions = await getAgentTransactionsByUser(userAddress);
    }

    return NextResponse.json(transactions);
  } catch (error) {
    console.error('Failed to fetch transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}

// POST /api/transactions
export async function POST(request: NextRequest) {
  try {
    const transactionData: InsertTransactionInput = await request.json();
    
    // Validate required fields
    if (!transactionData.txHash || !transactionData.userAddress || !transactionData.agentId || !transactionData.agentType) {
      return NextResponse.json(
        { error: 'Missing required fields: txHash, userAddress, agentId, agentType' },
        { status: 400 }
      );
    }

    // Convert date strings to Date objects if needed
    const processedData = {
      ...transactionData,
      executedAt: typeof transactionData.executedAt === 'string' 
        ? new Date(transactionData.executedAt) 
        : transactionData.executedAt,
      confirmedAt: transactionData.confirmedAt 
        ? (typeof transactionData.confirmedAt === 'string' 
           ? new Date(transactionData.confirmedAt) 
           : transactionData.confirmedAt)
        : null,
    };

    const result = await insertAgentTransaction(processedData);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to save transaction:', error);
    return NextResponse.json(
      { error: 'Failed to save transaction' },
      { status: 500 }
    );
  }
} 