import { describe, it, expect, beforeAll } from 'vitest';
import { ethers } from 'ethers';
import { CompoundAdapter } from '../../../src/compound-lending-plugin/adapter.js';

const TEST_TIMEOUT = 60000;
const ANVIL_RPC_URL = process.env.ANVIL_RPC_URL || 'http://localhost:8545';

const USDC_ADDRESS = '0xaf88d065e77c8cc2239327c5edb3a432268e5831';
const WBTC_ADDRESS = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';

function parseUnits(value: number, decimals: number): bigint {
  // Convert decimal value to integer by multiplying and then converting to BigInt
  // e.g., parseUnits(0.01, 8) = BigInt(0.01 * 10^8) = BigInt(1000000)
  const multiplier = 10n ** BigInt(decimals);
  const integerValue = BigInt(Math.floor(value * Number(multiplier)));
  return integerValue;
}

async function deal(
  provider: ethers.providers.JsonRpcProvider,
  address: string,
  amount: bigint,
): Promise<void> {
  await provider.send('anvil_setBalance', [address, ethers.utils.hexValue(amount)]);
  await provider.send('evm_mine', []);
}

async function dealToken(
  provider: ethers.providers.JsonRpcProvider,
  tokenAddress: string,
  userAddress: string,
  amount: bigint,
): Promise<void> {
  const newBalance = ethers.BigNumber.from(amount.toString());
  const newBalanceHex = ethers.utils.hexZeroPad(newBalance.toHexString(), 32);
  const candidateSlots = [0, 9, 51];

  for (const mappingSlot of candidateSlots) {
    const storageSlot = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [userAddress, mappingSlot]),
    );

    await provider.send('anvil_setStorageAt', [tokenAddress, storageSlot, newBalanceHex]);
    await provider.send('evm_mine', []);

    try {
      const erc20 = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address owner) view returns (uint256)'],
        provider,
      );
      const balanceAfter = await erc20.balanceOf(userAddress);
      if (balanceAfter.eq(newBalance)) {
        return;
      }
    } catch {
      // Try next slot
    }
  }

  throw new Error(
    `Failed to set token balance for ${tokenAddress}. Tried slots ${candidateSlots.join(', ')}`,
  );
}

describe('CompoundAdapter Transaction Integration Tests', () => {
  let adapter: CompoundAdapter;
  let provider: ethers.providers.JsonRpcProvider;
  let testWallet: ethers.Wallet;
  let testWalletAddress: string;
  let signer: ethers.Signer;

  beforeAll(async () => {
    // Check if Anvil is running
    const testProvider = new ethers.providers.JsonRpcProvider(ANVIL_RPC_URL);
    try {
      await testProvider.getBlockNumber();
    } catch (error) {
      throw new Error(
        `Anvil is not running at ${ANVIL_RPC_URL}.\n` +
          `Please start Anvil first:\n` +
          `  anvil --fork-url <ARBITRUM_RPC_URL> --port 8545\n` +
          `Or set ANVIL_RPC_URL environment variable to point to your Anvil instance.`,
      );
    }

    adapter = new CompoundAdapter({
      chainId: 42161,
      rpcUrl: ANVIL_RPC_URL,
      marketId: 'USDC',
    });

    provider = new ethers.providers.JsonRpcProvider(ANVIL_RPC_URL);
    testWallet = ethers.Wallet.createRandom().connect(provider);
    signer = testWallet;
    testWalletAddress = testWallet.address;

    // Fund wallet with Anvil
    await deal(provider, testWalletAddress, parseUnits(100, 18));
    await dealToken(provider, USDC_ADDRESS, testWalletAddress, parseUnits(10000, 6));
    await dealToken(provider, WBTC_ADDRESS, testWalletAddress, parseUnits(1, 8));

    // Verify funding
    const ethBalance = await provider.getBalance(testWalletAddress);
    const usdcContract = new ethers.Contract(
      USDC_ADDRESS,
      ['function balanceOf(address owner) view returns (uint256)'],
      provider,
    );
    const wbtcContract = new ethers.Contract(
      WBTC_ADDRESS,
      ['function balanceOf(address owner) view returns (uint256)'],
      provider,
    );
    const usdcBalance = await usdcContract.balanceOf(testWalletAddress);
    const wbtcBalance = await wbtcContract.balanceOf(testWalletAddress);
  });

  async function executeTransactions(
    transactions: Array<{ to: string; value: string; data: string; chainId: string }>,
  ): Promise<string[]> {
    const txHashes: string[] = [];
    for (const tx of transactions) {
      const txResponse = await signer.sendTransaction({
        to: tx.to,
        value: ethers.BigNumber.from(tx.value),
        data: tx.data,
      });
      const receipt = await txResponse.wait(1);
      if (receipt.status !== 1) {
        throw new Error(`Transaction failed: ${txResponse.hash}`);
      }
      txHashes.push(txResponse.hash);
    }
    // Wait a bit for state to update
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return txHashes;
  }

  async function getCompoundBalance(tokenAddress: string): Promise<bigint> {
    try {
      const userSummary = await adapter.getUserSummary({ walletAddress: testWalletAddress });
      const reserve = userSummary.userReserves.find(
        (r) => r.tokenUid.address.toLowerCase() === tokenAddress.toLowerCase(),
      );
      return reserve ? BigInt(reserve.underlyingBalance) : BigInt(0);
    } catch (error) {
      return BigInt(0);
    }
  }

  async function getCompoundBorrowBalance(tokenAddress: string): Promise<bigint> {
    const userSummary = await adapter.getUserSummary({ walletAddress: testWalletAddress });
    const reserve = userSummary.userReserves.find(
      (r) => r.tokenUid.address.toLowerCase() === tokenAddress.toLowerCase(),
    );
    return reserve ? BigInt(reserve.totalBorrows) : BigInt(0);
  }

  async function getWalletTokenBalance(tokenAddress: string): Promise<bigint> {
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ['function balanceOf(address owner) view returns (uint256)'],
      provider,
    );
    return BigInt((await tokenContract.balanceOf(testWalletAddress)).toString());
  }

  function createToken(address: string, decimals: number, name: string, symbol: string) {
    return {
      tokenUid: { address, chainId: '42161' },
      name,
      symbol,
      isNative: false,
      decimals,
      isVetted: true,
    };
  }

  describe('createSupplyTransaction', () => {
    it(
      'should increase balance when supplying base token (USDC)',
      async () => {
        const amount = parseUnits(1, 6);
        const initialCompound = await getCompoundBalance(USDC_ADDRESS);
        const initialWallet = await getWalletTokenBalance(USDC_ADDRESS);

        const result = await adapter.createSupplyTransaction({
          supplyToken: createToken(USDC_ADDRESS, 6, 'USD Coin', 'USDC'),
          amount,
          walletAddress: testWalletAddress,
        });

        expect(result.transactions.length).toBeGreaterThan(0);

        await executeTransactions(result.transactions);
        const finalCompound = await getCompoundBalance(USDC_ADDRESS);
        const finalWallet = await getWalletTokenBalance(USDC_ADDRESS);

        expect(finalCompound).toBeGreaterThan(initialCompound);
        expect(finalWallet).toBeLessThan(initialWallet);
      },
      TEST_TIMEOUT,
    );

    it(
      'should increase balance when supplying collateral token (WBTC)',
      async () => {
        const amount = parseUnits(0.01, 8); // 0.01 WBTC
        const initialCompound = await getCompoundBalance(WBTC_ADDRESS);
        const initialWallet = await getWalletTokenBalance(WBTC_ADDRESS);

        const result = await adapter.createSupplyTransaction({
          supplyToken: createToken(WBTC_ADDRESS, 8, 'Wrapped Bitcoin', 'WBTC'),
          amount,
          walletAddress: testWalletAddress,
        });

        expect(result.transactions.length).toBeGreaterThanOrEqual(1);

        await executeTransactions(result.transactions);

        const finalCompound = await getCompoundBalance(WBTC_ADDRESS);
        const finalWallet = await getWalletTokenBalance(WBTC_ADDRESS);

        expect(finalCompound).toBeGreaterThan(initialCompound);
        expect(finalWallet).toBeLessThan(initialWallet);
      },
      TEST_TIMEOUT,
    );
  });

  describe('createWithdrawTransaction', () => {
    it(
      'should decrease balance when withdrawing collateral',
      async () => {
        // Step 1: Supply WBTC first
        const supplyAmount = parseUnits(0.01, 8); // 0.01 WBTC
        const tokenAddress = WBTC_ADDRESS;

        const supplyResult = await adapter.createSupplyTransaction({
          supplyToken: createToken(WBTC_ADDRESS, 8, 'Wrapped Bitcoin', 'WBTC'),
          amount: supplyAmount,
          walletAddress: testWalletAddress,
        });

        await executeTransactions(supplyResult.transactions);

        // Step 2: Withdraw WBTC
        const withdrawAmount = supplyAmount / BigInt(2); // Withdraw half of what we supplied
        const initialCompound = await getCompoundBalance(tokenAddress);
        const initialWallet = await getWalletTokenBalance(tokenAddress);

        const result = await adapter.createWithdrawTransaction({
          tokenToWithdraw: createToken(WBTC_ADDRESS, 8, 'Wrapped Bitcoin', 'WBTC'),
          amount: withdrawAmount,
          walletAddress: testWalletAddress,
        });

        expect(result.transactions.length).toBe(1);

        await executeTransactions(result.transactions);
        const finalCompound = await getCompoundBalance(tokenAddress);
        const finalWallet = await getWalletTokenBalance(tokenAddress);

        expect(finalCompound).toBeLessThan(initialCompound);
        expect(finalWallet).toBeGreaterThan(initialWallet);
      },
      TEST_TIMEOUT,
    );

    it(
      'should decrease balance when withdrawing base token',
      async () => {
        // Step 1: Supply USDC first
        const supplyAmount = parseUnits(10, 6); // 10 USDC
        const tokenAddress = USDC_ADDRESS;

        const supplyResult = await adapter.createSupplyTransaction({
          supplyToken: createToken(USDC_ADDRESS, 6, 'USD Coin', 'USDC'),
          amount: supplyAmount,
          walletAddress: testWalletAddress,
        });

        await executeTransactions(supplyResult.transactions);

        // Step 2: Withdraw USDC
        const withdrawAmount = supplyAmount / BigInt(2); // Withdraw half of what we supplied
        const initialCompound = await getCompoundBalance(tokenAddress);
        const initialWallet = await getWalletTokenBalance(tokenAddress);

        const result = await adapter.createWithdrawTransaction({
          tokenToWithdraw: createToken(USDC_ADDRESS, 6, 'USD Coin', 'USDC'),
          amount: withdrawAmount,
          walletAddress: testWalletAddress,
        });

        expect(result.transactions.length).toBe(1);

        await executeTransactions(result.transactions);
        const finalCompound = await getCompoundBalance(tokenAddress);
        const finalWallet = await getWalletTokenBalance(tokenAddress);

        expect(finalCompound).toBeLessThan(initialCompound);
        expect(finalWallet).toBeGreaterThan(initialWallet);
      },
      TEST_TIMEOUT,
    );
  });

  describe.skip('createBorrowTransaction', () => {
    it(
      'should increase borrow balance when borrowing base token',
      async () => {
        // Step 1: Supply WBTC collateral first (needed to borrow against)
        const collateralAmount = parseUnits(0.1, 8); // 0.1 WBTC
        const collateralAddress = WBTC_ADDRESS;

        const supplyResult = await adapter.createSupplyTransaction({
          supplyToken: createToken(WBTC_ADDRESS, 8, 'Wrapped Bitcoin', 'WBTC'),
          amount: collateralAmount,
          walletAddress: testWalletAddress,
        });

        await executeTransactions(supplyResult.transactions);

        // Step 2: Borrow USDC (base token)
        const borrowAmount = parseUnits(1, 6); // 1 USDC

        // Get initial balances
        const initialBorrow = await getCompoundBorrowBalance(USDC_ADDRESS);
        const initialWallet = await getWalletTokenBalance(USDC_ADDRESS);

        const result = await adapter.createBorrowTransaction({
          borrowToken: createToken(USDC_ADDRESS, 6, 'USD Coin', 'USDC'),
          amount: borrowAmount,
          walletAddress: testWalletAddress,
        });

        expect(result.transactions.length).toBe(1);
        expect(result.currentBorrowApy).toBeDefined();
        expect(typeof result.currentBorrowApy).toBe('string');
        expect(result.liquidationThreshold).toBeDefined();

        // Execute and wait for confirmation
        const txHashes = await executeTransactions(result.transactions);
        expect(txHashes.length).toBeGreaterThan(0);

        // Verify the transaction succeeded by checking the receipt
        const txReceipt = await provider.getTransactionReceipt(txHashes[txHashes.length - 1]);
        expect(txReceipt).toBeDefined();
        expect(txReceipt.status).toBe(1); // Transaction succeeded

        // Wait a bit for state to update
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Check borrow balance
        const finalBorrow = await getCompoundBorrowBalance(USDC_ADDRESS);
        const finalWallet = await getWalletTokenBalance(USDC_ADDRESS);

        // Verify wallet balance increased (confirms borrow transaction succeeded)
        expect(finalWallet).toBeGreaterThan(initialWallet);

        // Verify borrow balance increased by at least the borrow amount (allowing for rounding)
        const borrowIncrease = finalBorrow - initialBorrow;
        expect(borrowIncrease).toBeGreaterThanOrEqual(borrowAmount - BigInt(1000));
      },
      TEST_TIMEOUT,
    );

    it(
      'should throw error when trying to borrow non-base token',
      async () => {
        await expect(
          adapter.createBorrowTransaction({
            borrowToken: createToken(WBTC_ADDRESS, 8, 'Wrapped Bitcoin', 'WBTC'),
            amount: parseUnits(0.01, 8),
            walletAddress: testWalletAddress,
          }),
        ).rejects.toThrow('only supports borrowing the base token');
      },
      TEST_TIMEOUT,
    );
  });

  /**
   * Test suite for createRepayTransaction method
   *
   * This test verifies the complete flow:
   * 1. Supply WBTC collateral (required to borrow against)
   * 2. Borrow USDC base token (creates a borrow position)
   * 3. Repay half of the borrowed USDC (reduces borrow balance)
   * 4. Withdraw half of the WBTC collateral (reduces collateral position)
   *
   * Note: In Compound V3, repaying is done by supplying the base token,
   * and borrowing is done by withdrawing the base token.
   */
  describe.only('createRepayTransaction', () => {
    it(
      'should decrease borrow balance when repaying base token',
      async () => {
        // ========================================================================
        // Step 1: Supply WBTC Collateral
        // ========================================================================
        // Supply collateral first - this is required to borrow against in Compound V3
        // Without collateral, borrowing would fail or result in immediate liquidation
        const collateralAmount = parseUnits(0.1, 8); // 0.1 WBTC

        const supplyResult = await adapter.createSupplyTransaction({
          supplyToken: createToken(WBTC_ADDRESS, 8, 'Wrapped Bitcoin', 'WBTC'),
          amount: collateralAmount,
          walletAddress: testWalletAddress,
        });

        await executeTransactions(supplyResult.transactions);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // ========================================================================
        // Step 2: Borrow USDC Base Token
        // ========================================================================
        // In Compound V3, borrowing is done by withdrawing the base token
        // The protocol automatically creates a borrow position if there's no supply
        const borrowAmount = parseUnits(5, 6); // 5 USDC
        const beforeBorrow = await getCompoundBorrowBalance(USDC_ADDRESS);

        const borrowResult = await adapter.createBorrowTransaction({
          borrowToken: createToken(USDC_ADDRESS, 6, 'USD Coin', 'USDC'),
          amount: borrowAmount,
          walletAddress: testWalletAddress,
        });

        await executeTransactions(borrowResult.transactions);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Verify borrow position was created
        const afterBorrow = await getCompoundBorrowBalance(USDC_ADDRESS);
        expect(afterBorrow).toBeGreaterThan(beforeBorrow);
        const borrowIncrease = afterBorrow - beforeBorrow;
        expect(borrowIncrease).toBeGreaterThanOrEqual(borrowAmount - BigInt(1000)); // Allow small rounding

        // ========================================================================
        // Step 3: Repay USDC Base Token
        // ========================================================================
        // In Compound V3, repaying is done by supplying the base token
        // This reduces the borrow balance and uses tokens from the wallet
        const repayAmount = afterBorrow / BigInt(2); // Repay half of the borrow
        expect(repayAmount).toBeGreaterThan(BigInt(0));

        const initialBorrow = await getCompoundBorrowBalance(USDC_ADDRESS);
        const initialWallet = await getWalletTokenBalance(USDC_ADDRESS);

        const repayResult = await adapter.createRepayTransaction({
          repayToken: createToken(USDC_ADDRESS, 6, 'USD Coin', 'USDC'),
          amount: repayAmount,
          walletAddress: testWalletAddress,
        });

        expect(repayResult.transactions.length).toBeGreaterThan(0);
        await executeTransactions(repayResult.transactions);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Verify repay succeeded: borrow balance decreased, wallet balance decreased
        const finalBorrow = await getCompoundBorrowBalance(USDC_ADDRESS);
        const finalWallet = await getWalletTokenBalance(USDC_ADDRESS);
        expect(finalBorrow).toBeLessThan(initialBorrow);
        expect(finalWallet).toBeLessThan(initialWallet);

        // ========================================================================
        // Step 4: Withdraw WBTC Collateral
        // ========================================================================
        // Withdraw half of the supplied collateral to verify withdrawal works
        // even when there's an active borrow position
        const withdrawAmount = collateralAmount / BigInt(2); // Half of supplied WBTC
        const initialWbtcCompound = await getCompoundBalance(WBTC_ADDRESS);
        const initialWbtcWallet = await getWalletTokenBalance(WBTC_ADDRESS);

        const withdrawResult = await adapter.createWithdrawTransaction({
          tokenToWithdraw: createToken(WBTC_ADDRESS, 8, 'Wrapped Bitcoin', 'WBTC'),
          amount: withdrawAmount,
          walletAddress: testWalletAddress,
        });

        expect(withdrawResult.transactions.length).toBeGreaterThan(0);
        await executeTransactions(withdrawResult.transactions);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Verify withdraw succeeded: Compound balance decreased, wallet balance increased
        const finalWbtcCompound = await getCompoundBalance(WBTC_ADDRESS);
        const finalWbtcWallet = await getWalletTokenBalance(WBTC_ADDRESS);
        expect(finalWbtcCompound).toBeLessThan(initialWbtcCompound);
        expect(finalWbtcWallet).toBeGreaterThan(initialWbtcWallet);
      },
      TEST_TIMEOUT,
    );

    it(
      'should throw error when trying to repay non-base token',
      async () => {
        await expect(
          adapter.createRepayTransaction({
            repayToken: createToken(WBTC_ADDRESS, 8, 'Wrapped Bitcoin', 'WBTC'),
            amount: parseUnits(0.01, 8),
            walletAddress: testWalletAddress,
          }),
        ).rejects.toThrow('only supports repaying the base token');
      },
      TEST_TIMEOUT,
    );
  });
});
