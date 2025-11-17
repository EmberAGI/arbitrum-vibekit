'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { usePolicyExtractor } from '@/lib/hooks/usePolicyExtractor';
import { addPermissionsToSessionKey } from '@/lib/utils/zerodev';

interface WorkflowApprovalHandlerProps {
  // Input schema from status message
  schema?: any;
  statusMessage?: any;

  // All artifacts from the message
  artifacts?: Record<string, any>;

  // Callback to send data back to the workflow
  onUserAction?: (data: any) => Promise<void>;

  // Callback to navigate to parent session
  onNavigateToParent?: () => void;
}

export function WorkflowApprovalHandler({
  artifacts,
  onUserAction,
  onNavigateToParent,
}: WorkflowApprovalHandlerProps) {
  const { isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [expandedPolicies, setExpandedPolicies] = useState<Set<number>>(new Set());
  const [isSigning, setIsSigning] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Extract policy data using the hook
  const policyExtractor = usePolicyExtractor(artifacts);

  // Check if this is policy signing
  const isPolicySigning = policyExtractor !== undefined;

  // Debug logging
  console.log('[WorkflowApprovalHandler] Component rendering with:', {
    artifacts,
    hasPolicies: isPolicySigning,
    policyCount: policyExtractor?.display.length,
    isSigning,
    isSuccess,
    isSubmitting,
  });

  const togglePolicy = (index: number) => {
    setExpandedPolicies((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Handle signing all policies at once
  const handleSignPolicies = async () => {
    if (!isConnected || !policyExtractor || !walletClient || !publicClient) {
      console.warn('[WorkflowApprovalHandler] Missing requirements for signing');
      return;
    }

    console.log('[WorkflowApprovalHandler] Starting policy signing...');
    setIsSigning(true);
    setError(null);

    try {
      // Sign the policies
      console.log(
        '[WorkflowApprovalHandler] Signing policies with session key:',
        policyExtractor.publicSessionKey,
      );
      const approval = await addPermissionsToSessionKey(
        policyExtractor.publicSessionKey,
        policyExtractor.policy,
        walletClient,
        publicClient,
        policyExtractor.kernelVersion,
        policyExtractor.entryPointVersion,
      );

      console.log('[WorkflowApprovalHandler] Successfully signed policies');

      setIsSuccess(true);
      setIsSigning(false);

      // Auto-submit the approval
      if (onUserAction) {
        setIsSubmitting(true);
        try {
          await onUserAction({ approval });
          console.log('[WorkflowApprovalHandler] Approval submitted successfully');
        } catch (submitError) {
          console.error('[WorkflowApprovalHandler] Failed to submit approval:', submitError);
          setError(submitError as Error);
        } finally {
          setIsSubmitting(false);
        }
      }
    } catch (err) {
      console.error('[WorkflowApprovalHandler] Failed to sign policies:', err);
      setError(err as Error);
      setIsSigning(false);
    }
  };

  // Policy Signing Screen
  if (isPolicySigning && policyExtractor) {
    // Show wallet connection prompt if not connected
    if (!isConnected) {
      return (
        <Card className="bg-[#1a1a1a] border-gray-800/50 component-fade-in">
          <CardContent className="p-6">
            <div className="flex flex-col items-center gap-4">
              <AlertCircle className="w-12 h-12 text-orange-500" />
              <div className="text-center">
                <h3 className="text-lg font-medium text-white mb-2">Connect Your Wallet</h3>
                <p className="text-sm text-gray-400 mb-4">
                  You need to connect your wallet to sign policies
                </p>
              </div>
              <ConnectButton />
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        {/* Policy Display Cards (read-only, collapsible) */}
        <div className="space-y-2">
          {policyExtractor.display.map((policy, idx) => {
            const isExpanded = expandedPolicies.has(idx);

            return (
              <Card
                key={idx}
                className="border-gray-800/50 bg-[#1a1a1a] overflow-hidden component-fade-in"
              >
                <div className="cursor-pointer p-4" onClick={() => togglePolicy(idx)}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 bg-gray-800 text-white">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-base font-medium text-white mb-1">{policy.name}</h4>
                        {isExpanded && (
                          <div className="mt-2 space-y-2">
                            <p className="text-sm text-gray-400 leading-relaxed">
                              {policy.description}
                            </p>
                            <div className="text-sm text-gray-300">{policy.policy}</div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Single Sign Button or Success State */}
        {!isSuccess ? (
          <Card className="bg-[#1a1a1a] border-gray-800/50">
            <CardContent className="p-6">
              <div className="flex flex-col items-center gap-4">
                {error && (
                  <div className="w-full p-3 bg-red-950/40 border border-red-800/50 rounded text-sm text-red-300 mb-2">
                    Error: {error.message}
                  </div>
                )}
                <Button
                  onClick={handleSignPolicies}
                  disabled={isSigning || isSubmitting}
                  className="bg-orange-500 hover:bg-orange-600 text-white font-medium px-8 py-2 w-full"
                >
                  {isSigning || isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {isSigning ? 'Signing Policies...' : 'Submitting...'}
                    </>
                  ) : (
                    'Sign All Policies'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-green-950/20 border-green-800/30 component-fade-in">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <CheckCircle className="w-6 h-6 text-green-500" />
                  <div className="flex-1">
                    <h4 className="text-base font-medium text-white">
                      {isSubmitting ? 'Submitting Policies...' : 'Policies Signed Successfully'}
                    </h4>
                    <p className="text-sm text-gray-400">
                      {isSubmitting ? 'Sending to agent...' : 'Ready to continue'}
                    </p>
                  </div>
                </div>
                {isSubmitting && <Loader2 className="w-5 h-5 text-green-500 animate-spin" />}
                {!isSubmitting && onNavigateToParent && (
                  <Button
                    onClick={onNavigateToParent}
                    className="bg-[#FD6731] hover:bg-[#FD6731]/90 text-white font-medium px-6 py-2 rounded-lg transition-colors"
                  >
                    Continue
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // If not policy signing, don't render anything
  if (!isPolicySigning) {
    console.log('[WorkflowApprovalHandler] Not rendering - isPolicySigning is false');
    console.log('[WorkflowApprovalHandler] Available artifacts:', Object.keys(artifacts || {}));
  }
  return null;
}
