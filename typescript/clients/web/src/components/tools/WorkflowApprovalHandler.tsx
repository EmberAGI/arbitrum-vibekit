'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { type Delegation } from '@metamask/delegation-toolkit';
import { useDelegationExtractor, type DelegationData } from '@/lib/hooks/useDelegationExtractor';
import useMetamaskSmartAccount from '@/hooks/useMetamaskSmartAccount';

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
  const { isConnected, chain } = useAccount();
  const {
    smartAccount,
    isLoading: isSmartAccountLoading,
    error: smartAccountError,
  } = useMetamaskSmartAccount();
  const [expandedPolicies, setExpandedPolicies] = useState<Set<number>>(new Set([0]));
  const [isSubmittingAll, setIsSubmittingAll] = useState(false);
  const [isSubmissionComplete, setIsSubmissionComplete] = useState(false);
  const [signingStates, setSigningStates] = useState<
    Record<
      string,
      {
        isPending: boolean;
        isSuccess: boolean;
        signature?: string;
        error?: Error;
      }
    >
  >({});

  // Extract delegation data using the new hook
  const { delegationsData } = useDelegationExtractor(artifacts);

  // Check if this is delegation signing
  const isDelegationSigning = delegationsData.length > 0;

  // Check if all delegations are signed
  const isAllSigned =
    delegationsData.length > 0 && delegationsData.every((d) => signingStates[d.id]?.isSuccess);

  // Debug logging
  console.log('[WorkflowApprovalHandler] Component rendering with:', {
    artifacts,
    delegationsData: delegationsData.length,
    signingStates,
    isAllSigned,
    isSubmittingAll,
    isSubmissionComplete,
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

  // Handle signing a single delegation
  const handleSignDelegation = async (delegation: DelegationData) => {
    if (!isConnected) {
      console.warn('[WorkflowApprovalHandler] Wallet not connected');
      return;
    }

    if (!smartAccount) {
      console.warn('[WorkflowApprovalHandler] Smart account not available');
      return;
    }

    console.log('[WorkflowApprovalHandler] Signing delegation:', delegation.id);

    // Set pending state
    setSigningStates((prev) => ({
      ...prev,
      [delegation.id]: { isPending: true, isSuccess: false },
    }));

    try {
      // Get chainId from connected wallet
      if (!chain?.id) {
        throw new Error('No chain ID available from connected wallet');
      }
      const chainId = chain.id;

      // Get delegation environment (includes DelegationManager address)
      const signature = await smartAccount.signDelegation({
        delegation: delegation.delegation as Delegation,
        chainId,
      });

      // Set success state with signature
      setSigningStates((prev) => ({
        ...prev,
        [delegation.id]: { isPending: false, isSuccess: true, signature },
      }));

      console.log('[WorkflowApprovalHandler] Successfully signed delegation:', delegation.id);
    } catch (error) {
      console.error('[WorkflowApprovalHandler] Failed to sign delegation:', error);

      // Set error state
      setSigningStates((prev) => ({
        ...prev,
        [delegation.id]: {
          isPending: false,
          isSuccess: false,
          error: error as Error,
        },
      }));
    }
  };

  // Submit all signed delegations to the A2A agent
  const handleSubmitAllSignatures = async () => {
    if (!onUserAction || !isAllSigned) return;

    setIsSubmittingAll(true);
    try {
      // Get all signed delegations
      const formattedDelegations = delegationsData
        .filter((d) => signingStates[d.id]?.isSuccess)
        .map((d) => ({
          id: d.id,
          signedDelegation: signingStates[d.id].signature, // A2A expects 'signedDelegation' not 'signature'
        }));

      console.log('[WorkflowApprovalHandler] Submitting all signatures:', formattedDelegations);

      // Send the signed delegations back to the A2A agent
      await onUserAction({
        delegations: formattedDelegations,
      });

      console.log('[WorkflowApprovalHandler] All signatures submitted successfully');

      // Mark submission as complete
      setIsSubmissionComplete(true);
    } catch (error) {
      console.error('[WorkflowApprovalHandler] Failed to submit signatures:', error);
    } finally {
      setIsSubmittingAll(false);
    }
  };

  // Auto-submit when all delegations are signed
  useEffect(() => {
    if (isAllSigned && !isSubmittingAll && !isSubmissionComplete && onUserAction) {
      console.log('[WorkflowApprovalHandler] All delegations signed, auto-submitting...');
      handleSubmitAllSignatures();
    }
  }, [isAllSigned]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-expand the next unsigned delegation
  useEffect(() => {
    const nextUnsignedIndex = delegationsData.findIndex((d) => !signingStates[d.id]?.isSuccess);

    if (nextUnsignedIndex !== -1 && !expandedPolicies.has(nextUnsignedIndex)) {
      console.log('[WorkflowApprovalHandler] Auto-expanding delegation:', nextUnsignedIndex);
      setExpandedPolicies(new Set([nextUnsignedIndex]));
    }
  }, [signingStates, delegationsData, expandedPolicies]);

  // Delegation Signing Screen
  if (isDelegationSigning) {
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
                  You need to connect your wallet to sign delegations
                </p>
              </div>
              <ConnectButton />
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-2">
        {/* Policy Cards */}
        {delegationsData.map((delegation, idx) => {
          const isExpanded = expandedPolicies.has(idx);
          const signingState = signingStates[delegation.id] || {
            isPending: false,
            isSuccess: false,
          };
          const isPending = signingState.isPending;
          const isSuccess = signingState.isSuccess;
          const hasError = signingState.error != null;

          return (
            <Card
              key={idx}
              className={`border-gray-800/50 overflow-hidden component-fade-in ${
                isSuccess
                  ? 'bg-green-950/20 border-green-800/30'
                  : hasError
                    ? 'bg-red-950/20 border-red-800/30'
                    : 'bg-[#1a1a1a]'
              }`}
            >
              <div className="cursor-pointer p-4" onClick={() => togglePolicy(idx)}>
                {!isExpanded ? (
                  // Collapsed view
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 ${
                        isSuccess
                          ? 'bg-green-600 text-white'
                          : hasError
                            ? 'bg-red-600 text-white'
                            : 'bg-gray-800 text-gray-400'
                      }`}
                    >
                      {isSuccess ? '✓' : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0 flex items-center justify-between">
                      <h4 className="text-sm text-gray-400">{delegation.name}</h4>
                      {isSuccess && <CheckCircle className="w-4 h-4 text-green-500" />}
                      {hasError && <AlertCircle className="w-4 h-4 text-red-500" />}
                      {isPending && <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />}
                    </div>
                  </div>
                ) : (
                  // Expanded view
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 ${
                            isSuccess
                              ? 'bg-green-600 text-white'
                              : hasError
                                ? 'bg-red-600 text-white'
                                : 'bg-gray-800 text-white'
                          }`}
                        >
                          {isSuccess ? '✓' : idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-base font-medium text-white mb-2">
                            {delegation.name}
                          </h4>
                          <p className="text-sm text-gray-400 leading-relaxed mb-3">
                            {delegation.description}
                          </p>
                          <div className="text-sm text-gray-300">{delegation.policy}</div>
                          {hasError && signingState?.error && (
                            <div className="mt-3 p-2 bg-red-950/40 border border-red-800/50 rounded text-sm text-red-300">
                              Error: {signingState.error.message}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        {isSuccess ? (
                          <div className="flex items-center gap-2 text-green-500 px-6 py-2">
                            <CheckCircle className="w-4 h-4" />
                            <span className="text-sm font-medium">Signed</span>
                          </div>
                        ) : (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSignDelegation(delegation);
                            }}
                            disabled={isPending}
                            className="bg-orange-500 hover:bg-orange-600 text-white font-medium px-6"
                          >
                            {isPending ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Signing...
                              </>
                            ) : hasError ? (
                              'Retry'
                            ) : (
                              'Sign'
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          );
        })}

        {/* Submit All Button - shown when all are signed */}
        {isAllSigned && (
          <div className="mt-4 p-4 bg-green-950/20 border border-green-800/30 rounded-lg component-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <CheckCircle className="w-6 h-6 text-green-500" />
                <div className="flex-1">
                  <h4 className="text-base font-medium text-white">
                    {isSubmissionComplete ? 'Delegations Submitted' : 'All Delegations Signed'}
                  </h4>
                  <p className="text-sm text-gray-400">
                    {isSubmittingAll
                      ? 'Submitting to agent...'
                      : isSubmissionComplete
                        ? 'Ready to view your strategy'
                        : 'Ready to submit'}
                  </p>
                </div>
              </div>
              {isSubmittingAll && <Loader2 className="w-5 h-5 text-green-500 animate-spin" />}
              {isSubmissionComplete && onNavigateToParent && (
                <Button
                  onClick={onNavigateToParent}
                  className="bg-[#FD6731] hover:bg-[#FD6731]/90 text-white font-medium px-6 py-2 rounded-lg transition-colors"
                >
                  Continue
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // If not delegation signing, don't render anything (wallet/amount is handled by StrategyInputDisplay)
  if (!isDelegationSigning) {
    console.log('[WorkflowApprovalHandler] Not rendering - isDelegationSigning is false');
    console.log('[WorkflowApprovalHandler] Available artifacts:', Object.keys(artifacts || {}));
  }
  return null;
}
