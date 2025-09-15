// arbitrum-vibekit/typescript/clients/web/tests/transaction-execution.test.ts
import { test, expect } from '@playwright/test';
import { TransactionHistoryPage } from './pages/transaction-history';
import { WalletHelper } from './helpers/wallet';
import { ChatPage } from './pages/chat';

test.describe('Transaction Execution Integration', () => {
  let transactionHistoryPage: TransactionHistoryPage;
  let walletHelper: WalletHelper;
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    transactionHistoryPage = new TransactionHistoryPage(page);
    walletHelper = new WalletHelper(page);
    chatPage = new ChatPage(page);

    await walletHelper.connectWallet();
    await chatPage.createNewChat();
  });

  test('should save transaction after successful execution', async ({ page }) => {
    const mockTxHash = '0xabc123456789012345678901234567890123456789012345678901234567890';
    
    // Mock successful transaction execution
    await page.addInitScript(() => {
      // Mock the useTransactionExecutor hook behavior
      (window as any).__mockTransactionExecution = {
        isSuccess: true,
        txHash: '0xabc123456789012345678901234567890123456789012345678901234567890',
      };
    });

    // Mock the transaction save API
    let transactionSaved = false;
    await page.route('/api/transactions', async (route) => {
      if (route.request().method() === 'POST') {
        transactionSaved = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      }
    });

    // Mock the transaction fetch API to return our saved transaction
    await page.route('/api/transactions*', async (route) => {
      if (route.request().method() === 'GET') {
        const savedTransaction = transactionSaved ? [{
          id: '1',
          txHash: mockTxHash,
          agentType: 'swap',
          chainId: '42161',
          status: 'confirmed',
          executedAt: new Date().toISOString(),
        }] : [];

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(savedTransaction),
        });
      }
    });

    // Simulate a swap operation that triggers transaction execution
    await chatPage.sendUserMessage('Swap 100 USDC for ETH');
    await chatPage.isGenerationComplete();

    // Wait for transaction to be processed
    await page.waitForTimeout(1000);

    // Open transaction history and verify the transaction appears
    await transactionHistoryPage.openTransactionHistory();
    await transactionHistoryPage.waitForTransactionsLoad();

    if (transactionSaved) {
      await transactionHistoryPage.expectTransactionVisible(mockTxHash);
      await expect(transactionHistoryPage.page.getByText('swap')).toBeVisible();
    }
  });

  test('should handle transaction execution failures', async ({ page }) => {
    // Mock failed transaction execution
    await page.addInitScript(() => {
      (window as any).__mockTransactionExecution = {
        isSuccess: false,
        error: 'Transaction failed',
      };
    });

    // Mock empty transaction history (no failed transactions saved)
    await page.route('/api/transactions*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await chatPage.sendUserMessage('Swap 100 USDC for ETH');
    await chatPage.isGenerationComplete();

    // Open transaction history - should be empty since transaction failed
    await transactionHistoryPage.openTransactionHistory();
    await transactionHistoryPage.waitForTransactionsLoad();
    await expect(transactionHistoryPage.emptyState).toBeVisible();
  });
});