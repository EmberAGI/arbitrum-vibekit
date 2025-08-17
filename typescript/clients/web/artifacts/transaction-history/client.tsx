import { Artifact } from '@/components/create-artifact';
import { DocumentSkeleton } from '@/components/document-skeleton';
import { ExternalLink, CheckCircle, XCircle, Clock, CopyIcon } from 'lucide-react';
import type { AgentTransaction } from '@/lib/db/schema';
import { toast } from 'sonner';

interface TransactionHistoryMetadata {
  transactions: Array<AgentTransaction>;
  agentId: string;
  agentType: string;
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

const formatDate = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dateObj);
};

const truncateHash = (hash: string): string => {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
};

export const transactionHistoryArtifact = new Artifact<'transaction-history', TransactionHistoryMetadata>({
  kind: 'transaction-history' as any,
  description: 'Displays transaction history for a specific agent.',
  initialize: async ({ documentId, setMetadata }) => {
    // Initialize with empty metadata - content will be loaded via streaming
    setMetadata({
      transactions: [],
      agentId: '',
      agentType: '',
    });
  },
  onStreamPart: ({ streamPart, setMetadata, setArtifact }) => {
    if (streamPart.type === 'text-delta') {
      try {
        const data = JSON.parse(streamPart.content as string);
        setMetadata({
          transactions: data.transactions || [],
          agentId: data.agentId || '',
          agentType: data.agentType || '',
        });
        setArtifact((draftArtifact) => ({
          ...draftArtifact,
          content: streamPart.content as string,
          status: 'streaming',
          isVisible: true,
        }));
      } catch (error) {
        console.error('Failed to parse streamed transaction data:', error);
      }
    }
  },
  content: ({
    metadata,
    isLoading,
  }) => {
    if (isLoading) {
      return <DocumentSkeleton artifactKind="text" />;
    }

    const transactions = metadata?.transactions || [];
    const agentType = metadata?.agentType || '';
    const agentId = metadata?.agentId || '';

    return (
      <div className="flex flex-col h-full">
        {/* Header section */}
        <div className="p-4 md:p-6 border-b border-zinc-200 dark:border-zinc-700">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
            Transaction History
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {agentType} • {transactions.length} transactions
          </p>
        </div>

        {/* Content section */}
        <div className="flex-1 overflow-hidden">
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <Clock className="w-12 h-12 text-zinc-400 mb-4" />
              <p className="text-zinc-500 dark:text-zinc-400 mb-2">No transactions found</p>
              <p className="text-sm text-zinc-400 dark:text-zinc-500">
                Transactions will appear here after you interact with {agentType}
              </p>
            </div>
          ) : (
            <div className="overflow-auto h-full">
              <div className="p-4 md:p-6">
                <div className="space-y-4">
                  {transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(tx.status)}
                          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 capitalize">
                            {tx.status}
                          </span>
                          <span className="text-xs text-zinc-500 dark:text-zinc-400 px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded">
                            {getChainName(tx.chainId)}
                          </span>
                        </div>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {formatDate(tx.executedAt)}
                        </span>
                      </div>
                      
                      <div className="space-y-2">
                        <div>
                          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                            Method:
                          </span>
                          <span className="text-sm text-zinc-600 dark:text-zinc-400 ml-2">
                            {tx.methodName || 'N/A'}
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                              Tx Hash:
                            </span>
                            <code className="text-sm text-zinc-600 dark:text-zinc-400 ml-2 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded">
                              {truncateHash(tx.txHash)}
                            </code>
                          </div>
                          <a
                            href={getExplorerUrl(tx.chainId, tx.txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors"
                          >
                            View on Explorer
                            <ExternalLink className="ml-1 w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  },
  actions: [
    {
      icon: <CopyIcon size={18} />,
      description: 'Copy transaction data',
      onClick: ({ metadata }) => {
        if (metadata?.transactions && metadata.transactions.length > 0) {
          const csvData = [
            'Status,Method,Chain,TxHash,Date',
            ...metadata.transactions.map(tx => 
              `${tx.status},${tx.methodName || 'N/A'},${getChainName(tx.chainId)},${tx.txHash},${formatDate(tx.executedAt)}`
            )
          ].join('\n');
          
          navigator.clipboard.writeText(csvData);
          toast.success('Transaction data copied to clipboard!');
        }
      },
      isDisabled: ({ metadata }) => {
        return !metadata?.transactions || metadata.transactions.length === 0;
      },
    },
  ],
  toolbar: [],
});