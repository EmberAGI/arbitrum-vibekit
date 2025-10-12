/// <reference types="mocha" />
import { expect } from 'chai';
import type { Task } from '@emberai/arbitrum-vibekit-core/google-a2a-types';

import 'dotenv/config';
import * as ethers from 'ethers';
import {
  MultiChainSigner,
  CHAIN_CONFIGS,
  ensureWethBalance,
  extractMessageText,
  extractAndExecuteTransactions,
  mintUSDC,
  ERC20Wrapper,
} from 'test-utils';
import { type Address } from 'viem';

import { Agent } from '../src/agent.js';

// Define chain IDs that should be tested
const CHAINS_TO_TEST: number[] = [42161]; // Arbitrum One

describe('Liquidity Agent Integration Tests', function () {
  this.timeout(90_000);

  let multiChainSigner: MultiChainSigner;
  let agent: Agent;
  let walletAddress: Address;
  let usdc: ERC20Wrapper;

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
      multiChainSigner = await MultiChainSigner.fromTestChains(CHAINS_TO_TEST);

      walletAddress = await multiChainSigner.getAddress();

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
        if (!CHAIN_CONFIGS[chainId]) {
          throw new Error(
            `Chain configuration missing for chain ID ${chainId}. Please add it to CHAIN_CONFIGS.`
          );
        }

        const wethAddress = CHAIN_CONFIGS[chainId]?.wrappedNativeToken?.address;
        if (!wethAddress) {
          throw new Error(`No wrapped native token (WETH) defined for chain ${chainId}.`);
        }

        const usdcAddress = CHAIN_CONFIGS[chainId]?.anotherToken?.address;
        if (!usdcAddress) {
          throw new Error(`No secondary token (USDC) defined for chain ${chainId}.`);
        }

        // Ensure WETH balance - use higher amount to ensure all operations can be completed
        const signer = multiChainSigner.getSignerForChainId(chainId);
        await ensureWethBalance(signer, '0.5', wethAddress);

        // Mint USDC to the test wallet
        // Get provider from signer and ensure it's a JsonRpcProvider
        const provider = signer.provider as ethers.providers.JsonRpcProvider;
        await mintUSDC({
          provider,
          tokenAddress: usdcAddress,
          userAddress: walletAddress,
          balanceStr: (1000_000_000).toString(), // 1000 USDC (assuming 6 decimals)
        });

        // Initialize USDC wrapper
        usdc = new ERC20Wrapper(provider, usdcAddress);
        // Verify USDC balance
        const usdcBalance = await usdc.balanceOf(walletAddress);
        console.log(`USDC Balance: ${usdcBalance.toString()}`);
        expect(usdcBalance.gte(1000_000_000)).to.be.true;
      });

      describe('Basic Capabilities', function () {
        it('should be able to describe what it can do', async function () {
          const response = await agent.processUserInput('What can you do?', walletAddress);
          const messageText = extractMessageText(response);
          expect(messageText.toLowerCase()).to.satisfy(
            (text: string) =>
              text.includes('liquidity') || text.includes('pool') || text.includes('swap')
          );
        });
      });

      describe('Pool Management', function () {
        it('should be able to list pools', async function () {
          const response = await agent.processUserInput('list pools', walletAddress);

          // Verify we get a response with pools data
          expect(response.status?.state).to.not.equal('failed', 'List pools operation failed');

          const messageText = extractMessageText(response);
          expect(messageText.toLowerCase()).to.include('pool');
        });
      });

      describe('Liquidity Operations', function () {
        it('should be able to deposit liquidity', async function () {
          // First get pools to find WETH/USDC pool and its price
          const poolsResponse = await agent.processUserInput('list pools', walletAddress);
          expect(poolsResponse.status?.state).to.not.equal('failed', 'List pools operation failed');

          // Extract pools from response artifacts
          const pools = extractPools(poolsResponse);
          expect(pools.length).to.be.greaterThan(0, 'No pools found in response');

          // Find WETH/USDC pool
          const wethUsdcPool = pools.find(
            pool =>
              (pool.symbol0 === 'WETH' && pool.symbol1 === 'USDC') ||
              (pool.symbol0 === 'USDC' && pool.symbol1 === 'WETH')
          );
          (expect(wethUsdcPool).to.not.be.undefined, 'WETH/USDC pool not found');

          // Get price from pool data
          const price = parseFloat(wethUsdcPool!.price);
          expect(price).to.be.greaterThan(0, 'Invalid pool price');
          console.log(`WETH/USDC pool price: ${price}`);

          const targetUSDCAmount = 0.01;
          const wethAmount = (targetUSDCAmount / price).toFixed(6);

          const usdcBalanceBefore = await usdc.balanceOf(walletAddress);
          console.log(`USDC Balance before deposit: ${usdcBalanceBefore.toString()}`);

          // Deposit liquidity
          const response = await agent.processUserInput(
            `Deposit ${wethAmount} WETH and ${targetUSDCAmount} USDC to the WETH/USDC pool within the range from ${(price * 0.8).toFixed(2)} to ${(price * 1.2).toFixed(2)}`,
            walletAddress
          );

          expect(response.status?.state).to.not.equal('failed', 'Deposit operation failed');

          const txHashes = await extractAndExecuteTransactions(
            response,
            multiChainSigner,
            'deposit'
          );
          expect(txHashes.length).to.be.greaterThan(0, 'No transaction hashes returned');

          // Check USDC balance after deposit
          const usdcBalanceAfter = await usdc.balanceOf(walletAddress);
          console.log(`USDC Balance after deposit: ${usdcBalanceAfter.toString()}`);

          // Verify USDC balance decreased
          expect(usdcBalanceBefore.sub(usdcBalanceAfter).gt(0)).to.be.true;
        });
      });

      describe('Position Management', function () {
        it('should be able to list positions', async function () {
          // Get and display positions
          const response = await agent.processUserInput('show my positions', walletAddress);

          expect(response.status?.state).to.not.equal('failed', 'Show positions operation failed');

          const messageText = extractMessageText(response);
          expect(messageText.toLowerCase()).to.satisfy(
            (text: string) =>
              text.includes('position') || text.includes('liquidity') || text.includes('pool')
          );
        });
      });
    });
  }
});

/**
 * Extract pools from agent response artifacts
 * @param response The agent response object
 * @returns Array of pool objects or empty array if none found
 */
function extractPools(response: Task): Array<{
  handle: string;
  symbol0: string;
  symbol1: string;
  token0: { chainId: string; address: string };
  token1: { chainId: string; address: string };
  price: string;
}> {
  if (!response.artifacts) {
    throw new Error(`No artifacts found in response: ${JSON.stringify(response, null, 2)}`);
  }

  // Look for available-liquidity-pools artifact
  for (const artifact of response.artifacts) {
    if (artifact.name === 'available-liquidity-pools') {
      for (const part of artifact.parts) {
        if ((part as any).kind === 'data' && (part as any).data.liquidityPools) {
          const pools = (part as any).data.liquidityPools;
          if (Array.isArray(pools)) {
            return pools;
          }
        }
      }
    }
  }

  throw new Error(`No pools found in response: ${JSON.stringify(response, null, 2)}`);
}
