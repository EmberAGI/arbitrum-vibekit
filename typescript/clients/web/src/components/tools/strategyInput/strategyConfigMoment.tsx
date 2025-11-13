'use client';

import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { useAccount } from 'wagmi';
import { StrategyInfo } from './StrategyInfo';

interface Reward {
  type: 'points' | 'apy';
  multiplier?: number;
  percentage?: number;
  label: string;
}

interface Chain {
  chainName: string;
  chainIconUri?: string;
}

interface StrategyConfigMomentProps {
  name: string;
  subtitle?: string;
  protocol?: string;
  tokenIconUri?: string;
  platformIconUri?: string;
  rewards?: Reward[];
  chains?: Chain[];
  onUserAction?: (data: { walletAddress: string; amount: string }) => Promise<void>;
}

export function StrategyConfigMoment({
  name,
  subtitle,
  protocol,
  tokenIconUri,
  platformIconUri,
  rewards = [],
  chains = [],
  onUserAction,
}: StrategyConfigMomentProps) {
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { address } = useAccount();

  const handleSubmit = async () => {
    if (!address || !amount || !onUserAction) return;

    setIsSubmitting(true);
    try {
      await onUserAction({
        walletAddress: address,
        amount,
      });
    } catch (error) {
      console.error('Failed to submit strategy config:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <StrategyInfo
      name={name}
      subtitle={subtitle}
      protocol={protocol}
      tokenIconUri={tokenIconUri}
      platformIconUri={platformIconUri}
      primaryIconUri={platformIconUri}
      secondaryIconUri={tokenIconUri}
      primaryAlt={protocol || 'Platform'}
      secondaryAlt={name || 'Token'}
      rewards={rewards}
      chains={chains}
    >
      {/* Input with $ prefix and inline button */}
      <div className="relative flex-1">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 z-10">$</span>
        <Input
          type="text"
          placeholder="123,123.00"
          value={amount}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)}
          className="bg-[#0a0a0a] border-gray-800/50 text-white pl-7 pr-12 focus:border-gray-700 focus:ring-1 focus:ring-gray-700 rounded-lg"
        />
        <Button
          onClick={handleSubmit}
          disabled={!amount || isSubmitting}
          className="absolute right-1 top-1/2 -translate-y-1/2 bg-[#FD6731] hover:bg-[#FD6731]/90 text-white font-medium px-3 py-1.5 rounded-md transition-colors h-8 min-w-[2rem]"
        >
          {isSubmitting ? '...' : '→'}
        </Button>
      </div>
    </StrategyInfo>
  );
}
