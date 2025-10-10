import { ethers, type PopulatedTransaction } from 'ethers';
import { BEEFY_VAULT_ABI, GAS_LIMITS } from './abis.js';
import { createERC20Contract } from './erc20.js';

/**
 * Simplified Beefy Vault Contract based on official Beefy documentation
 * Focuses only on the core vault operations: deposit, withdraw, depositAll, withdrawAll
 */
export class BeefyVaultContract {
  private contract: ethers.Contract;
  private provider: ethers.providers.Provider;

  constructor(vaultAddress: string, provider: ethers.providers.Provider) {
    this.provider = provider;
    this.contract = new ethers.Contract(vaultAddress, BEEFY_VAULT_ABI, provider);
  }

  // ===== VIEW FUNCTIONS (from Beefy docs) =====

  /**
   * Returns the address of the underlying farm token (want token)
   */
  async want(): Promise<string> {
    return await this.contract.want();
  }

  /**
   * Returns the amount of "want" stored in vault and strategy
   * Note: Contract returns 'uint' which maps to BigNumber in ethers
   */
  async balance(): Promise<ethers.BigNumber> {
    return await this.contract.balance();
  }

  /**
   * Returns the amount of "want" stored in the vault alone
   */
  async available(): Promise<ethers.BigNumber> {
    return await this.contract.available();
  }

  /**
   * Returns the total amount of mooTokens minted (always 18 decimals)
   */
  async totalSupply(): Promise<ethers.BigNumber> {
    return await this.contract.totalSupply();
  }

  /**
   * Returns current price per share (per mooToken) in "want" tokens
   * Calculated as: balance() / totalSupply()
   */
  async getPricePerFullShare(): Promise<ethers.BigNumber> {
    return await this.contract.getPricePerFullShare();
  }

  /**
   * Returns the current underlying strategy contract address
   */
  async strategy(): Promise<string> {
    return await this.contract.strategy();
  }

  /**
   * Returns user's mooToken balance
   */
  async balanceOf(userAddress: string): Promise<ethers.BigNumber> {
    return await this.contract.balanceOf(userAddress);
  }

  // ===== WRITE FUNCTIONS (from Beefy docs) =====

  /**
   * Create deposit transaction - deposits specified amount of "want" tokens
   * Mints proportional mooTokens to depositor
   */
  async createDepositTransaction(
    amount: ethers.BigNumber,
    from: string
  ): Promise<PopulatedTransaction> {
    const tx = await this.contract.populateTransaction.deposit!(amount);
    return {
      ...tx,
      from,
      gasLimit: ethers.BigNumber.from(GAS_LIMITS.VAULT_DEPOSIT),
    };
  }

  /**
   * Create depositAll transaction - deposits entire "want" token balance
   */
  async createDepositAllTransaction(from: string): Promise<PopulatedTransaction> {
    const tx = await this.contract.populateTransaction.depositAll!();
    return {
      ...tx,
      from,
      gasLimit: ethers.BigNumber.from(GAS_LIMITS.VAULT_DEPOSIT_ALL),
    };
  }

  /**
   * Create withdraw transaction - burns specified mooTokens
   * Returns proportional "want" tokens to user
   */
  async createWithdrawTransaction(
    shares: ethers.BigNumber,
    from: string
  ): Promise<PopulatedTransaction> {
    const tx = await this.contract.populateTransaction.withdraw!(shares);
    return {
      ...tx,
      from,
      gasLimit: ethers.BigNumber.from(GAS_LIMITS.VAULT_WITHDRAW),
    };
  }

  /**
   * Create withdrawAll transaction - burns all user's mooTokens
   */
  async createWithdrawAllTransaction(from: string): Promise<PopulatedTransaction> {
    const tx = await this.contract.populateTransaction.withdrawAll!();
    return {
      ...tx,
      from,
      gasLimit: ethers.BigNumber.from(GAS_LIMITS.VAULT_WITHDRAW_ALL),
    };
  }

  // ===== HELPER FUNCTIONS =====

  /**
   * Check if user needs approval before deposit
   */
  async needsApprovalForDeposit(
    userAddress: string,
    depositAmount: ethers.BigNumber
  ): Promise<boolean> {
    const wantTokenAddress = await this.want();
    const tokenContract = createERC20Contract(wantTokenAddress, this.provider);
    return tokenContract.needsApproval(userAddress, this.contract.address, depositAmount);
  }

  /**
   * Create approval transaction for deposit if needed
   */
  async createApprovalForDeposit(
    userAddress: string,
    depositAmount: ethers.BigNumber
  ): Promise<PopulatedTransaction | null> {
    const wantTokenAddress = await this.want();
    const tokenContract = createERC20Contract(wantTokenAddress, this.provider);
    return tokenContract.createApprovalIfNeeded(userAddress, this.contract.address, depositAmount);
  }

  /**
   * Calculate how much "want" tokens user would receive for withdrawing shares
   */
  async calculateWithdrawAmount(shares: ethers.BigNumber): Promise<ethers.BigNumber> {
    const [totalSupply, totalBalance] = await Promise.all([this.totalSupply(), this.balance()]);

    if (totalSupply.eq(0)) {
      return ethers.BigNumber.from(0);
    }

    // From Beefy docs: r = (balance() * _shares) / totalSupply()
    return totalBalance.mul(shares).div(totalSupply);
  }

  /**
   * Calculate how many mooTokens would be minted for a deposit
   */
  async calculateDepositShares(depositAmount: ethers.BigNumber): Promise<ethers.BigNumber> {
    const [totalSupply, totalBalance] = await Promise.all([this.totalSupply(), this.balance()]);

    if (totalSupply.eq(0)) {
      // From Beefy docs: if totalSupply == 0, shares = _amount
      return depositAmount;
    }

    // From Beefy docs: shares = (_amount * totalSupply()) / _pool
    return depositAmount.mul(totalSupply).div(totalBalance);
  }
}

/**
 * Create Beefy vault contract instance
 */
export function createBeefyVaultContract(
  vaultAddress: string,
  provider: ethers.providers.Provider
): BeefyVaultContract {
  return new BeefyVaultContract(vaultAddress, provider);
}
