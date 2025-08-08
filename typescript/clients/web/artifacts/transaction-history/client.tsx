'use client';

import { Artifact } from '@/components/create-artifact';
import { DocumentSkeleton } from '@/components/document-skeleton';
import {
  ExternalLink,
  Clock,
  CheckCircle,
  XCircle,
  Search,
  Download,
  RotateCcw,
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, } from '@/components/ui/card';
import { formatDistance } from 'date-fns';
import type { AgentTransaction } from '@/lib/db/schema';

interface TransactionHistoryData {
  agentId: string;
  transactions: AgentTransaction[];
  total: number;
  hasMore: boolean;
  timestamp: string;
  stats?: {
    pending: number;
    confirmed: number;
    failed: number;
    last24Hours: number;
    chains: string[];
    agentTypes: string[];
    skills: string[];
  };
}

interface TransactionHistoryMetadata {
  data: TransactionHistoryData | null;
  loading: boolean;
  error: string | null;
}

// Chain explorer mapping
const getExplorerUrl = (chainId: string, txHash: string): string => {
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
};

const getChainName = (chainId: string): string => {
  const chainNames: Record<string, string> = {
    '1': 'Ethereum',
    '42161': 'Arbitrum One',
    '137': 'Polygon',
    '10': 'Optimism',
    '8453': 'Base',
    '56': 'BSC',
    '43114': 'Avalanche',
  };
  
  return chainNames[chainId] || `Chain ${chainId}`;
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'confirmed':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-500" />;
    case 'pending':
    default:
      return <Clock className="w-4 h-4 text-yellow-500" />;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'confirmed':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'pending':
    default:
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  }
};

const formatDate = (date: Date | string): string => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

const truncateHash = (hash: string): string => {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
};

function TransactionHistoryContent({
  title,
  content,
  isLoading,
  metadata,
  setMetadata,
}: {
  title: string;
  content: string;
  isLoading: boolean;
  metadata: TransactionHistoryMetadata;
  setMetadata: (metadata: TransactionHistoryMetadata) => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [chainFilter, setChainFilter] = useState<string>('all');
  const [agentTypeFilter, setAgentTypeFilter] = useState<string>('all');
  const [skillFilter, setSkillFilter] = useState<string>('all');

  // Parse the content as JSON data
  const data: TransactionHistoryData | null = useMemo(() => {
    if (!content) return null;
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }, [content]);

  useEffect(() => {
    if (data) {
      setMetadata({
        data,
        loading: false,
        error: null,
      });
    }
  }, [data, setMetadata]);

  // Filter transactions based on current filters
  const filteredTransactions = useMemo(() => {
    if (!data?.transactions) return [];

    return data.transactions.filter(tx => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        if (
          !tx.txHash.toLowerCase().includes(searchLower) &&
          !tx.methodName?.toLowerCase().includes(searchLower) &&
          !tx.skillName?.toLowerCase().includes(searchLower) &&
          !tx.toolName?.toLowerCase().includes(searchLower) &&
          !tx.agentType.toLowerCase().includes(searchLower)
        ) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== 'all' && tx.status !== statusFilter) {
        return false;
      }

      // Chain filter
      if (chainFilter !== 'all' && tx.chainId !== chainFilter) {
        return false;
      }

      // Agent type filter
      if (agentTypeFilter !== 'all' && tx.agentType !== agentTypeFilter) {
        return false;
      }

      // Skill filter
      if (skillFilter !== 'all' && tx.skillName !== skillFilter) {
        return false;
      }

      return true;
    });
  }, [data?.transactions, searchTerm, statusFilter, chainFilter, agentTypeFilter, skillFilter]);

  const refreshData = () => {
    setMetadata({
      ...metadata,
      loading: true,
    });
    // In a real implementation, this would trigger a refresh of the MCP resource
  };

  const exportData = () => {
    if (!filteredTransactions.length) return;
    
    const csv = [
      // CSV headers
      ['Date', 'Status', 'Chain', 'TX Hash', 'Agent Type', 'Skill', 'Tool', 'Method', 'Gas Used', 'Value'].join(','),
      // CSV rows
      ...filteredTransactions.map(tx => [
        formatDate(tx.executedAt),
        tx.status,
        getChainName(tx.chainId),
        tx.txHash,
        tx.agentType,
        tx.skillName || '',
        tx.toolName || '',
        tx.methodName || '',
        tx.gasUsed || '',
        tx.value || '',
      ].join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transaction-history-${data?.agentId || 'agent'}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <DocumentSkeleton artifactKind="transaction-history" />;
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-muted-foreground">No transaction history data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="text-muted-foreground">
            Agent: {data.agentId} • Last updated {formatDistance(new Date(data.timestamp), new Date(), { addSuffix: true })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refreshData}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportData}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      {data.stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{data.total}</div>
              <div className="text-sm text-muted-foreground">Total Transactions</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">{data.stats.confirmed}</div>
              <div className="text-sm text-muted-foreground">Confirmed</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-yellow-600">{data.stats.pending}</div>
              <div className="text-sm text-muted-foreground">Pending</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-red-600">{data.stats.failed}</div>
              <div className="text-sm text-muted-foreground">Failed</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center bg-muted/50 p-4 rounded-lg">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4" />
          <Input
            placeholder="Search transactions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        {data.stats?.chains && data.stats.chains.length > 1 && (
          <Select value={chainFilter} onValueChange={setChainFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Chain" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Chains</SelectItem>
              {data.stats.chains.map((chainId) => (
                <SelectItem key={chainId} value={chainId}>
                  {getChainName(chainId)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {data.stats?.agentTypes && data.stats.agentTypes.length > 1 && (
          <Select value={agentTypeFilter} onValueChange={setAgentTypeFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {data.stats.agentTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {data.stats?.skills && data.stats.skills.length > 1 && (
          <Select value={skillFilter} onValueChange={setSkillFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Skill" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Skills</SelectItem>
              {data.stats.skills.map((skill) => (
                <SelectItem key={skill} value={skill}>
                  {skill}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Results Summary */}
      <div className="text-sm text-muted-foreground">
        Showing {filteredTransactions.length} of {data.total} transactions
      </div>

      {/* Transaction Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Method
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Chain
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  TX Hash
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {getStatusIcon(tx.status)}
                      <Badge className={`ml-2 ${getStatusColor(tx.status)}`} variant="secondary">
                        {tx.status}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <Badge variant="outline">
                      {tx.agentType}
                    </Badge>
                    {tx.skillName && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {tx.skillName}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm">
                    <div>{tx.methodName || 'N/A'}</div>
                    {tx.toolName && (
                      <div className="text-xs text-muted-foreground">
                        {tx.toolName}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm">
                    {getChainName(tx.chainId)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <code className="text-sm bg-muted px-2 py-1 rounded font-mono">
                      {truncateHash(tx.txHash)}
                    </code>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm">
                    {formatDate(tx.executedAt)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                    >
                      <a
                        href={getExplorerUrl(tx.chainId, tx.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center"
                      >
                        View
                        <ExternalLink className="ml-1 w-3 h-3" />
                      </a>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredTransactions.length === 0 && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No transactions match the current filters</p>
        </div>
      )}

      {data.hasMore && (
        <div className="text-center">
          <Button variant="outline">
            Load More Transactions
          </Button>
        </div>
      )}
    </div>
  );
}

export const transactionHistoryArtifact = new Artifact<'transaction-history', TransactionHistoryMetadata>({
  kind: 'transaction-history',
  description: 'Interactive transaction history viewer for DeFi agents with filtering and export capabilities.',
  content: TransactionHistoryContent,
  actions: [],
  toolbar: [],
  initialize: async ({ setMetadata }) => {
    setMetadata({
      data: null,
      loading: false,
      error: null,
    });
  },
  onStreamPart: () => {
    // Transaction history doesn't use stream parts, data is loaded directly
  },
});