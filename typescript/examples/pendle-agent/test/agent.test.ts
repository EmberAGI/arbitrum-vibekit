/// <reference types="mocha" />
import { expect } from 'chai';
import { utils } from 'ethers';

import 'dotenv/config';
import {
  MultiChainSigner,
  CHAIN_CONFIGS,
  extractAndExecuteTransactions,
  extractBalanceData,
  extractYieldMarketsData,
  isNotFailed
} from 'test-utils';
import { type Address } from 'viem';
import { type YieldMarket } from 'ember-schemas';

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

          expect(isNotFailed(response)).to.equal(true, `List markets operation failed. Response: ${JSON.stringify(response, null, 2)}`);

          // Extract markets data using utility function
          const marketsData = extractYieldMarketsData(response);
          expect(marketsData.markets.length).to.be.greaterThan(0, `No markets found. Markets data: ${JSON.stringify(marketsData, null, 2)}`);
        });
      });

      describe('Pendle internal token swapping', function () {
        let wstETHMarket: YieldMarket | undefined;
        let ptTokenSymbol: string;
        let ytTokenSymbol: string;

        before(async function () {
          // Find wstETH market dynamically
          const yieldMarkets = agent.getYieldMarkets();
          wstETHMarket = yieldMarkets.find(market => 
            market.underlyingAsset.symbol === 'wstETH' && 
            market.chainId === chainId.toString()
          );
          
          if (!wstETHMarket) {
            throw new Error(`No wstETH market found for testing. Available markets: ${JSON.stringify(yieldMarkets.map(m => ({ 
              symbol: m.underlyingAsset.symbol, 
              chainId: m.chainId,
              ptSymbol: m.pt.symbol,
              ytSymbol: m.yt.symbol
            })), null, 2)}`);
          }
          
          ptTokenSymbol = wstETHMarket.pt.symbol;
          ytTokenSymbol = wstETHMarket.yt.symbol;
          
          console.log(`Found wstETH market with PT: ${ptTokenSymbol}, YT: ${ytTokenSymbol}`);
        });

        it('should swap wstETH to PT token successfully', async function () {
          const swapAmount = '0.0001';
          const response = await agent.processUserInput(
            `Swap ${swapAmount} wstETH for ${ptTokenSymbol} on Arbitrum One`,
            multiChainSigner.wallet.address as Address
          );

          expect(isNotFailed(response)).to.equal(true, `Swap wstETH to PT token operation failed. Response: ${JSON.stringify(response, null, 2)}`);

          const txHashes = await extractAndExecuteTransactions(
            response,
            multiChainSigner,
            'swap'
          );
          expect(txHashes.length).to.be.greaterThan(0, `No transaction hashes returned for wstETH to PT swap. Response artifacts: ${JSON.stringify(response.artifacts, null, 2)}`);
        });

        it('should swap wstETH to YT token successfully', async function () {
          const swapAmount = '0.0001';
          const response = await agent.processUserInput(
            `Swap ${swapAmount} wstETH for ${ytTokenSymbol} on Arbitrum One`,
            multiChainSigner.wallet.address as Address
          );

          expect(isNotFailed(response)).to.equal(true, `Swap wstETH to YT token operation failed. Response: ${JSON.stringify(response, null, 2)}`);

          const txHashes = await extractAndExecuteTransactions(
            response,
            multiChainSigner,
            'swap'
          );
          expect(txHashes.length).to.be.greaterThan(0, `No transaction hashes returned for wstETH to YT swap. Response artifacts: ${JSON.stringify(response.artifacts, null, 2)}`);
        });

        it('should check balances and confirm PT/YT tokens appear', async function () {
          const response = await agent.processUserInput(
            'show me my current token balances',
            multiChainSigner.wallet.address as Address
          );

          expect(isNotFailed(response)).to.equal(true, `Get wallet balances operation failed. Response: ${JSON.stringify(response, null, 2)}`);
          
          // Extract balance data using utility function
          const balanceData = extractBalanceData(response);
          expect(balanceData.balances.length).to.be.greaterThan(0, `Balances array should not be empty. Balance data: ${JSON.stringify(balanceData, null, 2)}`);
          
          const ptBalance = balanceData.balances.find(balance => 
            balance.symbol === ptTokenSymbol
          );
          const ytBalance = balanceData.balances.find(balance => 
            balance.symbol === ytTokenSymbol
          );
          
          expect(ptBalance).to.not.equal(undefined, `PT token ${ptTokenSymbol} should appear in balances. Available balances: ${JSON.stringify(balanceData.balances.map(b => ({ symbol: b.symbol, amount: b.amount })), null, 2)}`);
          expect(ytBalance).to.not.equal(undefined, `YT token ${ytTokenSymbol} should appear in balances. Available balances: ${JSON.stringify(balanceData.balances.map(b => ({ symbol: b.symbol, amount: b.amount })), null, 2)}`);
          
          if (ptBalance) {
            expect(parseFloat(ptBalance.amount)).to.be.greaterThan(0, `PT token ${ptTokenSymbol} balance should be greater than 0. Current balance: ${JSON.stringify(ptBalance, null, 2)}`);
          }
          if (ytBalance) {
            expect(parseFloat(ytBalance.amount)).to.be.greaterThan(0, `YT token ${ytTokenSymbol} balance should be greater than 0. Current balance: ${JSON.stringify(ytBalance, null, 2)}`);
          }
        });

        it('should swap PT token back to WETH successfully', async function () {
          // Get current PT balance first
          const balancesResponse = await agent.processUserInput(
            'show me my current token balances',
            multiChainSigner.wallet.address as Address
          );
          
          const balanceData = extractBalanceData(balancesResponse);
          const ptBalance = balanceData.balances.find(balance => 
            balance.symbol === ptTokenSymbol
          );
          
          if (!ptBalance || parseFloat(ptBalance.amount) === 0) {
            throw new Error(`No ${ptTokenSymbol} balance available for swap back to WETH. Available balances: ${JSON.stringify(balanceData.balances.map(b => ({ symbol: b.symbol, amount: b.amount })), null, 2)}`);
          }

          // Convert atomic units to human readable using decimals
          const humanReadableAmount = utils.formatUnits(ptBalance.amount, ptBalance.decimals);
          const response = await agent.processUserInput(
            `Swap ${humanReadableAmount} ${ptTokenSymbol} for WETH on Arbitrum One`,
            multiChainSigner.wallet.address as Address
          );

          expect(isNotFailed(response)).to.equal(true, `Swap PT token to WETH operation failed. Response: ${JSON.stringify(response, null, 2)}`);

          const txHashes = await extractAndExecuteTransactions(
            response,
            multiChainSigner,
            'swap'
          );
          expect(txHashes.length).to.be.greaterThan(0, `No transaction hashes returned for PT to WETH swap. Response artifacts: ${JSON.stringify(response.artifacts, null, 2)}`);
        });

        it('should swap YT token back to WETH successfully', async function () {
          // Get current YT balance first
          const balancesResponse = await agent.processUserInput(
            'show me my current token balances',
            multiChainSigner.wallet.address as Address
          );
          
          const balanceData = extractBalanceData(balancesResponse);
          const ytBalance = balanceData.balances.find(balance => 
            balance.symbol === ytTokenSymbol
          );
          
          if (!ytBalance || parseFloat(ytBalance.amount) === 0) {
            throw new Error(`No ${ytTokenSymbol} balance available for swap back to WETH. Available balances: ${JSON.stringify(balanceData.balances.map(b => ({ symbol: b.symbol, amount: b.amount })), null, 2)}`);
          }

          // Convert atomic units to human readable using decimals
          const humanReadableAmount = utils.formatUnits(ytBalance.amount, ytBalance.decimals);
          const response = await agent.processUserInput(
            `Swap ${humanReadableAmount} ${ytTokenSymbol} for WETH on Arbitrum One`,
            multiChainSigner.wallet.address as Address
          );

          expect(isNotFailed(response)).to.equal(true, `Swap YT token to WETH operation failed. Response: ${JSON.stringify(response, null, 2)}`);

          const txHashes = await extractAndExecuteTransactions(
            response,
            multiChainSigner,
            'swap'
          );
          expect(txHashes.length).to.be.greaterThan(0, `No transaction hashes returned for YT to WETH swap. Response artifacts: ${JSON.stringify(response.artifacts, null, 2)}`);
        });
      });

      describe('Agent State Management', function () {
        it('should return non-empty response arrays', async function () {
          // Test market listing returns non-empty array
          const marketsResponse = await agent.processUserInput(
            'What Pendle markets are available?',
            multiChainSigner.wallet.address as Address
          );
          expect(isNotFailed(marketsResponse)).to.equal(true, `Market listing operation failed. Response: ${JSON.stringify(marketsResponse, null, 2)}`);
          
          // Extract markets data using utility function  
          const marketsData = extractYieldMarketsData(marketsResponse);
          expect(marketsData.markets.length).to.be.greaterThan(0, `Markets array should not be empty. Markets data: ${JSON.stringify(marketsData, null, 2)}`);

          // Test wallet balances returns non-empty array
          const balancesResponse = await agent.processUserInput(
            'show me my current token balances',
            multiChainSigner.wallet.address as Address
          );
          expect(isNotFailed(balancesResponse)).to.equal(true, `Get wallet balances operation failed. Response: ${JSON.stringify(balancesResponse, null, 2)}`);
          
          const balanceData = extractBalanceData(balancesResponse);
          expect(balanceData.balances.length).to.be.greaterThan(0, `Balances array should not be empty. Balance data: ${JSON.stringify(balanceData, null, 2)}`);
        });
      });
    });
  }
}); 