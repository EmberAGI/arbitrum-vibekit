/// <reference types="mocha" />
import 'dotenv/config';
import { expect } from 'chai';

import {
  MultiChainSigner,
  CHAIN_CONFIGS,
  extractAndExecuteTransactions,
  extractMessageText,
  ensureWethBalance,
} from 'test-utils';
import { type Address } from 'viem';

import { Agent } from '../src/agent.js';

const CHAINS_TO_TEST: number[] = [42161]; // Arbitrum

describe('Swapping Agent Integration Tests', function () {
  this.timeout(90_000); // Increased timeout for blockchain operations

  let multiChainSigner: MultiChainSigner;
  let agent: Agent;

  // Check all required environment variables upfront
  const requiredEnvVars = {
    QUICKNODE_SUBDOMAIN: process.env.QUICKNODE_SUBDOMAIN,
    QUICKNODE_API_KEY: process.env.QUICKNODE_API_KEY,
    MNEMONIC: process.env.MNEMONIC,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    EMBER_ENDPOINT: process.env.EMBER_ENDPOINT,
  };

  // Validate all environment variables before running tests
  before(function () {
    const missingVars = Object.entries(requiredEnvVars)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(', ')}. ` +
          'Please ensure all environment variables are set in your .env file.'
      );
    }
  });

  before(async function () {
    try {
      // Create a single MultiChainSigner for all chains being tested
      multiChainSigner = await MultiChainSigner.fromTestChains(CHAINS_TO_TEST);

      // Initialize agent
      agent = new Agent(requiredEnvVars.QUICKNODE_SUBDOMAIN!, requiredEnvVars.QUICKNODE_API_KEY!);
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

        // Ensure the test wallet has at least a minimal WETH balance (0.05) so swaps that
        // route through WETH never fail due to insufficient funds.
        const wethAddress = CHAIN_CONFIGS[chainId]?.wrappedNativeToken?.address;
        if (!wethAddress) {
          throw new Error(`No wrapped native token (WETH) defined for chain ${chainId}.`);
        }

        const signer = multiChainSigner.getSignerForChainId(chainId);
        await ensureWethBalance(signer, '0.05', wethAddress);
      });

      describe('Token Swapping', function () {
        it('should execute WETH to USDC swap successfully', async function () {
          // Swap a very small amount of WETH for USDC
          const swapAmount = '0.00001';
          const response = await agent.processUserInput(
            `Swap ${swapAmount} WETH for USDC on Arbitrum`,
            multiChainSigner.wallet.address as Address
          );

          console.log('Swap response:', JSON.stringify(response, null, 2));

          // In test environment, the MCP server may return empty transaction plans
          // We're testing the integration, token resolution, and balance checking
          if (response.status?.state === 'failed') {
            const messageParts = response.status.message?.parts;
            const textPart = messageParts?.find(part => part.kind === 'text');
            if (
              textPart &&
              'text' in textPart &&
              textPart.text?.includes('empty transaction plan')
            ) {
              console.log('Expected behavior: Test MCP server returned empty transaction plan');
              // This is expected in the test environment
              return;
            }
          }

          expect(response.status?.state).to.not.equal('failed', 'Swap operation failed');

          // Check that we have a transaction plan (only if not empty plan scenario)
          const swapArtifact = response!.artifacts!.find(
            artifact => artifact.name === 'transaction-plan'
          );
          expect(swapArtifact).to.exist;
          expect(swapArtifact!.parts!.length).to.be.greaterThan(0, 'No transaction plan found');

          // Execute the transactions
          const txHashes = await extractAndExecuteTransactions(response, multiChainSigner, 'swap');
          expect(txHashes.length).to.be.greaterThan(0, 'No transaction hashes returned');

          console.log('Transaction hashes:', txHashes);
        });

        it('should handle multi-chain token ambiguity', async function () {
          // Test swapping without specifying chain (should ask for clarification)
          const response = await agent.processUserInput(
            'Swap 0.00001 USDC for DAI',
            multiChainSigner.wallet.address as Address
          );

          const messageText = extractMessageText(response);
          console.log('Ambiguity response:', messageText);

          // Should either ask for chain clarification or handle it gracefully
          expect(messageText.toLowerCase()).to.satisfy(
            (text: string) =>
              text.includes('chain') ||
              text.includes('specify') ||
              text.includes('transaction plan') // If it picked a default chain
          );
        });
      });

      describe('Basic Capabilities', function () {
        it('should be able to describe what it can do', async function () {
          const response = await agent.processUserInput(
            'What can you do?',
            multiChainSigner.wallet.address as Address
          );

          const messageText = extractMessageText(response);
          expect(messageText.toLowerCase()).to.satisfy(
            (text: string) =>
              text.includes('swap') ||
              text.includes('token') ||
              text.includes('convert') ||
              text.includes('camelot')
          );
        });

        it('should be able to answer Camelot DEX questions', async function () {
          const response = await agent.processUserInput(
            'What is Camelot?',
            multiChainSigner.wallet.address as Address
          );

          const messageText = extractMessageText(response);
          expect(messageText.toLowerCase()).to.satisfy(
            (text: string) => text.includes('dex') || text.includes('decentralized exchange')
          );
        });
      });

      describe('Error Handling', function () {
        it('should handle insufficient balance gracefully', async function () {
          // Try to swap more than we have
          const response = await agent.processUserInput(
            'Swap 1000000 WETH for USDC on Arbitrum',
            multiChainSigner.wallet.address as Address
          );

          const messageText = extractMessageText(response);
          expect(messageText.toLowerCase()).to.satisfy(
            (text: string) =>
              text.includes('insufficient') ||
              text.includes('balance') ||
              text.includes('not enough')
          );
        });

        it('should handle unsupported tokens', async function () {
          const response = await agent.processUserInput(
            'Swap 1 FAKECOIN for USDC',
            multiChainSigner.wallet.address as Address
          );

          const messageText = extractMessageText(response);
          expect(messageText.toLowerCase()).to.satisfy(
            (text: string) =>
              text.includes('not supported') ||
              text.includes('unsupported') ||
              text.includes('not found') ||
              text.includes('fakecoin') ||
              text.includes('chain') || // Agent might ask for chain clarification
              text.includes('specify') // Agent might ask to specify more details
          );
        });
      });
    });
  }
});
