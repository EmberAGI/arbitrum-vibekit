/// <reference types="mocha" />
import { expect } from 'chai';

import 'dotenv/config';
import {
  MultiChainSigner,
  CHAIN_CONFIGS,
  extractAndExecuteTransactions,
  extractTokenMarketData,
} from 'test-utils';
import { type Address } from 'viem';

import { Agent } from '../src/agent.js';

const CHAINS_TO_TEST: number[] = [42161];

describe('Pendle Agent Integration Tests', function () {
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
      });

      describe('Market Listing', function () {
        it('should list Pendle markets successfully', async function () {
          const response = await agent.processUserInput(
            'List available Pendle markets',
            multiChainSigner.wallet.address as Address
          );

          expect(response.status?.state).to.not.equal('failed', 'List markets operation failed');

          const marketArtifact = response!.artifacts!.find(artifact => artifact.name === 'yield-markets');
          expect(marketArtifact!.parts!.length).to.be.greaterThan(0, 'No market data found');              
        });
      });

      describe('Token Swapping', function () {
        it('should execute swap transactions successfully', async function () {
          // Try to swap a small amount of WETH for a PT token
          const swapAmount = '0.0001';
          const response = await agent.processUserInput(
            `Swap ${swapAmount} wstETH for wstETH_PT on Arbitrum One`,
            multiChainSigner.wallet.address as Address
          );

          expect(response.status?.state).to.not.equal('failed', 'Swap operation failed');

          const txHashes = await extractAndExecuteTransactions(
            response,
            multiChainSigner,
            'swap'
          );
          expect(txHashes.length).to.be.greaterThan(0, 'No transaction hashes returned');
        });        
      });

      describe('Agent State Management', function () {
        it('should return non-empty response arrays', async function () {
          // Test market listing returns non-empty array
          const marketsResponse = await agent.processUserInput(
            'What Pendle markets are available?',
            multiChainSigner.wallet.address as Address
          );
          expect(marketsResponse).to.exist;
          expect(marketsResponse.status?.state).to.not.equal('failed');
          
          if (marketsResponse.artifacts && marketsResponse.artifacts.length > 0) {
            const marketArtifact = marketsResponse.artifacts.find(artifact => artifact.name === 'yield-markets');
            if (marketArtifact && marketArtifact.parts) {
              expect(marketArtifact.parts.length).to.be.greaterThan(0, 'Markets array should not be empty');
            }
          }

          // Test wallet balances returns non-empty array
          const balancesResponse = await agent.processUserInput(
            'show me my current token balances',
            multiChainSigner.wallet.address as Address
          );
          expect(balancesResponse).to.exist;
          expect(balancesResponse.status?.state).to.not.equal('failed');
          console.error("Balances response", JSON.stringify(balancesResponse, null, 2));
          const balanceArtifact = balancesResponse!.artifacts!.find(artifact => artifact.name === 'wallet-balances');
          expect(balanceArtifact!.parts!.length).to.be.greaterThan(0, 'Balances array should not be empty');
        });
      });
    });
  }
}); 