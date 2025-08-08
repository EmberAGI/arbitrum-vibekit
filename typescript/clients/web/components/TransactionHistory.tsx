"use client";

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { X, ExternalLink, Clock, CheckCircle, XCircle } from 'lucide-react';
import type { AgentTransaction } from '../lib/db/schema';

interface TransactionHistoryProps {
  isOpen: boolean;
  onClose: () => void;
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

const formatDate = (date: Date): string => {
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

export function TransactionHistory({ isOpen, onClose }: TransactionHistoryProps) {
  const { address } = useAccount();
  const [transactions, setTransactions] = useState<AgentTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!isOpen || !address) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/transactions?userAddress=${address}`);
        console.log("Line number 83: Fetching transactions for address:", address);
        console.log("Line number 84: Response status:", response);
        if (!response.ok) {
          throw new Error(`Failed to fetch transactions: ${response.statusText}`);
        }
        const userTransactions: AgentTransaction[] = await response.json();
        setTransactions(userTransactions);
      } catch (err) {
        console.error('Failed to fetch transactions:', err);
        setError('Failed to load transaction history');
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [isOpen, address]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      data-testid="transaction-history-modal"
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Transaction History
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            data-testid="transaction-history-close"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600" />
              <span className="ml-2 text-gray-600 dark:text-gray-300">Loading transactions...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">{error}</div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No transactions found
            </div>
          ) : (
            <div className="overflow-auto max-h-[calc(80vh-200px)]">
              <table className="w-full" data-testid="transaction-table">
                <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Method
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Chain
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Tx Hash
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {transactions.map((tx) => (
                    <tr 
                      key={tx.id} 
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      data-testid="transaction-row"
                    >
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center" data-testid="tx-status">
                          {getStatusIcon(tx.status)}
                          <span className="ml-2 text-sm font-medium text-gray-900 dark:text-white capitalize">
                            {tx.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span 
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200"
                          data-testid="agent-type"
                        >
                          {tx.agentType}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">
                        {tx.methodName || 'N/A'}
                      </td>
                      <td 
                        className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300"
                        data-testid="chain-name"
                      >
                        {getChainName(tx.chainId)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <code 
                          className="text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-900 dark:text-gray-300"
                          data-testid="tx-hash"
                        >
                          {truncateHash(tx.txHash)}
                        </code>
                      </td>
                      <td 
                        className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300"
                        data-testid="tx-date"
                      >
                        {formatDate(tx.executedAt)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <a
                          href={getExplorerUrl(tx.chainId, tx.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                          data-testid="explorer-link"
                        >
                          View
                          <ExternalLink className="ml-1 w-3 h-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 