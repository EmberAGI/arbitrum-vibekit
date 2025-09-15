// arbitrum-vibekit/typescript/clients/web/tests/pages/transaction-history.ts
import { expect, type Page } from '@playwright/test';

export class TransactionHistoryPage {
  constructor(public page: Page) {}

  // Selectors
  public get historyButton() {
    return this.page.getByTestId('transaction-history-button');
  }

  public get historyModal() {
    return this.page.getByTestId('transaction-history-modal');
  }

  public get closeButton() {
    return this.page.getByTestId('transaction-history-close');
  }

  public get loadingIndicator() {
    return this.page.getByText('Loading transactions...');
  }

  public get errorMessage() {
    return this.page.getByText('Failed to load transaction history');
  }

  public get emptyState() {
    return this.page.getByText('No transactions found');
  }

  public get transactionTable() {
    return this.page.getByTestId('transaction-table');
  }

  public get transactionRows() {
    return this.page.getByTestId('transaction-row');
  }

  // Actions
  async openTransactionHistory() {
    await this.historyButton.click();
    await expect(this.historyModal).toBeVisible();
  }

  async closeTransactionHistory() {
    await this.closeButton.click();
    await expect(this.historyModal).not.toBeVisible();
  }

  async waitForTransactionsLoad() {
    const response = await this.page.waitForResponse((response) =>
      response.url().includes('/api/transactions')
    );
    await response.finished();
  }

  // Getters
  async getTransactionCount(): Promise<number> {
    await expect(this.transactionTable).toBeVisible();
    return await this.transactionRows.count();
  }

  async getTransactionData(index: number) {
    const row = this.transactionRows.nth(index);
    await expect(row).toBeVisible();

    return {
      hash: await row.getByTestId('tx-hash').textContent(),
      type: await row.getByTestId('agent-type').textContent(),
      chain: await row.getByTestId('chain-name').textContent(),
      status: await row.getByTestId('tx-status').textContent(),
      date: await row.getByTestId('tx-date').textContent(),
    };
  }

  async getExplorerLink(index: number): Promise<string | null> {
    const row = this.transactionRows.nth(index);
    const link = row.getByTestId('explorer-link');
    return await link.getAttribute('href');
  }

  // Assertions
  async expectTransactionVisible(txHash: string) {
    const truncatedHash = `${txHash.slice(0, 6)}...${txHash.slice(-4)}`;
    await expect(this.page.getByText(truncatedHash)).toBeVisible();
  }

  async expectChainExplorerUrl(chainId: string, txHash: string) {
    const expectedUrls: Record<string, string> = {
      '42161': `https://arbiscan.io/tx/${txHash}`,
      '1': `https://etherscan.io/tx/${txHash}`,
      '137': `https://polygonscan.com/tx/${txHash}`,
    };

    const explorerLink = this.page.getByTestId('explorer-link').first();
    await expect(explorerLink).toHaveAttribute('href', expectedUrls[chainId]);
  }

  async expectStatusIcon(status: string) {
    const statusElement = this.page.getByTestId('tx-status');
    await expect(statusElement).toContainText(status);
    
    // Check for appropriate status icon
    if (status === 'confirmed') {
      await expect(statusElement.locator('[data-icon="check-circle"]')).toBeVisible();
    } else if (status === 'pending') {
      await expect(statusElement.locator('[data-icon="clock"]')).toBeVisible();
    }
  }
}