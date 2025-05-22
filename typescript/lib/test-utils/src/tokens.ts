/**
 * Token utilities for testing
 */
import * as ethers from 'ethers';
import { Contract, providers, BigNumber } from 'ethers';
import { type Address } from 'viem';

/**
 * Mint USDC tokens to a user address using Anvil's storage manipulation
 */
export async function mintUSDC({
  provider,
  tokenAddress,
  userAddress,
  balanceStr,
}: {
  provider: ethers.providers.JsonRpcProvider;
  tokenAddress: string;
  userAddress: string | Address;
  balanceStr: string;
}): Promise<void> {
  const newBalance = ethers.BigNumber.from(balanceStr);
  // For USDC, the balance mapping is known to be stored at slot 9.
  const mappingSlot = 9;

  // Calculate the storage slot for the given user.
  // The storage slot for a mapping is computed as keccak256(abi.encode(key, mappingSlot))
  const storageSlot = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["address", "uint256"],
      [userAddress, mappingSlot],
    ),
  );

  // Prepare the new balance as a 32-byte hex string.
  const newBalanceHex = ethers.utils.hexZeroPad(newBalance.toHexString(), 32);
  // Use Anvil's cheatcode to set storage.
  await provider.send("anvil_setStorageAt", [
    tokenAddress,
    storageSlot,
    newBalanceHex,
  ]);
  await provider.send("evm_mine", []);
}

// ABI for ERC20 token
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
];

/**
 * Wrapper class for ERC20 tokens with convenient methods
 */
export class ERC20Wrapper {
  provider: providers.Provider;
  contract: Contract;

  /**
   * Constructs a new ERC20Wrapper instance.
   * @param provider - An ethers.js provider.
   * @param contractAddress - The ERC20 contract address.
   */
  constructor(provider: providers.Provider, contractAddress: string) {
    this.provider = provider;
    this.contract = new Contract(
      contractAddress,
      ERC20_ABI,
      provider,
    );
  }

  /**
   * Returns the token name.
   */
  async name(): Promise<string> {
    return await this.contract.name();
  }

  /**
   * Returns the token symbol.
   */
  async symbol(): Promise<string> {
    return await this.contract.symbol();
  }

  /**
   * Returns the token decimals.
   */
  async decimals(): Promise<number> {
    return await this.contract.decimals();
  }

  /**
   * Returns the total token supply.
   */
  async totalSupply(): Promise<BigNumber> {
    return await this.contract.totalSupply();
  }

  /**
   * Returns the token balance of a given address.
   * @param owner - The address to check.
   */
  async balanceOf(owner: string | Address): Promise<BigNumber> {
    return await this.contract.balanceOf(owner);
  }

  /**
   * Transfers tokens to a specified address.
   * Note: This function requires a signer.
   * @param signer - An ethers.js Signer instance.
   * @param to - The recipient address.
   * @param amount - The amount to transfer (in the token's smallest unit).
   */
  async transfer(
    signer: ethers.Signer,
    to: string | Address,
    amount: BigNumber,
  ): Promise<ethers.ContractTransaction> {
    const contractWithSigner = this.contract.connect(signer);
    return await contractWithSigner.transfer(to, amount);
  }
} 