// arbitrum-vibekit/typescript/clients/web/tests/helpers/wallet.ts
import type { Page } from '@playwright/test';

export class WalletHelper {
  constructor(private page: Page) {}

  async connectWallet(address = '0x1234567890123456789012345678901234567890') {
    // Mock wallet connection - this would typically involve connecting to a test wallet
    // For testing purposes, we'll mock the wallet state
    await this.page.addInitScript((mockAddress) => {
      // Mock wagmi useAccount hook
      (window as any).__mockWallet = {
        address: mockAddress,
        isConnected: true,
        chainId: 42161,
      };
    }, address);
  }

  async disconnectWallet() {
    await this.page.addInitScript(() => {
      (window as any).__mockWallet = {
        address: undefined,
        isConnected: false,
        chainId: undefined,
      };
    });
  }

  async switchChain(chainId: number) {
    await this.page.addInitScript((newChainId) => {
      if ((window as any).__mockWallet) {
        (window as any).__mockWallet.chainId = newChainId;
      }
    }, chainId);
  }
}