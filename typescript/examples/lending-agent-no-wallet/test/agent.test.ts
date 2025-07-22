/// <reference types="mocha" />
import { expect } from 'chai';

import 'dotenv/config';
import {
  MultiChainSigner,
  CHAIN_CONFIGS,
  mintUSDC,
  extractPositionsData,
  getReserveForToken,
  extractAndExecuteTransactions,
  extractMessageText,
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

  describe(`Lending operations on Arbitrum One`, function () {
    const chainId = 42161;

    beforeEach(async function () {
      // Select chain
      const signer = multiChainSigner.getSignerForChainId(chainId);
      const provider = signer.provider;

      if (!provider) {
        throw new Error('Provider not initialized');
      }

      // Get USDC address from chain config
      const usdcAddress = CHAIN_CONFIGS[chainId]?.anotherToken?.address;
      if (!usdcAddress) {
        throw new Error(`No USDC token defined for chain ${chainId}.`);
      }

      // Ensure USDC balance - use higher amount to ensure all operations can be completed
      // USDC has 6 decimals, so 1000 USDC = 1000000000
      await mintUSDC({
        provider: provider as any,
        tokenAddress: usdcAddress,
        userAddress: multiChainSigner.wallet.address,
        balanceStr: '1000000000', // 1000 USDC
      });

      // // Approve the Aave v3 Pool contract to spend USDC
      // const aaveV3PoolAddress = '0x8dff5e27ea6b7ac08ebfdf9eb090f32ee9a30fcf';
      // await approveToken({
      //   signer: signer,
      //   tokenAddress: usdcAddress,
      //   spenderAddress: aaveV3PoolAddress,
      //   amount: ethers.constants.MaxUint256
      // });
    });

    afterEach(async function () {
      // // Wait for transaction to be confirmed if any
      // if (provider) {
      //   const latestBlock = await provider.getBlockNumber();
      //   await provider.waitForBlock(latestBlock + 1, 1000);
      // }
    });

    it.skip('should supply USDC successfully', async function () {
      // Define the amount to supply
      const amountToSupply = '10'; // 10 USDC

      const oldReserve = await agent.getTokenReserve(multiChainSigner.wallet.address, 'USDC');
      console.log(`Old USDC balance: ${oldReserve.underlyingBalance}`);

      // Supply some USDC
      const result = await agent.processUserInput(
        `I want to supply ${amountToSupply} USDC on chain 42161 address 0xaf88d065e77c8cc2239327c5edb3a432268e5831`,
        multiChainSigner.wallet.address
      );

      // Parse the agent's response
      const resultText = extractMessageText(result);
      console.log('Agent response:', resultText);

      // Execute the transactions
      console.log(`Executing transactions...`);
      const executedTxs = await extractAndExecuteTransactions(result, multiChainSigner, 'supply');
      expect(executedTxs).to.have.lengthOf.greaterThan(
        0,
        'No transactions were executed successfully'
      );

      // Wait for tx to confirm
      await new Promise(resolve => setTimeout(resolve, 2000));

      const newReserve = await agent.getTokenReserve(multiChainSigner.wallet.address, 'USDC');
      console.log(`New USDC balance: ${newReserve.underlyingBalance}`);

      // Verify that the balance has increased
      const oldBalance = parseFloat(oldReserve.underlyingBalance ?? '0');
      const newBalance = parseFloat(newReserve.underlyingBalance ?? '0');
      const actualIncrease = newBalance - oldBalance;
      const expectedIncrease = parseFloat(amountToSupply);
      console.log(`Expected increase: ${expectedIncrease}, Actual increase: ${actualIncrease}`);
      expect(actualIncrease).to.be.closeTo(expectedIncrease, expectedIncrease * 0.01); // Within 1%
    });

    it.skip('should borrow USDC successfully', async function () {
      // Define the amount to borrow
      const amountToBorrow = '5'; // 5 USDC

      const oldReserve = await agent.getTokenReserve(multiChainSigner.wallet.address, 'USDC');
      console.log(`Old borrow balance: ${oldReserve.totalBorrows}`);

      // Borrow some USDC
      const result = await agent.processUserInput(
        `I want to borrow ${amountToBorrow} USDC on chain 42161 address 0xaf88d065e77c8cc2239327c5edb3a432268e5831`,
        multiChainSigner.wallet.address
      );

      // Parse the agent's response
      const resultText = extractMessageText(result);
      console.log('Agent response:', resultText);

      // Execute the transactions
      console.log(`Executing transactions...`);
      const executedTxs = await extractAndExecuteTransactions(result, multiChainSigner, 'borrow');
      expect(executedTxs).to.have.lengthOf.greaterThan(
        0,
        'No transactions were executed successfully'
      );

      const newReserve = await agent.getTokenReserve(multiChainSigner.wallet.address, 'USDC');
      console.log(`New borrow balance: ${newReserve.totalBorrows}`);

      // Verify that the borrow balance has increased
      const oldBorrowBalance = parseFloat(oldReserve.totalBorrows ?? '0');
      const newBorrowBalance = parseFloat(newReserve.totalBorrows ?? '0');
      const actualIncrease = newBorrowBalance - oldBorrowBalance;
      const expectedIncrease = parseFloat(amountToBorrow);
      console.log(
        `Expected borrow increase: ${expectedIncrease}, Actual increase: ${actualIncrease}`
      );
      expect(actualIncrease).to.be.closeTo(expectedIncrease, expectedIncrease * 0.01); // Within 1%
    });

    it.skip('should get lending positions', async function () {
      const result = await agent.processUserInput(
        `What are my lending positions?`,
        multiChainSigner.wallet.address
      );

      const resultText = extractMessageText(result);
      console.log('Agent response:', resultText);

      const positions = extractPositionsData(result);
      expect(positions.positions).to.be.an('array');
      expect(positions.positions.length).to.be.greaterThan(0);

      // Should have USDC positions from previous tests
      const usdcReserve = getReserveForToken(positions, 'USDC');
      expect(usdcReserve).to.exist;

      expect(
        parseFloat(usdcReserve.underlyingBalance),
        `No USDC supply balance found: ${JSON.stringify(positions, null, 2)}`
      ).to.be.greaterThan(0);
      expect(
        parseFloat(usdcReserve.totalBorrows || '0'),
        `No USDC borrow balance found: ${JSON.stringify(positions, null, 2)}`
      ).to.be.greaterThan(0);
    });

    // Skip the withdraw test for now as it would reduce our collateral needed for borrowing
    it.skip('should withdraw USDC successfully', async function () {
      // Define the amount to withdraw
      const amountToWithdraw = '2'; // 2 USDC

      const oldReserve = await agent.getTokenReserve(multiChainSigner.wallet.address, 'USDC');
      console.log(`Old USDC balance: ${oldReserve.underlyingBalance}`);

      // Withdraw some USDC
      const result = await agent.processUserInput(
        `withdraw ${amountToWithdraw} USDC`,
        multiChainSigner.wallet.address
      );

      // Parse the agent's response
      const resultText = extractMessageText(result);
      console.log('Agent response:', resultText);

      // Execute the transactions
      console.log(`Executing transactions...`);
      const executedTxs = await extractAndExecuteTransactions(result, multiChainSigner, 'withdraw');
      expect(executedTxs).to.have.lengthOf.greaterThan(
        0,
        'No transactions were executed successfully'
      );

      const newReserve = await agent.getTokenReserve(multiChainSigner.wallet.address, 'USDC');
      console.log(`New USDC balance: ${newReserve.underlyingBalance}`);

      // Verify that the balance has decreased
      const oldBalance = parseFloat(oldReserve.underlyingBalance ?? '0');
      const newBalance = parseFloat(newReserve.underlyingBalance ?? '0');
      const actualDecrease = oldBalance - newBalance;
      const expectedDecrease = parseFloat(amountToWithdraw);
      console.log(`Expected decrease: ${expectedDecrease}, Actual decrease: ${actualDecrease}`);
      expect(actualDecrease).to.be.closeTo(expectedDecrease, expectedDecrease * 0.01); // Within 1%
    });
  });
});
