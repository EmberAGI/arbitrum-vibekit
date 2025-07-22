// arbitrum-vibekit/typescript/clients/web/tests/transaction-history.test.ts
import { test, expect } from '@playwright/test';
import { TransactionHistoryPage } from './pages/transaction-history';
import { WalletHelper } from './helpers/wallet';
import { ChatPage } from './pages/chat';

test.describe('Transaction History', () => {
  let transactionHistoryPage: TransactionHistoryPage;
  let walletHelper: WalletHelper;
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    transactionHistoryPage = new TransactionHistoryPage(page);
    walletHelper = new WalletHelper(page);
    chatPage = new ChatPage(page);

    // Connect wallet before each test
    await walletHelper.connectWallet();
    await chatPage.createNewChat();
  });

  test.describe('UI Components', () => {
    test('should display transaction history button when wallet connected', async () => {
      await expect(transactionHistoryPage.historyButton).toBeVisible();
    });

    test('should hide transaction history button when wallet disconnected', async ({ page }) => {
      await walletHelper.disconnectWallet();
      await page.reload();
      await expect(transactionHistoryPage.historyButton).not.toBeVisible();
    });

    test('should open and close transaction history modal', async () => {
      await transactionHistoryPage.openTransactionHistory();
      await expect(transactionHistoryPage.historyModal).toBeVisible();

      await transactionHistoryPage.closeTransactionHistory();
      await expect(transactionHistoryPage.historyModal).not.toBeVisible();
    });
  });

  test.describe('Data Loading', () => {
    test('should show loading state while fetching transactions', async ({ page }) => {
      // Delay the API response to see loading state
      await page.route('/api/transactions*', async (route) => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await transactionHistoryPage.openTransactionHistory();
      await expect(transactionHistoryPage.loadingIndicator).toBeVisible();
    });

    test('should show empty state when no transactions exist', async ({ page }) => {
      await page.route('/api/transactions*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await transactionHistoryPage.openTransactionHistory();
      await transactionHistoryPage.waitForTransactionsLoad();
      await expect(transactionHistoryPage.emptyState).toBeVisible();
    });

    test('should show error state when API fails', async ({ page }) => {
      await page.route('/api/transactions*', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });

      await transactionHistoryPage.openTransactionHistory();
      await transactionHistoryPage.waitForTransactionsLoad();
      await expect(transactionHistoryPage.errorMessage).toBeVisible();
    });
  });

  test.describe('Transaction Display', () => {
    const mockTransactions = [
      {
        id: '1',
        txHash: '0xabc123456789012345678901234567890123456789012345678901234567890',
        userAddress: '0x1234567890123456789012345678901234567890',
        agentType: 'swap',
        chainId: '42161',
        status: 'confirmed',
        methodName: 'swapTokens',
        value: '1000000000000000000',
        contractAddress: '0x1234567890123456789012345678901234567890',
        executedAt: '2024-01-01T10:00:00Z',
      },
      {
        id: '2',
        txHash: '0xdef456789012345678901234567890123456789012345678901234567890',
        userAddress: '0x1234567890123456789012345678901234567890',
        agentType: 'lending',
        chainId: '1',
        status: 'pending',
        methodName: 'deposit',
        value: '2000000000000000000',
        contractAddress: '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9',
        executedAt: '2024-01-02T15:30:00Z',
      },
    ];

    test.beforeEach(async ({ page }) => {
      await page.route('/api/transactions*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockTransactions),
        });
      });
    });

    test('should display transaction data correctly', async () => {
      await transactionHistoryPage.openTransactionHistory();
      await transactionHistoryPage.waitForTransactionsLoad();

      const transactionCount = await transactionHistoryPage.getTransactionCount();
      expect(transactionCount).toBe(2);

      // Check first transaction
      await transactionHistoryPage.expectTransactionVisible(mockTransactions[0].txHash);
      await expect(transactionHistoryPage.page.getByText('swap')).toBeVisible();
      await expect(transactionHistoryPage.page.getByText('Arbitrum One')).toBeVisible();
      await expect(transactionHistoryPage.page.getByText('Confirmed')).toBeVisible();

      // Check second transaction
      await transactionHistoryPage.expectTransactionVisible(mockTransactions[1].txHash);
      await expect(transactionHistoryPage.page.getByText('lending')).toBeVisible();
      await expect(transactionHistoryPage.page.getByText('Ethereum')).toBeVisible();
      await expect(transactionHistoryPage.page.getByText('Pending')).toBeVisible();
    });

    test('should truncate transaction hashes correctly', async () => {
      await transactionHistoryPage.openTransactionHistory();
      await transactionHistoryPage.waitForTransactionsLoad();

      // Check hash truncation: 0xabc123...7890
      await expect(transactionHistoryPage.page.getByText('0xabc1...7890')).toBeVisible();
      await expect(transactionHistoryPage.page.getByText('0xdef4...7890')).toBeVisible();
    });

    test('should generate correct explorer links', async () => {
      await transactionHistoryPage.openTransactionHistory();
      await transactionHistoryPage.waitForTransactionsLoad();

      // Check Arbitrum explorer link
      await transactionHistoryPage.expectChainExplorerUrl('42161', mockTransactions[0].txHash);
      
      // Check Ethereum explorer link  
      await transactionHistoryPage.expectChainExplorerUrl('1', mockTransactions[1].txHash);
    });

    test('should show correct status icons', async () => {
      await transactionHistoryPage.openTransactionHistory();
      await transactionHistoryPage.waitForTransactionsLoad();

      await transactionHistoryPage.expectStatusIcon('confirmed');
      await transactionHistoryPage.expectStatusIcon('pending');
    });

    test('should format dates correctly', async () => {
      await transactionHistoryPage.openTransactionHistory();
      await transactionHistoryPage.waitForTransactionsLoad();

      await expect(transactionHistoryPage.page.getByText('Jan 1, 2024, 10:00 AM')).toBeVisible();
      await expect(transactionHistoryPage.page.getByText('Jan 2, 2024, 3:30 PM')).toBeVisible();
    });

    test('should open explorer links in new tab', async () => {
      await transactionHistoryPage.openTransactionHistory();
      await transactionHistoryPage.waitForTransactionsLoad();

      const explorerLink = transactionHistoryPage.page.getByTestId('explorer-link').first();
      await expect(explorerLink).toHaveAttribute('target', '_blank');
      await expect(explorerLink).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  test.describe('Real-time Updates', () => {
    test('should fetch transactions when modal opens', async ({ page }) => {
      let apiCallCount = 0;
      await page.route('/api/transactions*', async (route) => {
        apiCallCount++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      // API should not be called initially
      expect(apiCallCount).toBe(0);

      await transactionHistoryPage.openTransactionHistory();
      await transactionHistoryPage.waitForTransactionsLoad();

      // API should be called when modal opens
      expect(apiCallCount).toBe(1);
    });

    test('should pass correct user address in API request', async ({ page }) => {
      const userAddress = '0x1234567890123456789012345678901234567890';
      let capturedUrl = '';

      await page.route('/api/transactions*', async (route) => {
        capturedUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await transactionHistoryPage.openTransactionHistory();
      await transactionHistoryPage.waitForTransactionsLoad();

      expect(capturedUrl).toContain(`userAddress=${userAddress}`);
    });
  });

  test.describe('Error Handling', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      await page.route('/api/transactions*', async (route) => {
        await route.abort('failed');
      });

      await transactionHistoryPage.openTransactionHistory();
      await expect(transactionHistoryPage.errorMessage).toBeVisible();
    });

    test('should handle malformed API responses', async ({ page }) => {
      await page.route('/api/transactions*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: 'invalid json',
        });
      });

      await transactionHistoryPage.openTransactionHistory();
      await expect(transactionHistoryPage.errorMessage).toBeVisible();
    });

    test('should handle missing user address gracefully', async ({ page }) => {
      await walletHelper.disconnectWallet();
      await page.reload();

      // Transaction history button should not be visible when wallet disconnected
      await expect(transactionHistoryPage.historyButton).not.toBeVisible();
    });
  });
});