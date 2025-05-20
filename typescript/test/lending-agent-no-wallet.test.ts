/// <reference types="mocha" />
import { expect } from 'chai';
import 'dotenv/config';
import { Agent } from '../examples/lending-agent-no-wallet/src/agent.js';
import { CHAIN_CONFIGS } from './chains.js';
import { MultiChainSigner } from './multichain-signer.js';
import { ensureWethBalance } from './helpers/weth.js';
import { executeTransactionPlan, parseFunctionCallArgs } from './utils/transactions.js';
import type { GetWalletPositionsResponse } from '@emberai/sdk-typescript';
import { type UserReserve } from '../examples/lending-agent-no-wallet/src/agentToolHandlers.js';
import whyIsNodeRunning from 'why-is-node-running';

// Define chain IDs that should be tested
const CHAINS_TO_TEST: number[] = [42161]; // Arbitrum One

describe('Lending Agent Integration Tests', function () {
  this.timeout(90_000); // Increased timeout for blockchain operations

  let multiChainSigner: MultiChainSigner;
  let agent: Agent;

  const quicknodeSubdomain = process.env.QUICKNODE_SUBDOMAIN;
  if (!quicknodeSubdomain) {
    throw new Error('QUICKNODE_SUBDOMAIN not found in the environment.');
  }

  const quicknodeApiKey = process.env.QUICKNODE_API_KEY;
  if (!quicknodeApiKey) {
    throw new Error('QUICKNODE_API_KEY not found in the environment.');
  }

  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic) {
    throw new Error('MNEMONIC not found in the environment.');
  }

  before(async function () {
    try {
      // Create a single MultiChainSigner for all chains being tested
      multiChainSigner = await MultiChainSigner.fromTestChains(CHAINS_TO_TEST);

      // Initialize agent
      agent = new Agent(quicknodeSubdomain, quicknodeApiKey);
      await agent.init();
      await agent.start();
    } catch (error) {
      console.error('Failed to initialize test environment:', error);
      throw error;
    }
  });

  after(async function () {
    whyIsNodeRunning();
    await agent.stop();
  });

  // Create a separate test suite for each chain
  for (const chainId of CHAINS_TO_TEST) {
    describe(`Chain: ${CHAIN_CONFIGS[chainId]?.name || `Chain ${chainId}`}`, function () {
      before(async function () {
        // Verify that chain configuration exists
        if (!CHAIN_CONFIGS[chainId]) {
          throw new Error(
            `Chain configuration missing for chain ID ${chainId}. Please add it to test/chains.ts.`
          );
        }

        // Get WETH address from chain config
        const wethAddress = CHAIN_CONFIGS[chainId]?.wrappedNativeToken?.address;
        if (!wethAddress) {
          throw new Error(
            `No wrapped native token (WETH) defined for chain ${chainId}. Please add wrappedNativeToken to the chain configuration in test/chains.ts.`
          );
        }

        // Ensure WETH balance - use higher amount to ensure all operations can be completed
        const signer = multiChainSigner.getSignerForChainId(chainId);
        await ensureWethBalance(signer, '0.5', wethAddress);
      });

      describe('Basic Capabilities', function () {
        it('should be able to describe what it can do', async function () {
          const response = await agent.processUserInput(
            'What can you do?',
            multiChainSigner.wallet.address
          );

          // Test passes if agent returns a response and mentions lending operations
          expect(response).to.exist;

          // Extract text from response, accounting for different possible response structures
          let messageText = '';
          if (response.status?.message?.parts && Array.isArray(response.status.message.parts)) {
            const firstPart = response.status.message.parts[0];
            if (firstPart && typeof firstPart === 'object' && 'text' in firstPart) {
              messageText = firstPart.text as string;
            }
          }

          expect(messageText.toLowerCase()).to.satisfy(
            (text: string) =>
              text.includes('borrow') || text.includes('supply') || text.includes('lending')
          );
        });
      });

      describe('Supply Operations', function () {
        it('should supply WETH successfully', async function () {
          const amountToSupply = '0.0005';

          // Get original balance
          const oldReserve = await getTokenReserve(agent, multiChainSigner.wallet.address, 'WETH');
          const oldBalance = parseFloat(oldReserve.underlyingBalance);

          // Supply some WETH
          const response = await agent.processUserInput(
            `supply ${amountToSupply} WETH`,
            multiChainSigner.wallet.address
          );

          // Check for response errors
          expect(response.status?.state).to.not.equal('failed', 'Supply operation failed');

          // Execute transactions
          const txHashes = await extractAndExecuteTransactions(
            response,
            multiChainSigner,
            'supply'
          );
          expect(txHashes.length).to.be.greaterThan(0, 'No transaction hashes returned');

          // Just log transaction hash without explorer link
          console.log(`Supply transaction hash: ${txHashes[0]}`);

          // Wait for transaction to be mined and indexed
          await new Promise(resolve => setTimeout(resolve, 5000));

          // Check the new balance increased
          const newReserve = await getTokenReserve(agent, multiChainSigner.wallet.address, 'WETH');
          const newBalance = parseFloat(newReserve.underlyingBalance);
          expect(oldBalance).to.be.closeTo(
            newBalance - parseFloat(amountToSupply),
            0.005 // Allow for some tolerance due to rounding and gas fees
          );
        });
      });

      describe('Borrow Operations', function () {
        it('should borrow WETH successfully', async function () {
          const amountToBorrow = '0.0001';

          // Wait to make sure supply was processed
          await new Promise(resolve => setTimeout(resolve, 5000));

          // Get original borrow balance
          const oldReserve = await getTokenReserve(agent, multiChainSigner.wallet.address, 'WETH');
          const oldBorrows = parseFloat(oldReserve.totalBorrows || '0');

          // Borrow some WETH
          const response = await agent.processUserInput(
            `borrow ${amountToBorrow} WETH`,
            multiChainSigner.wallet.address
          );

          // Check for response errors
          expect(response.status?.state).to.not.equal('failed', 'Borrow operation failed');

          // Execute transactions
          const txHashes = await extractAndExecuteTransactions(
            response,
            multiChainSigner,
            'borrow'
          );
          expect(txHashes.length).to.be.greaterThan(0, 'No transaction hashes returned');

          // Just log transaction hash without explorer link
          console.log(`Borrow transaction hash: ${txHashes[0]}`);

          // Wait for transaction to be mined and indexed
          await new Promise(resolve => setTimeout(resolve, 5000));

          // Check the new borrow amount increased
          const newReserve = await getTokenReserve(agent, multiChainSigner.wallet.address, 'WETH');
          const newBorrows = parseFloat(newReserve.totalBorrows || '0');
          expect(oldBorrows).to.be.closeTo(
            newBorrows - parseFloat(amountToBorrow),
            0.001 // Allow for some tolerance due to rounding
          );
        });
      });

      describe('Position Management', function () {
        it('should show positions correctly', async function () {
          // Get and display positions
          const response = await agent.processUserInput(
            'show my positions',
            multiChainSigner.wallet.address
          );

          // Verify we get a response with positions data
          const positionsData = extractPositionsData(response);
          expect(positionsData.positions.length, 'No positions found').to.be.greaterThan(0);

          // Get WETH reserve
          const wethReserve = getReserveForToken(positionsData, 'WETH');

          // Verify we have both supplies and borrows
          expect(
            parseFloat(wethReserve.underlyingBalance),
            'No WETH supply balance found'
          ).to.be.greaterThan(0);
          expect(
            parseFloat(wethReserve.totalBorrows || '0'),
            'No WETH borrow balance found'
          ).to.be.greaterThan(0);
        });
      });

      describe('Withdraw Operations', function () {
        it('should withdraw WETH successfully', async function () {
          const amountToWithdraw = '0.0001';

          // Wait to make sure previous operations were processed
          await new Promise(resolve => setTimeout(resolve, 5000));

          // Get original balance
          const oldReserve = await getTokenReserve(agent, multiChainSigner.wallet.address, 'WETH');
          const oldBalance = parseFloat(oldReserve.underlyingBalance);

          // Withdraw some WETH
          const response = await agent.processUserInput(
            `withdraw ${amountToWithdraw} WETH`,
            multiChainSigner.wallet.address
          );

          // Check for response errors
          expect(response.status?.state).to.not.equal('failed', 'Withdraw operation failed');

          // Execute transactions
          const txHashes = await extractAndExecuteTransactions(
            response,
            multiChainSigner,
            'withdraw'
          );
          expect(txHashes.length).to.be.greaterThan(0, 'No transaction hashes returned');

          // Just log transaction hash without explorer link
          console.log(`Withdraw transaction hash: ${txHashes[0]}`);

          // Wait for transaction to be mined and indexed
          await new Promise(resolve => setTimeout(resolve, 5000));

          // Check the new balance decreased
          const newReserve = await getTokenReserve(agent, multiChainSigner.wallet.address, 'WETH');
          const newBalance = parseFloat(newReserve.underlyingBalance);
          expect(oldBalance).to.be.closeTo(
            newBalance + parseFloat(amountToWithdraw),
            0.001 // Allow for some tolerance due to rounding
          );
        });
      });
    });
  }
});

// Utility functions

/**
 * Extract transaction plan from artifacts
 */
function extractTransactionPlan(
  response: any
): Array<{ to: string; data: string; value: string; chainId: string }> {
  try {
    if (!response.artifacts) {
      throw new Error('No artifacts found in response');
    }

    // Look for transaction-plan artifact
    for (const artifact of response.artifacts) {
      if (artifact.name === 'transaction-plan') {
        for (const part of artifact.parts || []) {
          if (part.type === 'data' && part.data?.txPlan) {
            return part.data.txPlan;
          }
        }
      }
    }

    throw new Error('No transaction plan found in artifacts');
  } catch (e) {
    console.log('Error extracting transaction plan:', e);
    throw e;
  }
}

/**
 * Extract function calls from task response
 */
function extractFunctionCall(task: any): { name: string; arguments: string } {
  try {
    // Check if there's a parts array with function_call
    if (task.status?.message?.parts) {
      for (const part of task.status.message.parts) {
        if (part.function_call) {
          return part.function_call;
        }
      }
    }

    // For handling different response formats
    if (task.status?.message?.function_call) {
      return task.status.message.function_call;
    }

    throw new Error('No function call found in task response');
  } catch (e) {
    console.log('Error extracting function call:', e);
    throw e;
  }
}

/**
 * Extract positions data from the response
 */
function extractPositionsData(task: any): GetWalletPositionsResponse {
  try {
    // Find the wallet-positions artifact
    const artifacts = task.artifacts || [];
    for (const artifact of artifacts) {
      if (artifact.name === 'wallet-positions') {
        const parts = artifact.parts || [];
        for (const part of parts) {
          if (part.type === 'data' && part.data?.positions) {
            return { positions: part.data.positions };
          }
        }
      }
    }
    throw new Error('No positions data found in response');
  } catch (e) {
    console.log('Error extracting positions data:', e);
    throw e;
  }
}

/**
 * Finds the reserve information for a given token symbol or name within the positions response.
 */
function getReserveForToken(
  response: GetWalletPositionsResponse,
  tokenNameOrSymbol: string
): UserReserve {
  for (const position of response.positions) {
    if (!position.lendingPosition) continue;

    for (const reserve of position.lendingPosition.userReserves) {
      const name = reserve.token!.name;
      const symbol = reserve.token!.symbol;

      if (name === tokenNameOrSymbol || symbol === tokenNameOrSymbol) {
        // Cast the reserve to UserReserve type since we know it has the required structure
        return reserve as unknown as UserReserve;
      }
    }
  }

  throw new Error(`No reserve found for token ${tokenNameOrSymbol}`);
}

/**
 * Helper to get reserve for a token
 */
async function getTokenReserve(
  agent: Agent,
  userAddress: string,
  tokenName: string
): Promise<UserReserve> {
  const response = await agent.processUserInput('show my positions', userAddress);
  const positionsData = extractPositionsData(response);
  return getReserveForToken(positionsData, tokenName);
}

/**
 * Extract transactions and execute them, with proper error handling
 */
async function extractAndExecuteTransactions(
  response: any,
  multiChainSigner: MultiChainSigner,
  operationName: string
): Promise<string[]> {
  // First try to get the transaction plan from the artifacts
  let txPlan;
  try {
    txPlan = extractTransactionPlan(response);
  } catch (e) {
    // If no transaction plan in artifacts, try the old function call method
    try {
      const functionCall = extractFunctionCall(response);
      const args = parseFunctionCallArgs(functionCall);
      if (args.transactions && Array.isArray(args.transactions)) {
        txPlan = args.transactions;
      } else {
        throw new Error(
          `No transactions found in function call args for ${operationName} operation`
        );
      }
    } catch (functionCallError) {
      console.log('Function call extraction failed:', functionCallError);
      throw new Error(`Failed to extract transactions for ${operationName} operation: ${e}`);
    }
  }

  // Verify we have a valid transaction plan
  if (!txPlan || txPlan.length === 0) {
    throw new Error(`No transactions found in response for ${operationName} operation`);
  }

  // Extract chain ID from first transaction or fail
  const chainId = txPlan?.[0]?.chainId;
  if (!chainId) {
    throw new Error(`No chainId found in transaction plan for ${operationName} operation`);
  }

  // Execute the transactions
  const txHashes = await executeTransactionPlan(txPlan, chainId, multiChainSigner);

  if (txHashes.length === 0) {
    throw new Error(`Failed to execute transactions for ${operationName} operation`);
  }

  return txHashes;
}
