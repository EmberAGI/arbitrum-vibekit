import { z } from 'zod';

/**
 * Transaction History Resource Provider for MCP
 * Provides persistent, query-able transaction logs for agents
 */

// Transaction query schema for filtering and pagination
export const TransactionQuerySchema = z.object({
  limit: z.number().min(1).max(1000).default(50).optional(),
  offset: z.number().min(0).default(0).optional(),
  status: z.enum(['pending', 'confirmed', 'failed']).optional(),
  chainId: z.string().optional(),
  agentType: z.string().optional(),
  skillName: z.string().optional(),
  toolName: z.string().optional(),
  sessionId: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  txHash: z.string().optional(),
  userAddress: z.string().optional(),
});

export type TransactionQuery = z.infer<typeof TransactionQuerySchema>;

// Agent Transaction type definition
export interface AgentTransaction {
  id: string;
  txHash: string;
  userAddress: string;
  agentId: string;
  agentType: string;
  chainId: string;
  status: 'pending' | 'confirmed' | 'failed';
  transactionType?: string | null;
  blockNumber?: string | null;
  gasUsed?: string | null;
  gasPrice?: string | null;
  value?: string | null;
  contractAddress?: string | null;
  methodName?: string | null;
  transactionDetails?: any;
  executedAt: Date;
  confirmedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  skillName?: string | null;
  toolName?: string | null;
  sessionId?: string | null;
}

/**
 * Transaction history storage interface
 * Agents can implement this to use different storage backends
 */
export interface TransactionHistoryStorage {
  // Store a new transaction
  saveTransaction(transaction: Omit<AgentTransaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<AgentTransaction>;
  
  // Query transactions with filtering and pagination
  queryTransactions(agentId: string, query?: TransactionQuery): Promise<{
    transactions: AgentTransaction[];
    total: number;
    hasMore: boolean;
  }>;
  
  // Get a specific transaction by ID
  getTransaction(agentId: string, transactionId: string): Promise<AgentTransaction | null>;
  
  // Update transaction status (e.g., when confirmed on-chain)
  updateTransactionStatus(
    agentId: string, 
    transactionId: string, 
    status: 'pending' | 'confirmed' | 'failed',
    blockNumber?: string,
    confirmedAt?: Date
  ): Promise<AgentTransaction>;
  
  // Delete old transactions (for data retention policies)
  deleteOldTransactions(agentId: string, olderThan: Date): Promise<number>;
}

/**
 * In-memory transaction storage (for development/testing)
 * In production, this would be replaced with database storage
 */
export class InMemoryTransactionStorage implements TransactionHistoryStorage {
  private transactions: Map<string, AgentTransaction[]> = new Map();
  private nextId = 1;

  async saveTransaction(transaction: Omit<AgentTransaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<AgentTransaction> {
    const now = new Date();
    const newTransaction: AgentTransaction = {
      ...transaction,
      id: `tx_${this.nextId++}`,
      createdAt: now,
      updatedAt: now,
    };

    const agentTransactions = this.transactions.get(transaction.agentId) || [];
    agentTransactions.push(newTransaction);
    this.transactions.set(transaction.agentId, agentTransactions);

    return newTransaction;
  }

  async queryTransactions(agentId: string, query: TransactionQuery = {}): Promise<{
    transactions: AgentTransaction[];
    total: number;
    hasMore: boolean;
  }> {
    const allTransactions = this.transactions.get(agentId) || [];
    
    // Apply filters
    let filtered = allTransactions.filter(tx => {
      if (query.status && tx.status !== query.status) return false;
      if (query.chainId && tx.chainId !== query.chainId) return false;
      if (query.agentType && tx.agentType !== query.agentType) return false;
      if (query.skillName && tx.skillName !== query.skillName) return false;
      if (query.toolName && tx.toolName !== query.toolName) return false;
      if (query.sessionId && tx.sessionId !== query.sessionId) return false;
      if (query.txHash && tx.txHash !== query.txHash) return false;
      if (query.userAddress && tx.userAddress !== query.userAddress) return false;
      
      if (query.dateFrom) {
        const fromDate = new Date(query.dateFrom);
        if (tx.executedAt < fromDate) return false;
      }
      
      if (query.dateTo) {
        const toDate = new Date(query.dateTo);
        if (tx.executedAt > toDate) return false;
      }
      
      return true;
    });

    // Sort by executedAt desc (most recent first)
    filtered.sort((a, b) => b.executedAt.getTime() - a.executedAt.getTime());

    const total = filtered.length;
    const offset = query.offset || 0;
    const limit = query.limit || 50;
    
    const transactions = filtered.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return { transactions, total, hasMore };
  }

  async getTransaction(agentId: string, transactionId: string): Promise<AgentTransaction | null> {
    const agentTransactions = this.transactions.get(agentId) || [];
    return agentTransactions.find(tx => tx.id === transactionId) || null;
  }

  async updateTransactionStatus(
    agentId: string, 
    transactionId: string, 
    status: 'pending' | 'confirmed' | 'failed',
    blockNumber?: string,
    confirmedAt?: Date
  ): Promise<AgentTransaction> {
    const agentTransactions = this.transactions.get(agentId) || [];
    const txIndex = agentTransactions.findIndex(tx => tx.id === transactionId);
    
    if (txIndex === -1) {
      throw new Error(`Transaction ${transactionId} not found for agent ${agentId}`);
    }

    const tx = agentTransactions[txIndex];
    if (!tx) {
      throw new Error(`Transaction ${transactionId} not found for agent ${agentId}`);
    }

    const updatedTx: AgentTransaction = {
      ...tx,
      status,
      blockNumber: blockNumber || tx.blockNumber,
      confirmedAt: confirmedAt || tx.confirmedAt,
      updatedAt: new Date(),
    };

    agentTransactions[txIndex] = updatedTx;
    this.transactions.set(agentId, agentTransactions);

    return updatedTx;
  }

  async deleteOldTransactions(agentId: string, olderThan: Date): Promise<number> {
    const agentTransactions = this.transactions.get(agentId) || [];
    const before = agentTransactions.length;
    
    const filtered = agentTransactions.filter(tx => tx.createdAt >= olderThan);
    this.transactions.set(agentId, filtered);
    
    return before - filtered.length;
  }
}

/**
 * Transaction History Resource Provider
 * Exposes transaction data through MCP resources
 */
export class TransactionHistoryResourceProvider {
  constructor(
    private storage: TransactionHistoryStorage,
    private agentId: string
  ) {}

  /**
   * List all available transaction history resources for this agent
   */
  async listResources() {
    const stats = await this.getTransactionStats();
    
    return [
      {
        uri: `transaction-history://${this.agentId}/all`,
        name: 'All Transactions',
        description: `Complete transaction history for ${this.agentId} (${stats.total} transactions)`,
        mimeType: 'application/json',
      },
      {
        uri: `transaction-history://${this.agentId}/recent`,
        name: 'Recent Transactions',
        description: `Last 20 transactions for ${this.agentId}`,
        mimeType: 'application/json',
      },
      {
        uri: `transaction-history://${this.agentId}/pending`,
        name: 'Pending Transactions',
        description: `Pending transactions for ${this.agentId} (${stats.pending} transactions)`,
        mimeType: 'application/json',
      },
      {
        uri: `transaction-history://${this.agentId}/failed`,
        name: 'Failed Transactions',
        description: `Failed transactions for ${this.agentId} (${stats.failed} transactions)`,
        mimeType: 'application/json',
      },
      {
        uri: `transaction-history://${this.agentId}/stats`,
        name: 'Transaction Statistics',
        description: `Transaction statistics and summary for ${this.agentId}`,
        mimeType: 'application/json',
      },
    ];
  }

  /**
   * Read a specific transaction history resource
   */
  async readResource(uri: string): Promise<{ contents: any; mimeType: string }> {
    const urlParts = uri.replace('transaction-history://', '').split('/');
    const [agentId, resourceType, ...params] = urlParts;

    if (agentId !== this.agentId) {
      throw new Error(`Resource ${uri} not found - wrong agent ID`);
    }

    switch (resourceType) {
      case 'all':
        return this.getAllTransactions();
        
      case 'recent':
        return this.getRecentTransactions();
        
      case 'pending':
        return this.getTransactionsByStatus('pending');
        
      case 'failed':
        return this.getTransactionsByStatus('failed');
        
      case 'stats':
        return this.getTransactionStatsResource();
        
      case 'query':
        // Support custom queries via URI parameters
        const query = this.parseQueryFromUri(params);
        return this.getTransactionsByQuery(query);
        
      default:
        throw new Error(`Unknown resource type: ${resourceType}`);
    }
  }

  private async getAllTransactions() {
    const result = await this.storage.queryTransactions(this.agentId, { limit: 1000 });
    return {
      contents: {
        agentId: this.agentId,
        transactions: result.transactions,
        total: result.total,
        hasMore: result.hasMore,
        timestamp: new Date().toISOString(),
      },
      mimeType: 'application/json',
    };
  }

  private async getRecentTransactions() {
    const result = await this.storage.queryTransactions(this.agentId, { limit: 20 });
    return {
      contents: {
        agentId: this.agentId,
        transactions: result.transactions,
        total: result.total,
        hasMore: result.hasMore,
        timestamp: new Date().toISOString(),
      },
      mimeType: 'application/json',
    };
  }

  private async getTransactionsByStatus(status: 'pending' | 'confirmed' | 'failed') {
    const result = await this.storage.queryTransactions(this.agentId, { status, limit: 100 });
    return {
      contents: {
        agentId: this.agentId,
        status,
        transactions: result.transactions,
        total: result.total,
        hasMore: result.hasMore,
        timestamp: new Date().toISOString(),
      },
      mimeType: 'application/json',
    };
  }

  private async getTransactionsByQuery(query: TransactionQuery) {
    const result = await this.storage.queryTransactions(this.agentId, query);
    return {
      contents: {
        agentId: this.agentId,
        query,
        transactions: result.transactions,
        total: result.total,
        hasMore: result.hasMore,
        timestamp: new Date().toISOString(),
      },
      mimeType: 'application/json',
    };
  }

  private async getTransactionStatsResource() {
    const stats = await this.getTransactionStats();
    return {
      contents: stats,
      mimeType: 'application/json',
    };
  }

  private async getTransactionStats() {
    const [all, pending, failed, confirmed] = await Promise.all([
      this.storage.queryTransactions(this.agentId, {}),
      this.storage.queryTransactions(this.agentId, { status: 'pending' }),
      this.storage.queryTransactions(this.agentId, { status: 'failed' }),
      this.storage.queryTransactions(this.agentId, { status: 'confirmed' }),
    ]);

    // Calculate additional statistics
    const recentTransactions = await this.storage.queryTransactions(this.agentId, { 
      limit: 10,
      dateFrom: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Last 24 hours
    });

    const chains = new Set(all.transactions.map(tx => tx.chainId));
    const agentTypes = new Set(all.transactions.map(tx => tx.agentType));
    const skills = new Set(all.transactions.filter(tx => tx.skillName).map(tx => tx.skillName!));
    
    return {
      agentId: this.agentId,
      total: all.total,
      pending: pending.total,
      failed: failed.total,
      confirmed: confirmed.total,
      last24Hours: recentTransactions.total,
      chains: Array.from(chains),
      agentTypes: Array.from(agentTypes),
      skills: Array.from(skills),
      timestamp: new Date().toISOString(),
    };
  }

  private parseQueryFromUri(params: string[]): TransactionQuery {
    // Simple URI parameter parsing for query resources
    // In a full implementation, this would parse URL query parameters
    const query: TransactionQuery = {};
    
    for (let i = 0; i < params.length; i += 2) {
      const key = params[i];
      const value = params[i + 1];
      
      if (!key || !value) continue;
      
      switch (key) {
        case 'limit':
          query.limit = parseInt(value);
          break;
        case 'offset':
          query.offset = parseInt(value);
          break;
        case 'status':
          query.status = value as 'pending' | 'confirmed' | 'failed';
          break;
        case 'chainId':
          query.chainId = value;
          break;
        case 'agentType':
          query.agentType = value;
          break;
        case 'skillName':
          query.skillName = value;
          break;
        case 'toolName':
          query.toolName = value;
          break;
        case 'sessionId':
          query.sessionId = value;
          break;
        case 'txHash':
          query.txHash = value;
          break;
        case 'userAddress':
          query.userAddress = value;
          break;
        case 'dateFrom':
          query.dateFrom = value;
          break;
        case 'dateTo':
          query.dateTo = value;
          break;
      }
    }
    
    return query;
  }

  /**
   * Save a new transaction to the history
   */
  async saveTransaction(transaction: Omit<AgentTransaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<AgentTransaction> {
    return this.storage.saveTransaction({
      ...transaction,
      agentId: this.agentId,
    });
  }

  /**
   * Update a transaction status (for blockchain confirmations)
   */
  async updateTransactionStatus(
    transactionId: string,
    status: 'pending' | 'confirmed' | 'failed',
    blockNumber?: string,
    confirmedAt?: Date
  ): Promise<AgentTransaction> {
    return this.storage.updateTransactionStatus(this.agentId, transactionId, status, blockNumber, confirmedAt);
  }
}