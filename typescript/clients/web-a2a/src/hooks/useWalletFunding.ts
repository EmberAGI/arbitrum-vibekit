'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const FUNDED_STORAGE_PREFIX = 'ember-wallet-funded-';

type FundingState = 'idle' | 'checking' | 'funding' | 'success' | 'error';

type FundingResult = {
  message: string;
  funded: boolean;
  transactionHash?: string;
  amount?: string;
  chain?: string;
};

type FundableResponse = {
  canFund: boolean;
};

type UseWalletFundingReturn = {
  /** Whether the wallet has been funded (stored in localStorage or just funded) */
  isFunded: boolean;
  /** Whether the wallet can be funded (no transactions yet) */
  canFund: boolean;
  /** Current state of the funding process */
  fundingState: FundingState;
  /** Error message if funding failed */
  error: string | null;
  /** Result of the last successful funding operation */
  fundingResult: FundingResult | null;
  /** Manually trigger funding (auto-triggered on login when canFund is true) */
  fund: () => void;
  /** Whether any loading operation is in progress */
  isLoading: boolean;
  /** Reset the funding state (close modal, clear errors) */
  reset: () => void;
};

export function useWalletFunding(walletId: string | null): UseWalletFundingReturn {
  const queryClient = useQueryClient();
  const [fundingState, setFundingState] = useState<FundingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fundingResult, setFundingResult] = useState<FundingResult | null>(null);
  const [isFundedFromStorage, setIsFundedFromStorage] = useState<boolean>(false);

  // Check localStorage on mount
  useEffect(() => {
    if (!walletId) return;
    const storageKey = `${FUNDED_STORAGE_PREFIX}${walletId}`;
    const stored = localStorage.getItem(storageKey);
    setIsFundedFromStorage(stored === 'true');
  }, [walletId]);

  // Query to check if wallet can be funded
  const {
    data: fundableData,
    isLoading: isCheckingFundable,
    isFetched,
  } = useQuery<FundableResponse>({
    queryKey: ['wallet-fundable', walletId],
    queryFn: async () => {
      if (!walletId) throw new Error('No wallet ID');
      setFundingState('checking');
      console.log('Wallet id is', walletId);
      const response = await fetch(`/api/wallet/${walletId}/fundable`);
      if (!response.ok) {
        throw new Error('Failed to check wallet fundability');
      }
      const data = await response.json();
      setFundingState('idle');
      return data;
    },
    enabled: !!walletId && !isFundedFromStorage,
    staleTime: 60000, // Cache for 1 minute
    retry: 1,
  });

  const canFund = fundableData?.canFund ?? false;

  // Mutation to fund the wallet
  const fundMutation = useMutation<FundingResult, Error, void>({
    mutationFn: async () => {
      if (!walletId) throw new Error('No wallet ID');
      setFundingState('funding');
      setError(null);

      const response = await fetch(`/api/wallet/${walletId}/fund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to fund wallet');
      }

      return data;
    },
    onSuccess: (data) => {
      if (data.funded && walletId) {
        // Store in localStorage to prevent future funding attempts
        const storageKey = `${FUNDED_STORAGE_PREFIX}${walletId}`;
        localStorage.setItem(storageKey, 'true');
        setIsFundedFromStorage(true);
        setFundingResult(data);
        setFundingState('success');

        // Invalidate the fundable query
        queryClient.invalidateQueries({ queryKey: ['wallet-fundable', walletId] });
      } else {
        // Wallet already had transactions, no funding needed
        setFundingState('idle');
      }
    },
    onError: (err) => {
      setError(err.message);
      setFundingState('error');
    },
  });

  // Auto-trigger funding when conditions are met
  useEffect(() => {
    if (
      walletId &&
      isFetched &&
      canFund &&
      !isFundedFromStorage &&
      fundingState === 'idle' &&
      !fundMutation.isPending
    ) {
      fundMutation.mutate();
    }
  }, [walletId, isFetched, canFund, isFundedFromStorage, fundingState, fundMutation]);

  const fund = useCallback(() => {
    if (walletId && !fundMutation.isPending) {
      fundMutation.mutate();
    }
  }, [walletId, fundMutation]);

  const reset = useCallback(() => {
    setFundingState('idle');
    setError(null);
    setFundingResult(null);
  }, []);

  const isFunded = isFundedFromStorage || fundingState === 'success';
  const isLoading =
    isCheckingFundable ||
    fundMutation.isPending ||
    fundingState === 'checking' ||
    fundingState === 'funding';

  return {
    isFunded,
    canFund,
    fundingState,
    error,
    fundingResult,
    fund,
    isLoading,
    reset,
  };
}
