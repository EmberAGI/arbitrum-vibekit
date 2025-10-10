import { ethers, type PopulatedTransaction } from 'ethers';
import { ERC20_ABI, GAS_LIMITS } from './abis.js';

export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
}

export class ERC20Contract {
  private contract: ethers.Contract;
  private provider: ethers.providers.Provider;

  constructor(tokenAddress: string, provider: ethers.providers.Provider) {
    this.provider = provider;
    this.contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  }

  /**
   * Get token information (name, symbol, decimals)
   */
  async getTokenInfo(): Promise<TokenInfo> {
    const [name, symbol, decimals] = await Promise.all([
      this.contract.name(),
      this.contract.symbol(),
      this.contract.decimals(),
    ]);

    return {
      address: this.contract.address,
      name,
      symbol,
      decimals,
    };
  }

  /**
   * Get token balance for an address
   */
  async balanceOf(address: string): Promise<ethers.BigNumber> {
    return await this.contract.balanceOf(address);
  }

  /**
   * Get allowance for spender
   */
  async allowance(owner: string, spender: string): Promise<ethers.BigNumber> {
    return await this.contract.allowance(owner, spender);
  }

  /**
   * Get total supply of the token
   */
  async totalSupply(): Promise<ethers.BigNumber> {
    return await this.contract.totalSupply();
  }

  /**
   * Check if approval is needed for a specific amount
   */
  async needsApproval(owner: string, spender: string, amount: ethers.BigNumber): Promise<boolean> {
    const currentAllowance = await this.allowance(owner, spender);
    return currentAllowance.lt(amount);
  }

  /**
   * Create an approval transaction
   */
  async createApprovalTransaction(
    spender: string,
    amount: ethers.BigNumber,
    from: string
  ): Promise<PopulatedTransaction> {
    const tx = await this.contract.populateTransaction.approve!(spender, amount);

    return {
      ...tx,
      from,
      gasLimit: ethers.BigNumber.from(GAS_LIMITS.ERC20_APPROVE),
    };
  }

  /**
   * Create approval transaction if needed
   */
  async createApprovalIfNeeded(
    owner: string,
    spender: string,
    amount: ethers.BigNumber
  ): Promise<PopulatedTransaction | null> {
    const needsApproval = await this.needsApproval(owner, spender, amount);

    if (!needsApproval) {
      return null;
    }

    return this.createApprovalTransaction(spender, amount, owner);
  }

  /**
   * Format token amount with proper decimals
   */
  async formatAmount(amount: ethers.BigNumber): Promise<string> {
    const decimals = await this.contract.decimals();
    return ethers.utils.formatUnits(amount, decimals);
  }

  /**
   * Parse token amount from string with proper decimals
   */
  async parseAmount(amount: string): Promise<ethers.BigNumber> {
    const decimals = await this.contract.decimals();
    return ethers.utils.parseUnits(amount, decimals);
  }
}

/**
 * Utility function to create ERC20 contract instance
 */
export function createERC20Contract(
  tokenAddress: string,
  provider: ethers.providers.Provider
): ERC20Contract {
  return new ERC20Contract(tokenAddress, provider);
}

/**
 * Utility function to get token info for multiple tokens
 */
export async function getMultipleTokenInfo(
  tokenAddresses: string[],
  provider: ethers.providers.Provider
): Promise<TokenInfo[]> {
  const promises = tokenAddresses.map(async address => {
    const contract = new ERC20Contract(address, provider);
    return contract.getTokenInfo();
  });

  return Promise.all(promises);
}
