"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState } from "react";
import { createJob } from 'sdk-triggerx';
import { deleteJob  } from 'sdk-triggerx/dist/api/deleteJob.js';
import { getJobDataById } from 'sdk-triggerx/dist/api/getJobDataById.js';
import { TriggerXClient } from 'sdk-triggerx';
import { createSafeWallet } from 'sdk-triggerx/dist/api/safeWallet.js';
import { ethers } from 'ethers';

export function AutoSynth({
  txPreview,
  jobData,
}: {
  txPreview: any; // TriggerX job preview or Safe wallet transaction preview
  jobData: any;   // TriggerX job data containing jobInput or Safe wallet data
}) {
  console.log("[AutoSynth Component] Received txPreview:", JSON.stringify(txPreview, null, 2));
  console.log("[AutoSynth Component] Received jobData:", JSON.stringify(jobData, null, 2));

  // --- Wagmi hooks ---
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  // --- Local state for job creation ---
  const [isCreating, setIsCreating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  // --- Local state for job deletion ---
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // --- Local state for Safe wallet creation ---
  const [isCreatingSafe, setIsCreatingSafe] = useState(false);
  const [safeSuccess, setSafeSuccess] = useState(false);
  const [safeError, setSafeError] = useState<string | null>(null);
  const [safeAddress, setSafeAddress] = useState<string | null>(null);

  const signAndCreateJob = async () => {
    if (!isConnected || !address || !jobData?.jobInput) {
      setError("Wallet not connected or job data missing");
      return;
    }

    try {
      setIsCreating(true);
      setError(null);

      // Check if we need to switch chain (TriggerX typically uses Arbitrum Sepolia - chain ID 421614)
      const targetChainId = parseInt(jobData.jobInput.chainId || '421614', 10);
      if (chainId !== targetChainId) {
        await switchChainAsync({ chainId: targetChainId });
      }

      // Get the user's signer from their connected wallet
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();

      // Initialize TriggerX client
      // Note: This should be configured via environment variables
      const apiKey = process.env.NEXT_PUBLIC_TRIGGERX_API_KEY;
      if (!apiKey) {
        throw new Error('TriggerX API key not configured. Please set NEXT_PUBLIC_TRIGGERX_API_KEY environment variable.');
      }
      const triggerxClient = new TriggerXClient(apiKey);

      console.log('🔄 Creating job with user signer...');
      console.log('User address:', address);
      console.log('Job input:', jobData.jobInput);

      // Call the TriggerX SDK createJob function with user's signer
      const result = await createJob(triggerxClient, {
        jobInput: jobData.jobInput,
        signer: signer,
      });

      console.log('📥 TriggerX SDK response:', result);

      // Extract job ID from the response
      const extractedJobId =
        (result as any)?.jobId ||
        (result as any)?.id ||
        (result as any)?.data?.jobId ||
        (Array.isArray((result as any)?.data?.job_ids) && (result as any).data.job_ids.length > 0 && (result as any).data.job_ids[0]) ||
        'unknown';

      setJobId(extractedJobId);
      setIsSuccess(true);
      console.log('✅ Job created successfully with ID:', extractedJobId);

    } catch (err: any) {
      console.error('❌ Error creating job:', err);
      setError(err.message || 'Failed to create job');
    } finally {
      setIsCreating(false);
    }
  };

  const signAndCreateSafeWallet = async () => {
    if (!isConnected || !address) {
      setSafeError("Wallet not connected");
      return;
    }

    try {
      setIsCreatingSafe(true);
      setSafeError(null);

      // Check if we need to switch chain (TriggerX typically uses Arbitrum Sepolia - chain ID 421614)
      const targetChainId = parseInt(txPreview?.chainId || '421614', 10);
      if (chainId !== targetChainId) {
        await switchChainAsync({ chainId: targetChainId });
      }

      // Get the user's signer from their connected wallet
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();

      console.log('🔐 Creating Safe wallet with user signer...');
      console.log('User address:', address);
      console.log('Target chain:', targetChainId);

      // Call the SDK to create the Safe wallet on the current signer network
      const createdSafeAddress = await createSafeWallet(signer);

      console.log('✅ Safe wallet created successfully:', createdSafeAddress);
      setSafeAddress(createdSafeAddress);
      setSafeSuccess(true);

    } catch (err: any) {
      console.error('❌ Error creating Safe wallet:', err);
      setSafeError(err.message || 'Failed to create Safe wallet');
    } finally {
      setIsCreatingSafe(false);
    }
  };

  const signAndDeleteJob = async () => {
    try {
      setIsDeleting(true);
      setDeleteError(null);

      const targetChainId = parseInt(txPreview?.chainId || '421614', 10);
      const jobIdToDelete = txPreview?.jobId;
      if (!isConnected || !address || !jobIdToDelete) {
        setDeleteError('Wallet not connected or delete plan missing jobId');
        return;
      }

      if (chainId !== targetChainId) {
        await switchChainAsync({ chainId: targetChainId });
      }

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();

      const apiKey = process.env.NEXT_PUBLIC_TRIGGERX_API_KEY;
      if (!apiKey) {
        throw new Error('TriggerX API key not configured. Please set NEXT_PUBLIC_TRIGGERX_API_KEY.');
      }
      const triggerxClient = new TriggerXClient(apiKey);

      // 1) Check if job exists before attempting delete
      try {
        await getJobDataById(triggerxClient, String(jobIdToDelete));
      } catch (_) {
        // Treat missing job as already deleted
        setDeleteSuccess(true);
        console.log('ℹ️ Job already deleted:', jobIdToDelete);
        return;
      }

      // 2) Attempt on-chain + API delete
      await deleteJob(triggerxClient, String(jobIdToDelete), signer, String(targetChainId));

      setDeleteSuccess(true);
      console.log('✅ Job deleted successfully:', jobIdToDelete);
    } catch (err: any) {
      console.error('❌ Error deleting job:', err);
      const msg = String(err?.message || '')
        .toLowerCase();
      if (msg.includes('execution reverted') || msg.includes('call_exception') || msg.includes('estimategas')) {
        setDeleteSuccess(true);
        setDeleteError(null);
        console.log('ℹ️ Treating revert as already deleted');
      } else {
        setDeleteError(err?.message || 'Failed to delete job');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // Determine if this is Safe wallet creation or job creation
  const isSafeWalletCreation = txPreview?.action === 'createSafeWallet';
  const hasValidData = txPreview && (jobData || isSafeWalletCreation);

  return (
    <>
      {hasValidData && (
        <div className="flex flex-col gap-2 p-8 bg-transparent shadow-md rounded-2xl text-white border-blue-200 border-2">
          <h2 className="text-lg font-semibold mb-4">
            {isSafeWalletCreation ? 'Safe Wallet Creation Preview:' : 'TriggerX Job Preview:'}
          </h2>
          
          {/* Preview Rendering */}
          <div className="rounded-xl bg-zinc-700 p-4 flex flex-col gap-2">
            <span className="font-normal flex gap-3 w-full items-center text-sm">
              Action: {txPreview.action?.toUpperCase()}
            </span>

            {txPreview.action === 'deleteJob' ? (
              <>
                <p className="font-normal w-full">
                  <span className="font-semibold">Job ID:</span> {txPreview.jobId}
                </p>
                <p className="font-normal w-full">
                  <span className="font-semibold">Chain:</span> {txPreview.chainId}
                </p>
              </>
            ) : txPreview.action === 'createSafeWallet' ? (
              <>
                <p className="font-normal w-full">
                  <span className="font-semibold">User Address:</span> {txPreview.userAddress === '0x0000000000000000000000000000000000000000' ? 'Will use connected wallet' : txPreview.userAddress}
                </p>
                <p className="font-normal w-full">
                  <span className="font-semibold">Chain:</span> {txPreview.chainId} (Arbitrum Sepolia)
                </p>
                <p className="font-normal w-full text-sm text-gray-300">
                  Creates a new Safe wallet with enhanced security features for automated job execution.
                </p>
                {jobData?.walletData && (
                  <>
                    <p className="font-normal w-full">
                      <span className="font-semibold">Estimated Cost:</span> {jobData.walletData.estimatedCost} ETH
                    </p>
                    <p className="font-normal w-full text-sm text-gray-300">
                      <span className="font-semibold">Description:</span> {jobData.walletData.description}
                    </p>
                  </>
                )}
              </>
            ) : (
              <>
                <p className="font-normal w-full">
                  <span className="font-semibold">Job Title:</span> {txPreview.jobTitle}
                </p>
                <p className="font-normal w-full">
                  <span className="font-semibold">Schedule Types:</span> {txPreview.scheduleTypes?.join(', ')}
                </p>
                <p className="font-normal w-full">
                  <span className="font-semibold">Target Contract:</span> {txPreview.targetContract}
                </p>
                <p className="font-normal w-full">
                  <span className="font-semibold">Function:</span> {txPreview.targetFunction}
                </p>
                <p className="font-normal w-full">
                  <span className="font-semibold">Chain:</span> {txPreview.chainId}
                </p>
                {txPreview.walletMode && (
                  <p className="font-normal w-full">
                    <span className="font-semibold">Wallet Mode:</span> {txPreview.walletMode}
                    {txPreview.walletMode === 'safe' && txPreview.safeAddress && (
                      <span className="text-sm text-gray-300 block">Safe: {txPreview.safeAddress}</span>
                    )}
                  </p>
                )}
                {txPreview.timeInterval && (
                  <p className="font-normal w-full">
                    <span className="font-semibold">Time Interval:</span> {txPreview.timeInterval} seconds
                  </p>
                )}
                {txPreview.cronExpression && (
                  <p className="font-normal w-full">
                    <span className="font-semibold">Cron Expression:</span> {txPreview.cronExpression}
                  </p>
                )}
                {txPreview.specificSchedule && (
                  <p className="font-normal w-full">
                    <span className="font-semibold">Specific Schedule:</span> {txPreview.specificSchedule}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Safe Wallet Configuration Prompt */}
          {isSafeWalletCreation && (
            <div className="mt-4 p-4 bg-blue-900 rounded-lg border border-blue-700">
              <h3 className="text-lg font-semibold text-blue-200 mb-2">🔐 Safe Wallet Configuration</h3>
              <div className="text-blue-100 space-y-2">
                <p><strong>What this creates:</strong> A new Safe wallet with multi-signature capabilities</p>
                <p><strong>Security features:</strong> Enhanced transaction validation and approval workflows</p>
                <p><strong>Use case:</strong> Automated job execution with additional security layers</p>
                <p><strong>Next steps:</strong> After creation, you can use this Safe wallet for secure job execution</p>
              </div>
            </div>
          )}

          {isConnected ? (
            <>
              {/* Job Success Status */}
              {isSuccess && (
                <p className="p-2 rounded-2xl border-green-800 bg-green-200 w-full border-2 text-green-800">
                  Job Created Successfully! Job ID: {jobId}
                </p>
              )}

              {/* Safe Wallet Success Status */}
              {safeSuccess && (
                <p className="p-2 rounded-2xl border-green-800 bg-green-200 w-full border-2 text-green-800">
                  Safe Wallet Created Successfully! Address: {safeAddress}
                </p>
              )}
              
              {/* Job Creating Status */}
              {isCreating && (
                <p className="p-2 rounded-2xl border-gray-400 bg-gray-200 w-full border-2 text-slate-800">
                  Creating Job... Please sign the transaction in your wallet.
                </p>
              )}

              {/* Safe Wallet Creating Status */}
              {isCreatingSafe && (
                <p className="p-2 rounded-2xl border-blue-400 bg-blue-200 w-full border-2 text-blue-800">
                  Creating Safe Wallet... Please sign the transaction in your wallet.
                </p>
              )}
              
              {/* Job Error Status */}
              {error && (
                <p className="p-2 rounded-2xl border-red-800 bg-red-400 w-full border-2 text-white break-words">
                  Job Error: {error}
                </p>
              )}

              {/* Safe Wallet Error Status */}
              {safeError && (
                <p className="p-2 rounded-2xl border-red-800 bg-red-400 w-full border-2 text-white break-words">
                  Safe Wallet Error: {safeError}
                </p>
              )}

              {/* Delete Error Status */}
              {deleteError && (
                <p className="p-2 rounded-2xl border-red-800 bg-red-400 w-full border-2 text-white break-words">
                  Delete Error: {deleteError}
                </p>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                {/* Job Creation Button */}
                {txPreview?.action !== 'deleteJob' && txPreview?.action !== 'createSafeWallet' && (
                  <button
                    className="mt-4 bg-blue-700 text-white py-2 px-4 rounded-full disabled:opacity-50"
                    type="button"
                    onClick={signAndCreateJob}
                    disabled={isCreating || isSuccess}
                  >
                    {isCreating
                      ? "Creating Job..."
                      : isSuccess
                      ? "Job Created"
                      : "Sign & Create Job"}
                  </button>
                )}

                {/* Safe Wallet Creation Button */}
                {txPreview?.action === 'createSafeWallet' && (
                  <button
                    className="mt-4 bg-green-700 text-white py-2 px-4 rounded-full disabled:opacity-50"
                    type="button"
                    onClick={signAndCreateSafeWallet}
                    disabled={isCreatingSafe || safeSuccess}
                  >
                    {isCreatingSafe
                      ? "Creating Safe Wallet..."
                      : safeSuccess
                      ? "Safe Wallet Created"
                      : "Sign & Create Safe Wallet"}
                  </button>
                )}

                {/* Job Deletion Button */}
                {txPreview?.action === 'deleteJob' && (
                  <button
                    className="mt-4 bg-red-700 text-white py-2 px-4 rounded-full disabled:opacity-50"
                    type="button"
                    onClick={signAndDeleteJob}
                    disabled={isDeleting || deleteSuccess}
                  >
                    {isDeleting
                      ? "Deleting Job..."
                      : deleteSuccess
                      ? "Job Deleted"
                      : "Sign & Delete Job"}
                  </button>
                )}
              </div>
            </>
          ) : (
            // Wallet not connected section
            <p className="text-red-500 p-2 flex rounded-2xl border-gray-400 bg-gray-200 w-full border-2 flex-col">
              <div className="mb-2">Please connect your Wallet to proceed</div>
              <ConnectButton />
            </p>
          )}
        </div>
      )}
    </>
  );
}
