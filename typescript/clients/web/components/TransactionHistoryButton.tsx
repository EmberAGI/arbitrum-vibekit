"use client";

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { History, Clock } from 'lucide-react';
import { TransactionHistory } from './TransactionHistory';

interface TransactionHistoryButtonProps {
  className?: string;
  variant?: 'icon' | 'button';
  size?: 'sm' | 'md' | 'lg';
}

export function TransactionHistoryButton({ 
  className = '',
  variant = 'icon',
  size = 'md'
}: TransactionHistoryButtonProps) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const { isConnected } = useAccount();

  if (!isConnected) {
    return null; // Don't show if wallet is not connected
  }

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
      <>
        <button
          onClick={() => setIsHistoryOpen(true)}
          className={`
            inline-flex items-center justify-center rounded-lg 
            bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600
            text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white
            transition-colors duration-200 p-2
            ${className}
          `}
          title="View Transaction History"
          aria-label="View Transaction History"
        >
          <History className={iconSizes[size]} />
        </button>

        <TransactionHistory 
          isOpen={isHistoryOpen} 
          onClose={() => setIsHistoryOpen(false)} 
        />
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setIsHistoryOpen(true)}
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

      <TransactionHistory 
        isOpen={isHistoryOpen} 
        onClose={() => setIsHistoryOpen(false)} 
      />
    </>
  );
} 