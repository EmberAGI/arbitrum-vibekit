/**
 * Collect Approval Amount and Handle Approvals Workflow Node
 *
 * Three-step approval flow:
 * 1. Collect USDC amount from user
 * 2. Collect USDC permit signature (gasless)
 * 3. Collect CTF approval transaction (user pays gas)
 *
 * Flow:
 * - Step 1: User enters USDC amount → goes back to checkApprovals
 * - Step 2: User signs USDC permit → backend submits to blockchain
 * - Step 3: User approves CTF transaction → user's wallet submits
 * - Done: Both approvals confirmed → continue to pollCycle
 */

import { Command, interrupt } from '@langchain/langgraph';
import { ethers } from 'ethers';
import { z } from 'zod';
import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import type { PolymarketState, PolymarketUpdate } from '../context.js';
import { checkApprovalStatus, submitUsdcPermit } from '../../clients/approvals.js';
import { logInfo } from '../context.js';

// Type for CopilotKit config parameter
type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

/**
 * Zod schemas for interrupt payloads
 */
const ApprovalAmountSchema = z.object({
  requestedApprovalAmount: z.string(),
  userWalletAddress: z.string(),
});

const PermitSignatureSchema = z.object({
  usdcPermitSignature: z.object({
    v: z.number(),
    r: z.string(),
    s: z.string(),
    deadline: z.number(),
  }),
});

const CtfApprovalSchema = z.object({
  ctfApprovalTxHash: z.string(),
});

/**
 * Collect approval amount and handle permit/transaction signatures.
 */
export async function collectApprovalAmountNode(
  state: PolymarketState,
  config: CopilotKitConfig,
): Promise<Command<PolymarketUpdate>> {
  const walletAddress = state.private.walletAddress;
  const rpcUrl = process.env.POLYGON_RPC_URL || 'https://polygon.llamarpc.com';
  let approvalAmount = state.view.requestedApprovalAmount;
  let userWalletAddress = state.private.userWalletAddress;

  logInfo('🔍 collectApprovalAmount node reached', {
    hasApprovalAmount: !!approvalAmount,
    approvalAmount,
    needsUsdcPermit: state.view.needsUsdcPermitSignature,
  });

  if (!walletAddress) {
    logInfo('⚠️ No wallet address - cannot process approvals');
    return new Command({
      update: {
        view: {
          haltReason: 'No wallet address configured',
        },
      },
      goto: 'summarize',
    });
  }

  // ==========================================
  // Step 1: Collect USDC Amount
  // ==========================================
  if (!approvalAmount) {
    logInfo('💤 Waiting for user to input USDC approval amount');

    // Emit state before interrupt
    await copilotkitEmitState(config, {
      state: {
        view: {
          needsApprovalAmountInput: true,
          onboarding: {
            step: 1,
            totalSteps: 2,
            key: 'approval-amount-input',
          },
        },
      },
    });

    // Define interrupt request
    const request = {
      type: 'approval-amount-request',
      message: 'Enter USDC approval amount',
    };

    // Interrupt and wait for user input
    const incoming: unknown = await interrupt(request);

    // Parse JSON string from frontend
    let inputToParse: unknown = incoming;
    if (typeof incoming === 'string') {
      try {
        inputToParse = JSON.parse(incoming);
      } catch {
        logInfo('❌ Failed to parse interrupt JSON');
        return new Command({
          update: {
            view: {
              haltReason: 'Invalid interrupt data format',
            },
          },
          goto: 'summarize',
        });
      }
    }

    // Validate with Zod
    const parsed = ApprovalAmountSchema.safeParse(inputToParse);
    if (!parsed.success) {
      logInfo('❌ Validation failed', { error: parsed.error.message });
      return new Command({
        update: {
          view: {
            haltReason: `Invalid approval amount format: ${parsed.error.message}`,
          },
        },
        goto: 'summarize',
      });
    }

    // Extract the amount and wallet from parsed data
    approvalAmount = parsed.data.requestedApprovalAmount;
    const userAddress = parsed.data.userWalletAddress;

    if (userAddress) {
      logInfo('✅ User wallet address received', { address: userAddress.slice(0, 10) + '...' });
      userWalletAddress = userAddress;
    } else {
      logInfo('⚠️ No user wallet address received - permit signature may fail');
    }
  }

  logInfo('✅ Approval amount confirmed', { amount: approvalAmount });

  // Validate the amount is a valid number
  const amountNum = parseFloat(approvalAmount);
  if (isNaN(amountNum) || amountNum <= 0) {
    logInfo('❌ Invalid approval amount', { amount: approvalAmount });
    return new Command({
      update: {
        view: {
          haltReason: `Invalid approval amount: ${approvalAmount}. Please enter a positive number.`,
          needsApprovalAmountInput: true,
          requestedApprovalAmount: undefined, // Clear invalid amount
        },
      },
      goto: 'summarize',
    });
  }

  // If we just collected the amount (not already set in state),
  // go back to checkApprovals to generate permit/transaction data
  if (!state.view.requestedApprovalAmount) {
    console.log('[APPROVAL FLOW] Amount collected from interrupt, returning to checkApprovals to set up permits');
    logInfo('✅ Approval amount collected, proceeding to generate permits', { amount: approvalAmount });

    return new Command({
      update: {
        view: {
          requestedApprovalAmount: approvalAmount,
          needsApprovalAmountInput: false,
        },
        private: {
          userWalletAddress: userWalletAddress, // Store user wallet for permit generation
        },
      },
      goto: 'checkApprovals', // Go back to generate permit data
    });
  }

  // ==========================================
  // Step 2: Handle USDC Permit Signature
  // ==========================================
  if (state.view.needsUsdcPermitSignature) {
    // Check if user has provided signature
    const signature = state.view.usdcPermitSignature;

    if (!signature) {
      logInfo('💤 Waiting for user to sign USDC permit');

      // Emit state before interrupt
      await copilotkitEmitState(config, {
        state: {
          view: {
            needsUsdcPermitSignature: true,
            usdcPermitTypedData: state.view.usdcPermitTypedData,
            onboarding: {
              step: 2,
              totalSteps: 3,
              key: 'usdc-permit-signature',
            },
          },
        },
      });

      // Define interrupt request
      const request = {
        type: 'usdc-permit-signature-request',
        message: 'Sign USDC permit message',
      };

      // Interrupt and wait for user signature
      console.log('[APPROVAL FLOW] Waiting for USDC permit signature...');
      const incoming: unknown = await interrupt(request);
      console.log('[APPROVAL FLOW] Permit interrupt resolved');

      // Parse JSON string from frontend
      let inputToParse: unknown = incoming;
      if (typeof incoming === 'string') {
        try {
          inputToParse = JSON.parse(incoming);
        } catch (error) {
          console.error('[APPROVAL FLOW] Failed to parse permit JSON:', error);
          return new Command({
            update: {
              view: {
                haltReason: 'Invalid permit signature data format',
              },
            },
            goto: 'summarize',
          });
        }
      }

      // Validate with Zod
      const parsed = PermitSignatureSchema.safeParse(inputToParse);
      if (!parsed.success) {
        console.error('[APPROVAL FLOW] Permit signature validation failed:', parsed.error);
        return new Command({
          update: {
            view: {
              haltReason: `Invalid permit signature format: ${parsed.error.message}`,
            },
          },
          goto: 'summarize',
        });
      }

      // Use the parsed signature directly
      const parsedSignature = parsed.data.usdcPermitSignature;
      // Verify signature matches the typed data owner
      try {
        if (state.view.usdcPermitTypedData) {
          logInfo('🕵️ Verifying signature locally before submission...');

          const domain = state.view.usdcPermitTypedData.domain;
          const types = state.view.usdcPermitTypedData.types;
          const value = state.view.usdcPermitTypedData.value;

          // Ethers v6 verifyTypedData
          const recoveredAddress = ethers.verifyTypedData(domain, types, value, parsedSignature);

          logInfo('🕵️ Recovered signer address from signature:', { recoveredAddress });
          logInfo('🕵️ Expected owner address:', { owner: value.owner });

          if (recoveredAddress.toLowerCase() !== value.owner.toLowerCase()) {
            logInfo('❌ SIGNATURE MISMATCH: Recovered address does not match owner!', {
              recovered: recoveredAddress,
              expected: value.owner
            });
          } else {
            logInfo('✅ Signature verified locally: Signer matches owner');
          }
        }
      } catch (verifyError) {
        logInfo('⚠️ Failed to verify signature locally:', { error: verifyError });
      }

      console.log('[APPROVAL FLOW] Permit signature validated, proceeding to submit');

      // Submit permit to blockchain right here
      logInfo('✅ User signed USDC permit - submitting to blockchain');

      const backendPrivateKey = process.env.A2A_TEST_AGENT_NODE_PRIVATE_KEY;
      if (!backendPrivateKey) {
        logInfo('❌ No backend private key - cannot submit permit');
        return new Command({
          update: {
            view: {
              haltReason: 'No backend private key configured. Set A2A_TEST_AGENT_NODE_PRIVATE_KEY.',
            },
          },
          goto: 'summarize',
        });
      }

      logInfo('🔑 Using backend private key to execute USDC permit transaction (on behalf of user)', {
        keyLength: backendPrivateKey.length,
        signer: 'Backend Agent Node',
      });

      try {
        // Use userWalletAddress if available (from interrupt), otherwise fall back to backend wallet (which will fail for user signature)
        const targetAddress = userWalletAddress || walletAddress;

        logInfo('📝 Submitting permit for address', { address: targetAddress });

        const receipt = await submitUsdcPermit(
          targetAddress, // Use user's wallet address as owner
          approvalAmount,
          parsedSignature,
          rpcUrl,
          backendPrivateKey,
        );

        if (!receipt || receipt.status !== 1) {
          logInfo('❌ USDC permit transaction failed');
          return new Command({
            update: {
              view: {
                haltReason: 'USDC permit transaction failed. Please try again.',
                usdcPermitSignature: undefined,
              },
            },
            goto: 'summarize',
          });
        }

        logInfo('✅ USDC permit confirmed on-chain');

        // Clear USDC permit state and continue to check CTF
        return new Command({
          update: {
            view: {
              needsUsdcPermitSignature: false,
              usdcPermitTypedData: undefined,
              usdcPermitSignature: undefined,
            },
          },
          goto: 'checkApprovals', // Go back to check if CTF approval is also needed
        });
      } catch (error) {
        logInfo('❌ Failed to submit USDC permit', {
          error: error instanceof Error ? error.message : String(error),
        });

        return new Command({
          update: {
            view: {
              haltReason: `Failed to submit USDC permit: ${error instanceof Error ? error.message : String(error)}`,
              usdcPermitSignature: undefined,
            },
          },
          goto: 'summarize',
        });
      }
    }

    // If signature was already in state, use it (shouldn't normally happen with interrupt flow)
    logInfo('✅ User signed USDC permit - submitting to blockchain');

    const backendPrivateKey = process.env.A2A_TEST_AGENT_NODE_PRIVATE_KEY;
    if (!backendPrivateKey) {
      logInfo('❌ No backend private key - cannot submit permit');
      return new Command({
        update: {
          view: {
            haltReason: 'No backend private key configured. Set A2A_TEST_AGENT_NODE_PRIVATE_KEY.',
          },
        },
        goto: 'summarize',
      });
    }

    try {
      const receipt = await submitUsdcPermit(
        walletAddress,
        approvalAmount,
        signature!,
        rpcUrl,
        backendPrivateKey,
      );

      if (!receipt || receipt.status !== 1) {
        logInfo('❌ USDC permit transaction failed');
        return new Command({
          update: {
            view: {
              haltReason: 'USDC permit transaction failed. Please try again.',
              usdcPermitSignature: undefined,
            },
          },
          goto: 'summarize',
        });
      }

      logInfo('✅ USDC permit confirmed on-chain');

      // Clear USDC permit state and continue
      return new Command({
        update: {
          view: {
            needsUsdcPermitSignature: false,
            usdcPermitTypedData: undefined,
            usdcPermitSignature: undefined,
          },
        },
        goto: 'checkApprovals',
      });
    } catch (error) {
      logInfo('❌ Failed to submit USDC permit', {
        error: error instanceof Error ? error.message : String(error),
      });

      return new Command({
        update: {
          view: {
            haltReason: `Failed to submit USDC permit: ${error instanceof Error ? error.message : String(error)}`,
            usdcPermitSignature: undefined,
          },
        },
        goto: 'summarize',
      });
    }
  }

  // ==========================================
  // USDC Approval Complete - Continue to Trading
  // ==========================================
  logInfo('✅ USDC approval step completed - verifying on-chain status');

  // Re-check approval status to confirm USDC approval is done
  const finalStatus = await checkApprovalStatus(walletAddress, rpcUrl);

  if (!finalStatus.usdcApproved) {
    logInfo('⚠️ USDC approval still needed - something went wrong', {
      usdcApproved: finalStatus.usdcApproved,
    });

    return new Command({
      update: {
        view: {
          haltReason: 'USDC approval not confirmed on-chain. Please try again.',
          approvalStatus: finalStatus,
          requestedApprovalAmount: undefined,
        },
      },
      goto: 'summarize',
    });
  }

  logInfo('✅ USDC approval verified on-chain - ready to trade!');

  // Clear all approval state and go to pollCycle to start trading
  return new Command({
    update: {
      view: {
        approvalStatus: finalStatus,
        needsApprovalAmountInput: false,
        requestedApprovalAmount: undefined,
        needsUsdcPermitSignature: false,
        usdcPermitTypedData: undefined,
        usdcPermitSignature: undefined,
        onboarding: undefined,
      },
    },
    goto: 'pollCycle', // Start trading!
  });
}
