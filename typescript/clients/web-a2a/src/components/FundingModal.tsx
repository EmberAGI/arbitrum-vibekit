'use client';

import React from 'react';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

type FundingState = 'idle' | 'checking' | 'funding' | 'success' | 'error';

type FundingResult = {
  message: string;
  funded: boolean;
  transactionHash?: string;
  amount?: string;
  chain?: string;
};

interface FundingModalProps {
  isOpen: boolean;
  fundingState: FundingState;
  error: string | null;
  fundingResult: FundingResult | null;
  onClose: () => void;
}

export const FundingModal: React.FC<FundingModalProps> = ({
  isOpen,
  fundingState,
  error,
  fundingResult,
  onClose,
}) => {
  // Don't show modal for idle state
  if (fundingState === 'idle' && !error && !fundingResult) {
    return null;
  }

  const isLoading = fundingState === 'checking' || fundingState === 'funding';
  const isSuccess = fundingState === 'success';
  const isError = fundingState === 'error';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={!isLoading} className="bg-[#1a1a1a] border-[#333]">
        <DialogHeader>
          <DialogTitle>
            {isLoading && 'Funding Your Wallet'}
            {isSuccess && 'Wallet Funded!'}
            {isError && 'Funding Failed'}
          </DialogTitle>
          <DialogDescription>
            {isLoading && 'Please wait while we fund your wallet with some ETH...'}
            {isSuccess && 'Your wallet has been successfully funded.'}
            {isError && 'There was an error funding your wallet.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-6 gap-4">
          {isLoading && (
            <>
              <Loader2 className="w-12 h-12 text-orange-500 animate-spin" />
              <p className="text-sm text-muted-foreground">
                {fundingState === 'checking'
                  ? 'Checking wallet status...'
                  : 'Processing transaction...'}
              </p>
            </>
          )}

          {isSuccess && fundingResult && (
            <>
              <CheckCircle className="w-12 h-12 text-green-500" />
              <div className="text-center space-y-2">
                <p className="text-sm font-medium">
                  {fundingResult.amount} ETH on {fundingResult.chain}
                </p>
                {fundingResult.transactionHash && (
                  <p className="text-xs text-muted-foreground break-all">
                    <span className="font-medium">Tx Hash:</span>{' '}
                    <a
                      href={`https://arbiscan.io/tx/${fundingResult.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-400 hover:underline"
                    >
                      {`${fundingResult.transactionHash.slice(0, 10)}...${fundingResult.transactionHash.slice(-8)}`}
                    </a>
                  </p>
                )}
              </div>
            </>
          )}

          {isError && (
            <>
              <XCircle className="w-12 h-12 text-red-500" />
              <p className="text-sm text-red-400 text-center">{error}</p>
            </>
          )}
        </div>

        {(isSuccess || isError) && (
          <DialogFooter>
            <Button onClick={onClose} variant="outline" className="w-full">
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
