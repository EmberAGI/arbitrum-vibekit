/// <reference types="mocha" />
import { expect } from 'chai';

import 'dotenv/config';
import {
  MultiChainSigner,
  CHAIN_CONFIGS,
  ensureWethBalance,
  extractPositionsData,
  getReserveForToken,
  extractAndExecuteTransactions
} from 'test-utils';

import { Agent } from '../src/agent.js';

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
    await agent.stop();
  });

  // Create a separate test suite for each chain
  for (const chainId of CHAINS_TO_TEST) {
    describe(`Chain: ${CHAIN_CONFIGS[chainId]?.name || `Chain ${chainId}`}`, function () {
      before(async function () {
        // Verify that chain configuration exists
        if (!CHAIN_CONFIGS[chainId]) {
          throw new Error(
            `Chain configuration missing for chain ID ${chainId}. Please add it to CHAIN_CONFIGS.`
          );
        }

        // Get WETH address from chain config
        const wethAddress = CHAIN_CONFIGS[chainId]?.wrappedNativeToken?.address;
        if (!wethAddress) {
          throw new Error(
            `No wrapped native token (WETH) defined for chain ${chainId}.`
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
          const amountToSupply = '0.001';

          // Get original balance
          const oldReserve = await agent.getTokenReserve(multiChainSigner.wallet.address, 'WETH');
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


          // Check the new balance increased by the expected amount
          const newReserve = await agent.getTokenReserve(multiChainSigner.wallet.address, 'WETH');
          const newBalance = parseFloat(newReserve.underlyingBalance);
          const balanceIncrease = newBalance - oldBalance;
          expect(balanceIncrease).to.be.closeTo(
            parseFloat(amountToSupply),
            0.0001, // Allow for some tolerance due to rounding and gas fees
            `Expected balance to increase by ${amountToSupply}, but increased by ${balanceIncrease}`
          );
        });
      });

      describe('Borrow Operations', function () {
        it('should borrow WETH successfully', async function () {
          const amountToBorrow = 0.0005;

          // Get original borrow balance
          const oldReserve = await agent.getTokenReserve(multiChainSigner.wallet.address, 'WETH');
          const oldBorrows = parseFloat(oldReserve.totalBorrows || '0');

          // Borrow some WETH
          const response = await agent.processUserInput(
            `borrow ${amountToBorrow} WETH`,
            multiChainSigner.wallet.address
          );

          // Check for response errors
          expect(response.status?.state).to.not.equal('failed', 'Borrow operation failed');

          // Execute transactions immediately after getting response
          const txHashes = await extractAndExecuteTransactions(
            response,
            multiChainSigner,
            'borrow'
          );
          expect(txHashes.length).to.be.greaterThan(0, 'No transaction hashes returned');
          console.log(`Borrow transaction hash: ${txHashes[0]}`);

          // Now check the balance - transaction is already executed and confirmed
          const newReserve = await agent.getTokenReserve(multiChainSigner.wallet.address, 'WETH');
          const newBorrows = parseFloat(newReserve.totalBorrows || '0');
          const borrowIncrease = newBorrows - oldBorrows;
          expect(borrowIncrease).to.be.closeTo(
            amountToBorrow,
            0.00001, // Allow for some tolerance due to rounding
            `Expected borrow to increase by ${amountToBorrow}, but increased by ${borrowIncrease}`
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
            `No WETH supply balance found: ${JSON.stringify(positionsData, null, 2)}`
          ).to.be.greaterThan(0);
          expect(
            parseFloat(wethReserve.totalBorrows || '0'),
            `No WETH borrow balance found: ${JSON.stringify(positionsData, null, 2)}`
          ).to.be.greaterThan(0);
        });
      });

      describe('Withdraw Operations', function () {
        it('should withdraw WETH successfully', async function () {
          const amountToWithdraw = '0.0001';

          // Get original balance
          const oldReserve = await agent.getTokenReserve(multiChainSigner.wallet.address, 'WETH');
          const oldBalance = parseFloat(oldReserve.underlyingBalance);

          // Withdraw some WETH
          const response = await agent.processUserInput(
            `withdraw ${amountToWithdraw} WETH`,
            multiChainSigner.wallet.address
          );

          // Check for response errors
          expect(response.status?.state).to.not.equal('failed', 'Withdraw operation failed');

          // Execute transactions immediately after getting response
          const txHashes = await extractAndExecuteTransactions(
            response,
            multiChainSigner,
            'withdraw'
          );
          expect(txHashes.length).to.be.greaterThan(0, 'No transaction hashes returned');
          console.log(`Withdraw transaction hash: ${txHashes[0]}`);

          // Now check the balance - transaction is already executed and confirmed
          const newReserve = await agent.getTokenReserve(multiChainSigner.wallet.address, 'WETH');
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
