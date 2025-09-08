import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSendTransaction } from 'wagmi';
import type { useSwitchChain } from 'wagmi';
import { type Hex, BaseError } from 'viem';
import {
  withSafeDefaults,
  toBigInt,
  type RawTransaction,
  type TxPlan,
} from '../lib/transactionUtils';
import type { InsertTransactionInput } from '../components/artifact';

// Args interface expects necessary values from the calling component's wagmi hooks
interface UseTransactionExecutorArgs {
  txPlan: TxPlan | null;
  isConnected: boolean;
  address?: Hex;
  currentChainId?: number;
  switchChainAsync?: ReturnType<typeof useSwitchChain>['switchChainAsync'];
  agentType?: string; // Add agentType prop
  agentId?: string; // Add agentId prop
  methodName?: string; // Add methodName prop
}

// Return interface defines the state and actions exposed by the hook
interface UseTransactionExecutorReturn {
  approveNext: () => Promise<void>;
  executeMain: () => Promise<void>;
  approvalIndex: number;
  totalApprovals: number;
  isApprovalPending: boolean;
  approvalError: Error | null;
  isTxPending: boolean;
  isTxSuccess: boolean;
  txError: Error | null;
  canApprove: boolean;
  canExecute: boolean;
  isApprovalPhaseComplete: boolean;
}

// The actual hook implementation
export function useTransactionExecutor({
  txPlan,
  isConnected,
  address,
  currentChainId,
  switchChainAsync,
  agentType = 'unknown', // Default agent type
  agentId = 'unknown', // Default agent id
  methodName,
}: UseTransactionExecutorArgs): UseTransactionExecutorReturn {
  // Internal Wagmi hook for sending transactions
  const {
    data: _txResultData, // Result data of the last successful transaction
    error: wagmiTxError, // Raw error object from wagmi
    isPending: isWagmiTxPending, // Is wagmi currently sending ANY tx?
    isSuccess: isWagmiTxSuccess, // Was the last wagmi tx successful?
    sendTransactionAsync,
    reset: resetWagmiSendState,
  } = useSendTransaction();

  console.log('[useTransactionExecutor] Initializing with txPlan:', txPlan);

  console.log('[useTransactionExecutor] Initialized with txPlan:', _txResultData);

  // --- Internal State ---
  const [approvalIndex, setApprovalIndex] = useState(0);
  const [isApprovalSubmitting, setIsApprovalSubmitting] = useState(false); // True only during the async approval call
  const [approvalError, setApprovalError] = useState<Error | null>(null);
  const [mainTxSubmitted, setMainTxSubmitted] = useState(false); // Tracks if executeMain was *called*
  const [isProcessingTx, setIsProcessingTx] = useState(false); // General lock during processTx
  const [lastProcessedTxHash, setLastProcessedTxHash] = useState<string | null>(null); // Track processed transactions

  // --- Derived State from Props and Internal State ---
  const { approvalTxs, mainTx, totalApprovals, needsApproval } = useMemo(() => {
    const approvals = txPlan && txPlan.length > 1 ? txPlan.slice(0, -1) : [];
    const main = txPlan?.[txPlan.length - 1];
    return {
      approvalTxs: approvals,
      mainTx: main,
      totalApprovals: approvals.length,
      needsApproval: approvals.length > 0,
    };
  }, [txPlan]);

  const isApprovalPhaseComplete = useMemo(
    () => approvalIndex >= totalApprovals,
    [approvalIndex, totalApprovals]
  );

  // Pending state specifically for the *approval* button/process
  const isCurrentApprovalPending = isApprovalSubmitting || (isWagmiTxPending && !mainTxSubmitted);

  // Pending state specifically for the *main execution* button/process
  const isMainExecutionPending = isWagmiTxPending && mainTxSubmitted;

  // Can the user initiate the *next* approval?
  const canApprove = useMemo(
    () =>
      needsApproval &&
      !isApprovalPhaseComplete &&
      !isCurrentApprovalPending && // Don't allow if approval is submitting/pending
      !isMainExecutionPending && // Don't allow if main tx is pending
      !approvalError &&
      isConnected,
    [
      needsApproval,
      isApprovalPhaseComplete,
      isCurrentApprovalPending,
      isMainExecutionPending,
      approvalError,
      isConnected,
    ]
  );


  const canExecute = useMemo(
    () => {
      // Determine if there's an active error related to the main transaction attempt
      const currentTxError = mainTxSubmitted ? wagmiTxError : null;

      return (
        !!mainTx &&
        (isApprovalPhaseComplete || !needsApproval) &&
        !isCurrentApprovalPending && // Don't allow if approval is submitting/pending
        !isMainExecutionPending && // Don't allow if main tx is pending
        !currentTxError && // Check the derived main transaction error
        isConnected
      );
    },
    [
      mainTx,
      isApprovalPhaseComplete,
      needsApproval,
      isCurrentApprovalPending,
      isMainExecutionPending,
      wagmiTxError,
      mainTxSubmitted,
      isConnected,
    ] // Correct dependencies
  );


  const processTx = useCallback(
    async (transaction: RawTransaction | undefined, isApproval: boolean) => {


      // Basic validation
      if (!transaction || !transaction.to || !transaction.chainId)
        throw new Error('Invalid transaction data.');
      if (!isConnected || !currentChainId || !switchChainAsync || !address || !sendTransactionAsync)
        throw new Error('Wallet disconnected or hooks unavailable.');

      const requiredChainId = Number.parseInt(String(transaction.chainId));
      if (Number.isNaN(requiredChainId)) throw new Error(`Invalid chainId: ${transaction.chainId}`);

     
      setIsProcessingTx(true);
      if (isApproval) {
        setIsApprovalSubmitting(true);
        setApprovalError(null);
      } else {
        setMainTxSubmitted(true); // Mark main TX as attempted *before* async calls
        // Wagmi state will reflect the main transaction attempt
      }

      try {
        // 1. Switch Chain
        if (currentChainId !== requiredChainId) {
          console.log(`[processTx] Switching chain ${currentChainId} -> ${requiredChainId}`);
          await switchChainAsync({ chainId: requiredChainId });
          console.log(`[processTx] Chain switch successful.`);
          // Note: wagmi's state updates might take a moment after switch
        }

        // 2. Prepare Base
        const txBase = {
          to: transaction.to,
          data: transaction.data,
          value: toBigInt(transaction.value),
        };

        // 3. Get Gas Overrides (with fallback)
        let overrides = {};
        try {
          console.log(`[processTx] Estimating gas for chain ${requiredChainId}...`);
          overrides = await withSafeDefaults(requiredChainId, txBase, address);
          console.log(`[processTx] Gas overrides received:`, overrides);
        } catch (estErr) {
          console.warn(`[processTx] Gas estimation failed, proceeding without overrides.`, estErr);
        }

        // 4. Send Transaction
        const finalTx = { ...txBase, ...overrides };
        console.log(`[processTx] Sending final ${isApproval ? 'approval' : 'main'} tx:`, finalTx);
        await sendTransactionAsync(finalTx);
        console.log(
          `[processTx] sendTransactionAsync finished for ${isApproval ? 'approval' : 'main'} tx.`
        );

        // 5. Update State on Success (wagmi handles success state for main)
        if (isApproval) {
          // Must wait for the next render cycle for isWagmiTxSuccess to be true potentially
          // Let's advance index optimistically here
          setApprovalIndex(idx => idx + 1);
          console.log(
            `[processTx] Approval ${approvalIndex + 1}/${totalApprovals} submitted successfully. Advanced index.`
          );
        }
      } catch (err: any) {
        console.error(
          `[processTx] Error during ${isApproval ? 'approval' : 'main'} tx processing:`,
          err
        );
        const message =
          err instanceof BaseError
            ? err.shortMessage
            : err instanceof Error
              ? err.message
              : 'Unknown transaction error';
        if (isApproval) {
          setApprovalError(new Error(message));
          // If approval fails, do not advance index
        }
        // Main transaction error is captured by wagmiTxError
        // Re-throw might be needed if callers need to react immediately, but generally state is preferred
      } finally {
        // Reset flags specific to this process call
        if (isApproval) {
          setIsApprovalSubmitting(false);
        }
        setIsProcessingTx(false); // Unlock general processing
        // Do NOT reset mainTxSubmitted here - it indicates an attempt *was* made.
        // Wagmi state (isPending, isSuccess, error) should be reset explicitly when needed (e.g., before a new main tx attempt)
      }
    },
    [
      // Dependencies for processTx
      isConnected,
      currentChainId,
      switchChainAsync,
      address,
      sendTransactionAsync,
      approvalIndex,
      totalApprovals, // Include for logging/logic
      setIsApprovalSubmitting,
      setApprovalError,
      setApprovalIndex,
      setMainTxSubmitted,
      setIsProcessingTx,
    ]
  );

  console.log('[ProcessTx] processTx function initialized.', processTx);

  // --- Action Handlers Exposed to Component ---

  const approveNext = useCallback(async () => {
    // Guard ensures we only proceed if allowed
    if (!canApprove) {
      console.warn('[approveNext] Cannot approve now.', {
        canApprove,
        isConnected,
      });
      return;
    }
    const currentApproval = approvalTxs[approvalIndex];
    console.log(`[approveNext] Triggering approval ${approvalIndex + 1}/${totalApprovals}`);
    await processTx(currentApproval, true);
    // Auto-chaining is handled by the useEffect below
  }, [canApprove, approvalTxs, approvalIndex, totalApprovals, processTx]);

  const executeMain = useCallback(async () => {
    // Guard ensures we only proceed if allowed
    if (!canExecute) {
      console.warn('[executeMain] Cannot execute now.', {
        canExecute,
        isConnected,
      });
      return;
    }
    console.log('[executeMain] Triggering main transaction');
    resetWagmiSendState(); // Reset previous wagmi state before new main tx
    // No need to reset mainTxSubmitted here, processTx sets it true early
    await processTx(mainTx, false);
  }, [canExecute, mainTx, processTx, resetWagmiSendState]);

  // --- Effects for State Management and Auto-Chaining ---

  // Effect for auto-approving: Triggers the *next* approval IF the *previous* one succeeded
  // This needs careful dependency management
  // *** This logic might be too complex or prone to race conditions. ***
  // *** A simpler approach might be best: User clicks 'Approve' for each step. ***
  // *** Let's KEEP the auto-approve for now as per the original plan. ***
  useEffect(() => {
    // Conditions to check *after* a potential state update:
    const readyForNextApproval =
      needsApproval &&
      !isApprovalPhaseComplete &&
      !isCurrentApprovalPending && // No approval tx in flight
      !isMainExecutionPending && // No main tx in flight
      !approvalError && // No prior approval error
      isConnected;

    if (readyForNextApproval) {
      // We need to know if the *last action* was a successful approval.
      // This is tricky. Let's rely on the index having advanced and no pending state.
      console.log(
        `[AutoApprove Effect Check] Conditions met for potential auto-approval. Index: ${approvalIndex}`
      );
      // Avoid infinite loops: only trigger if not already processing
      if (!isProcessingTx) {
        // Consider adding a small delay? Or is state sufficient?
        // If we just successfully completed an approval, wagmi's isPending might still be true briefly.
        // Let's assume the state updates allow this check.
        console.log(`[AutoApprove Effect] Calling approveNext for index ${approvalIndex + 1}`);
        // approveNext(); // Call the action directly - it has guards
      } else {
        console.log('[AutoApprove Effect Check] Skipping trigger because isProcessingTx is true.');
      }
    } else {
      console.log(
        `[AutoApprove Effect Check] Conditions NOT met. Needs: ${needsApproval}, Complete: ${isApprovalPhaseComplete}, ApprPending: ${isCurrentApprovalPending}, MainPending: ${isMainExecutionPending}, Error: ${!!approvalError}, Connected: ${isConnected}`
      );
    }
  }, [
    // Re-run when these change, indicating a potential state transition completion
    needsApproval,
    isApprovalPhaseComplete,
    isCurrentApprovalPending,
    isMainExecutionPending,
    approvalError,
    isConnected,
    approvalIndex, // Key dependency: runs after index increments
    isProcessingTx, // Check if we are already locked
    approveNext, // The action to call
  ]);

  // Effect to save successful transactions to database
  useEffect(() => {
    const saveTransactionToDatabase = async () => {
      // Check if we have a successful main transaction that hasn't been processed yet
      if (
        isWagmiTxSuccess && 
        mainTxSubmitted && 
        _txResultData && 
        address && 
        currentChainId &&
        mainTx &&
        _txResultData !== lastProcessedTxHash // Avoid duplicate saves
      ) {
        try {
          console.log('[useTransactionExecutor] Saving successful transaction to database:', _txResultData);
          
          const transactionData: InsertTransactionInput = {
            txHash: _txResultData, // _txResultData is the hash itself
            userAddress: address,
            agentId: agentId || 'unknown',
            agentType: agentType || 'unknown',
            chainId: currentChainId.toString(),
            status: 'confirmed',
            transactionType: 'main',
            value: String(mainTx.value || '0'),
            contractAddress: mainTx.to,
            methodName: methodName || 'unknown',
            transactionDetails: {
              txPlan: txPlan,
              rawTransaction: mainTx,
              wagmiResult: _txResultData
            },
            executedAt: new Date(), // Back to Date object
            confirmedAt: new Date(), // Back to Date object
          };

          console.log('[useTransactionExecutor] Transaction data line number 376:', transactionData);

          // Use API route instead of direct database call
          const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(transactionData),
          });

          if (!response.ok) {
            throw new Error(`Failed to save transaction: ${response.statusText}`);
          }
          setLastProcessedTxHash(_txResultData); // Mark as processed
          console.log('[useTransactionExecutor] Transaction saved successfully to database');
        } catch (error) {
          console.error('[useTransactionExecutor] Failed to save transaction to database:', error);
        }
      }
    };

    saveTransactionToDatabase();
  }, [
    isWagmiTxSuccess,
    mainTxSubmitted,
    _txResultData,
    address,
    currentChainId,
    mainTx,
    agentType,
    methodName,
    txPlan,
    lastProcessedTxHash
  ]);

  // Effect to reset internal state when the transaction plan changes
  useEffect(() => {
    console.log('[useTxExec Effect] txPlan changed, resetting internal state.');
    setApprovalIndex(0);
    setIsApprovalSubmitting(false);
    setApprovalError(null);
    setMainTxSubmitted(false);
    setIsProcessingTx(false);
    setLastProcessedTxHash(null); // Reset processed hash tracking
    resetWagmiSendState(); // Also reset wagmi's internal state
  }, [txPlan, resetWagmiSendState]); // Depend only on txPlan and the reset function

 
  return {
    approveNext,
    executeMain,
    approvalIndex,
    totalApprovals,
    isApprovalPending: isCurrentApprovalPending, 
    approvalError,
    isTxPending: isMainExecutionPending, 
    isTxSuccess: isWagmiTxSuccess && mainTxSubmitted, 
    txError: mainTxSubmitted ? wagmiTxError : null, 
    canApprove,
    canExecute,
    isApprovalPhaseComplete,
  };
}
