"use client";
import { useAccount } from 'wagmi';
import { History, Clock } from 'lucide-react';
import { useArtifact } from '@/hooks/use-artifact';
import { generateTransactionHistoryId } from '@/artifacts/transaction-history/server';

interface TransactionHistoryButtonProps {
  className?: string;
  variant?: 'icon' | 'button';
  size?: 'sm' | 'md' | 'lg';
  agentId?: string;
}

export function TransactionHistoryButton({ 
  className = '',
  variant = 'icon',
  size = 'md',
  agentId = 'default-agent'
}: TransactionHistoryButtonProps) {
  const { isConnected, address } = useAccount();
  const { setArtifact } = useArtifact();

  if (!isConnected) {
    return null; // Don't show if wallet is not connected
  }

  const showTransactionHistory = async () => {
    try {
      // Fetch transaction data for this agent and user
      const response = await fetch(`/api/transactions?userAddress=${address}&agentId=${agentId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch transaction history');
      }
      
      const transactions = await response.json();
      
      // Create artifact with transaction history data
      const documentId = await generateTransactionHistoryId();
      
      // Prepare transaction history data
      const transactionHistoryData = {
        agentId,
        transactions,
        total: transactions.length,
        hasMore: false,
        timestamp: new Date().toISOString(),
        stats: {
          pending: transactions.filter((tx: any) => tx.status === 'pending').length,
          confirmed: transactions.filter((tx: any) => tx.status === 'confirmed').length,
          failed: transactions.filter((tx: any) => tx.status === 'failed').length,
          last24Hours: transactions.filter((tx: any) => 
            new Date(tx.executedAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)
          ).length,
          chains: [...new Set(transactions.map((tx: any) => tx.chainId))],
          agentTypes: [...new Set(transactions.map((tx: any) => tx.agentType))],
          skills: [...new Set(transactions.map((tx: any) => tx.skillName).filter(Boolean))],
        }
      };

      setArtifact({
        title: `Transaction History - ${agentId}`,
        documentId,
        kind: 'transaction-history',
        content: JSON.stringify(transactionHistoryData, null, 2),
        isVisible: true,
        status: 'idle',
        boundingBox: {
          top: 100,
          left: 400,
          width: 800,
          height: 600,
        },
      });
    } catch (error) {
      console.error('Failed to load transaction history:', error);
      // Could show a toast notification here
    }
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  const buttonSizes = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-2 text-base'
  };

  if (variant === 'icon') {
    return (
      <button
        onClick={showTransactionHistory}
        className={`
          inline-flex items-center justify-center rounded-lg 
          bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600
          text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white
          transition-colors duration-200 p-2
          ${className}
        `}
        data-testid="transaction-history-button"
        title="View Transaction History"
        aria-label="View Transaction History"
      >
        <History className={iconSizes[size]} />
      </button>
    );
  }

  return (
    <button
      onClick={showTransactionHistory}
      className={`
        inline-flex items-center justify-center rounded-lg 
        bg-cyan-600 hover:bg-cyan-700 text-white font-medium
        transition-colors duration-200 disabled:opacity-50
        ${buttonSizes[size]} ${className}
      `}
    >
      <Clock className={`${iconSizes[size]} mr-2`} />
      Transaction History
    </button>
  );
} 