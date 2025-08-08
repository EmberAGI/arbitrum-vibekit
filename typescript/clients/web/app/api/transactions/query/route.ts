import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte, lte, like, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { agentTransaction } from '@/lib/db/schema';

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export interface TransactionQueryParams {
  userAddress: string;
  agentId?: string;
  limit?: number;
  offset?: number;
  status?: 'pending' | 'confirmed' | 'failed';
  chainId?: string;
  agentType?: string;
  skillName?: string;
  toolName?: string;
  sessionId?: string;
  dateFrom?: string;
  dateTo?: string;
  txHash?: string;
  search?: string; // General search term
}

// POST /api/transactions/query - Advanced querying with filters
export async function POST(request: NextRequest) {
  try {
    const params: TransactionQueryParams = await request.json();

    if (!params.userAddress) {
      return NextResponse.json(
        { error: 'userAddress is required' },
        { status: 400 }
      );
    }

    const limit = Math.min(params.limit || 50, 1000); // Cap at 1000 transactions
    const offset = params.offset || 0;

    // Build where conditions
    const whereConditions = [eq(agentTransaction.userAddress, params.userAddress)];

    // Agent ID filter
    if (params.agentId) {
      whereConditions.push(eq(agentTransaction.agentId, params.agentId));
    }

    // Status filter
    if (params.status) {
      whereConditions.push(eq(agentTransaction.status, params.status));
    }

    // Chain ID filter
    if (params.chainId) {
      whereConditions.push(eq(agentTransaction.chainId, params.chainId));
    }

    // Agent type filter
    if (params.agentType) {
      whereConditions.push(eq(agentTransaction.agentType, params.agentType));
    }

    // Skill name filter
    if (params.skillName) {
      whereConditions.push(eq(agentTransaction.skillName, params.skillName));
    }

    // Tool name filter
    if (params.toolName) {
      whereConditions.push(eq(agentTransaction.toolName, params.toolName));
    }

    // Session ID filter
    if (params.sessionId) {
      whereConditions.push(eq(agentTransaction.sessionId, params.sessionId));
    }

    // Transaction hash filter (exact match)
    if (params.txHash) {
      whereConditions.push(eq(agentTransaction.txHash, params.txHash));
    }

    // Date range filters
    if (params.dateFrom) {
      whereConditions.push(gte(agentTransaction.executedAt, new Date(params.dateFrom)));
    }

    if (params.dateTo) {
      whereConditions.push(lte(agentTransaction.executedAt, new Date(params.dateTo)));
    }

    // General search filter (searches across multiple fields)  
    // TODO: Implement search functionality after resolving type issues
    // if (params.search) {
    //   const searchTerm = `%${params.search.toLowerCase()}%`;
    //   whereConditions.push(
    //     or(
    //       like(agentTransaction.txHash, searchTerm),
    //       like(agentTransaction.agentType, searchTerm)
    //     )
    //   );
    // }

    // Execute query with pagination
    const [transactions, totalCountResult] = await Promise.all([
      db
        .select()
        .from(agentTransaction)
        .where(and(...whereConditions))
        .orderBy(desc(agentTransaction.executedAt))
        .limit(limit)
        .offset(offset),
      
      // Get total count for pagination
      db
        .select({ count: agentTransaction.id })
        .from(agentTransaction)
        .where(and(...whereConditions))
    ]);

    const total = totalCountResult.length;
    const hasMore = offset + transactions.length < total;

    // Calculate statistics for this filtered dataset
    const statsQuery = db
      .select({
        status: agentTransaction.status,
        chainId: agentTransaction.chainId,
        agentType: agentTransaction.agentType,
        skillName: agentTransaction.skillName,
        executedAt: agentTransaction.executedAt,
      })
      .from(agentTransaction)
      .where(and(...whereConditions));

    const statsData = await statsQuery;
    
    // Aggregate statistics
    const stats = {
      total,
      pending: statsData.filter(tx => tx.status === 'pending').length,
      confirmed: statsData.filter(tx => tx.status === 'confirmed').length,
      failed: statsData.filter(tx => tx.status === 'failed').length,
      last24Hours: statsData.filter(tx => 
        tx.executedAt && new Date(tx.executedAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)
      ).length,
      chains: [...new Set(statsData.map(tx => tx.chainId))],
      agentTypes: [...new Set(statsData.map(tx => tx.agentType))],
      skills: [...new Set(statsData.map(tx => tx.skillName).filter(Boolean))],
    };

    const response = {
      agentId: params.agentId || 'all',
      transactions,
      total,
      hasMore,
      offset,
      limit,
      stats,
      query: params,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Failed to query transactions:', error);
    return NextResponse.json(
      { error: 'Failed to query transactions' },
      { status: 500 }
    );
  }
}

// GET /api/transactions/query?userAddress=0x...&status=pending - Simple query via GET
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const params: TransactionQueryParams = {
      userAddress: searchParams.get('userAddress') || '',
      agentId: searchParams.get('agentId') || undefined,
      limit: searchParams.get('limit') ? Number.parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? Number.parseInt(searchParams.get('offset')!) : undefined,
      status: searchParams.get('status') as 'pending' | 'confirmed' | 'failed' | undefined,
      chainId: searchParams.get('chainId') || undefined,
      agentType: searchParams.get('agentType') || undefined,
      skillName: searchParams.get('skillName') || undefined,
      toolName: searchParams.get('toolName') || undefined,
      sessionId: searchParams.get('sessionId') || undefined,
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
      txHash: searchParams.get('txHash') || undefined,
      search: searchParams.get('search') || undefined,
    };

    if (!params.userAddress) {
      return NextResponse.json(
        { error: 'userAddress parameter is required' },
        { status: 400 }
      );
    }

    // Use the POST handler logic
    const response = await POST(new NextRequest(request.url, {
      method: 'POST',
      body: JSON.stringify(params),
      headers: { 'Content-Type': 'application/json' },
    }));

    return response;
  } catch (error) {
    console.error('Failed to query transactions via GET:', error);
    return NextResponse.json(
      { error: 'Failed to query transactions' },
      { status: 500 }
    );
  }
}