"use client";

import { useState, useCallback } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { ethers } from 'ethers';
import { TriggerXClient, createJob, type CreateJobInput } from 'sdk-triggerx';

export interface TriggerXJobParameters {
  jobInput: CreateJobInput;
  triggerxApiKey: string;
  rpcUrl: string;
}

export interface TriggerXExecutionResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  jobResult?: any;
}

export function useTriggerXSDK() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<TriggerXExecutionResult | null>(null);

  const executeJob = useCallback(async (
    jobParameters: TriggerXJobParameters
  ): Promise<TriggerXExecutionResult> => {
    if (!isConnected || !address || !walletClient) {
      const error = 'Wallet not connected';
      setExecutionResult({ success: false, error });
      return { success: false, error };
    }

    setIsExecuting(true);
    setExecutionResult(null);

    try {
      console.log('🚀 [TriggerX] Starting job execution with MetaMask signer...');
      console.log('📋 [TriggerX] Job parameters:', jobParameters);

      // Create TriggerX client
      const triggerxClient = new TriggerXClient(jobParameters.triggerxApiKey);
      
      // Set up environment for SDK
      if (typeof window !== 'undefined') {
        (window as any).process = { env: { API_KEY: jobParameters.triggerxApiKey } };
      }
      process.env.API_KEY = jobParameters.triggerxApiKey;

      // Create ethers provider and signer from wagmi wallet client
      console.log('🔗 [TriggerX] Creating ethers signer from MetaMask...');
      
      // Convert wagmi wallet client to ethers provider and signer
      const provider = new ethers.BrowserProvider(walletClient);
      const ethersSigner = await provider.getSigner();
      
      console.log('✅ [TriggerX] MetaMask signer created:', {
        address: await ethersSigner.getAddress(),
        chainId: await ethersSigner.provider.getNetwork()
      });

      // Execute the actual TriggerX SDK call with real MetaMask signer
      console.log('📤 [TriggerX] Calling createJob SDK with MetaMask signer...');
      
      const createJobResult = await createJob(triggerxClient, {
        jobInput: jobParameters.jobInput,
        signer: ethersSigner // 🎯 This is the REAL MetaMask signer!
      });

      console.log('✅ [TriggerX] Job created successfully:', createJobResult);

      const result: TriggerXExecutionResult = {
        success: true,
        jobResult: createJobResult,
        transactionHash: (createJobResult as any)?.transactionHash || 'Unknown'
      };

      setExecutionResult(result);
      return result;

    } catch (error) {
      console.error('❌ [TriggerX] Job execution failed:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const result: TriggerXExecutionResult = {
        success: false,
        error: errorMessage
      };

      setExecutionResult(result);
      return result;
    } finally {
      setIsExecuting(false);
    }
  }, [isConnected, address, walletClient]);

  const resetResult = useCallback(() => {
    setExecutionResult(null);
  }, []);

  return {
    executeJob,
    isExecuting,
    executionResult,
    resetResult,
    isReady: isConnected && !!address && !!walletClient
  };
}
