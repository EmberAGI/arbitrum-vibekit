import * as ethers from 'ethers';

// WETH ABI for deposit function
const WETH_ABI = [
  // deposit function
  'function deposit() external payable',
  // balanceOf function
  'function balanceOf(address) external view returns (uint256)',
  // decimals function
  'function decimals() external view returns (uint8)',
];

/**
 * Ensures the given signer has at least the specified amount of WETH
 * If not, it will wrap ETH to WETH to reach the desired amount
 * @param signer The Ethereum signer
 * @param minBalanceInEth Minimum balance in ETH units
 * @param wethAddress Address of the WETH contract
 */
export async function ensureWethBalance(
  signer: ethers.Signer,
  minBalanceInEth: string,
  wethAddress: string
): Promise<void> {
  // Get signer address
  const signerAddress = await signer.getAddress();

  // Create WETH contract instance
  const wethContract = new ethers.Contract(wethAddress, WETH_ABI, signer);

  // Get current WETH balance
  const currentBalance = await wethContract.balanceOf(signerAddress);
  const decimals = await wethContract.decimals();

  // Calculate minimum balance in wei
  const minBalanceInWei = ethers.utils.parseUnits(minBalanceInEth, decimals);

  // Check if current balance is less than minimum required
  if (currentBalance.lt(minBalanceInWei)) {
    // Calculate how much more WETH is needed
    const amountToDeposit = minBalanceInWei.sub(currentBalance);

    console.log(`Wrapping ${ethers.utils.formatUnits(amountToDeposit, decimals)} ETH to WETH`);

    // Deposit ETH to get WETH
    const tx = await wethContract.deposit({
      value: amountToDeposit,
    });

    // Wait for transaction to be mined
    await tx.wait();

    console.log(
      `Successfully wrapped ETH to WETH. New balance: ${ethers.utils.formatUnits(
        await wethContract.balanceOf(signerAddress),
        decimals
      )} WETH`
    );
  } else {
    console.log(
      `WETH balance is sufficient: ${ethers.utils.formatUnits(currentBalance, decimals)} WETH`
    );
  }
} 