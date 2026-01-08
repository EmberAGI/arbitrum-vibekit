'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { StackedIcons } from '@/components/ui/StackedIcons';

interface Chain {
  chainName: string;
  chainIconUri: string;
}

interface Reward {
  type: string;
  multiplier?: number;
  percentage?: number;
  reward: string;
}

interface X402PaymentData {
  name: string;
  subtitle: string;
  token: string;
  protocol: string;
  chains: Chain[];
  tokenIconUri: string;
  platformIconUri: string;
  rewards: Reward[];
  timePeriod: string;
  paymentAmount: string;
  usdcAmount: string;
  paymentTokenName: string;
  paymentTokenIconUri: string;
  summaryPrice: string;
  networkFees: string;
}

interface X402PaymentDisplayProps {
  // All artifacts from the message
  artifacts?: Record<string, any>;

  // Callback to send data back to the workflow
  onUserAction?: (data: any) => Promise<void>;
}

export function X402PaymentDisplay({ artifacts, onUserAction }: X402PaymentDisplayProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  // Extract payment data from artifacts
  const paymentArtifact = artifacts?.['x402-payment-display'];
  const paymentData: X402PaymentData | null = paymentArtifact?.parts?.[0]?.data;

  // Extract payment config data
  const configArtifact = artifacts?.['x402-payment-data'];
  const configData = configArtifact?.parts?.[0]?.data;

  console.log('[X402PaymentDisplay] Rendering with:', {
    artifacts: Object.keys(artifacts || {}),
    paymentData,
    configData,
  });

  if (!paymentData) {
    console.warn('[X402PaymentDisplay] No payment data found in artifacts');
    return null;
  }

  const handleConfirm = async () => {
    if (!onUserAction) return;

    setIsConfirming(true);
    try {
      // Mock signed x402 payment - in real implementation, this would involve actual signing
      const signedx402 = '0x' + 'a'.repeat(130); // Mock signature

      console.log('[X402PaymentDisplay] Confirming payment with signature:', signedx402);

      await onUserAction({
        signedx402,
      });

      setIsComplete(true);
      console.log('[X402PaymentDisplay] Payment confirmed successfully');
    } catch (error) {
      console.error('[X402PaymentDisplay] Failed to confirm payment:', error);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleDiscard = () => {
    console.log('[X402PaymentDisplay] Payment discarded');
    // Could add a callback for discarding if needed
  };

  return (
    <Card className="bg-[#1a1a1a] border-gray-800/50 max-w-md mx-auto component-fade-in">
      <CardContent className="p-6 space-y-4">
        {/* Header Section */}
        <div className="flex items-start gap-3">
          <div className="relative w-12 h-12 flex-shrink-0">
            <Image
              src={paymentData.platformIconUri}
              alt={paymentData.protocol}
              width={48}
              height={48}
              className="rounded-full"
            />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#1a1a1a] rounded-full flex items-center justify-center">
              <Image
                src={paymentData.tokenIconUri}
                alt={paymentData.token}
                width={20}
                height={20}
                className="rounded-full"
              />
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-white font-medium text-lg">{paymentData.name}</h3>
            <p className="text-gray-400 text-sm">{paymentData.subtitle}</p>
          </div>
        </div>

        {/* Chain Icons */}
        <div className="flex items-center gap-2">
          <StackedIcons
            primaryIconUri={paymentData.chains[0]?.chainIconUri}
            primaryAlt={paymentData.chains[0]?.chainName}
            secondaryIconUri={paymentData.chains[1]?.chainIconUri}
            secondaryAlt={paymentData.chains[1]?.chainName}
          />
          <div className="flex gap-2">
            {paymentData.chains.map((chain, idx) => (
              <span key={idx} className="text-gray-400 text-sm">
                {chain.chainName}
              </span>
            ))}
          </div>
        </div>

        {/* Rewards Section */}
        <div className="flex gap-3">
          {paymentData.rewards.map((reward, idx) => (
            <div key={idx} className="flex-1 bg-[#252525] rounded-lg px-3 py-2 text-center">
              <div className="text-white font-semibold text-lg">
                {reward.type === 'points' && `${reward.multiplier}x`}
                {reward.type === 'apy' && `${reward.percentage}%`}
              </div>
              <div className="text-gray-400 text-xs">{reward.reward}</div>
            </div>
          ))}
        </div>

        {/* Time Period */}
        <div className="bg-[#252525] rounded-lg px-4 py-3">
          <div className="text-gray-400 text-xs mb-1">Time Period</div>
          <div className="text-white text-sm">{paymentData.timePeriod}</div>
        </div>

        {/* Payment Amount */}
        <div className="bg-[#252525] rounded-lg px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white text-2xl font-bold">{paymentData.paymentAmount}</div>
              <div className="text-gray-400 text-sm">{paymentData.usdcAmount}</div>
            </div>
            <div className="w-10 h-10 flex-shrink-0">
              <Image
                src={paymentData.paymentTokenIconUri}
                alt={paymentData.paymentTokenName}
                width={40}
                height={40}
                className="rounded-full"
              />
            </div>
          </div>
        </div>

        {/* Pricing Info */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Price</span>
            <span className="text-white">{paymentData.summaryPrice}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Network Fees</span>
            <span className="text-white">{paymentData.networkFees}</span>
          </div>
        </div>

        {/* Additional Info */}
        <div className="bg-[#252525] rounded-lg px-4 py-3">
          <p className="text-gray-400 text-xs text-center">
            You&apos;ll receive automated management services for a month
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={handleConfirm}
            disabled={isConfirming || isComplete}
            className="flex-1 bg-[#FD6731] hover:bg-[#FD6731]/90 text-white font-medium h-11 rounded-lg"
          >
            {isConfirming ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Confirming...
              </>
            ) : isComplete ? (
              'Confirmed ✓'
            ) : (
              `Confirm x402 Payment`
            )}
          </Button>
          <Button
            onClick={handleDiscard}
            disabled={isConfirming || isComplete}
            variant="outline"
            className="px-6 bg-transparent border-gray-700 hover:bg-gray-800 text-white font-medium h-11 rounded-lg"
          >
            Discard
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
