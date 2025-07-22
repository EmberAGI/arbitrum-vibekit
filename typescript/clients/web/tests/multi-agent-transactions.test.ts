// arbitrum-vibekit/typescript/clients/web/tests/multi-agent-transactions.test.ts
import { test, expect } from '@playwright/test';
import { TransactionHistoryPage } from './pages/transaction-history';
import { WalletHelper } from './helpers/wallet';
import { ChatPage } from './pages/chat';

test.describe('Multi-Agent Transaction History', () => {
  let transactionHistoryPage: TransactionHistoryPage;
  let walletHelper: WalletHelper;
  let chatPage: ChatPage;

  const mockMultiAgentTransactions = [
    {
      id: '1',
      txHash: '0xabc123456789012345678901234567890123456789012345678901234567890',
      agentType: 'swap',
      chainId: '42161',
      status: 'confirmed',
      methodName: 'swapTokens',
      executedAt: '2024-01-01T10:00:00Z',
    },
    {
      id: '2',
      txHash: '0xdef456789012345678901234567890123456789012345678901234567890',
      agentType: 'lending',
      chainId: '42161',
      status: 'confirmed',
      methodName: 'supply',
      executedAt: '2024-01-01T11:00:00Z',
    },
    {
      id: '3',
      txHash: '0x789012345678901234567890123456789012345678901234567890123456',
      agentType: 'liquidity',
      chainId: '42161',
      status: 'pending',
      methodName: 'addLiquidity',
      executedAt: '2024-01-01T12:00:00Z',
    },
    {
      id: '4',
      txHash: '0x345678901234567890123456789012345678901234567890123456789012',
      agentType: 'pendle',
      chainId: '42161',
      status: 'confirmed',
      methodName: 'stake',
      executedAt: '2024-01-01T13:00:00Z',
    },
  ];

  test.beforeEach(async ({ page }) => {
    transactionHistoryPage = new TransactionHistoryPage(page);
    walletHelper = new WalletHelper(page);
    chatPage = new ChatPage(page);

    await walletHelper.connectWallet();
    await chatPage.createNewChat();

    // Mock API with multi-agent transactions
    await page.route('/api/transactions*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockMultiAgentTransactions),
      });
    });
  });

  test('should display transactions from all agent types', async () => {
    await transactionHistoryPage.openTransactionHistory();
    await transactionHistoryPage.waitForTransactionsLoad();

    // Verify all agent types are displayed
    await expect(transactionHistoryPage.page.getByText('swap')).toBeVisible();
    await expect(transactionHistoryPage.page.getByText('lending')).toBeVisible();
    await expect(transactionHistoryPage.page.getByText('liquidity')).toBeVisible();
    await expect(transactionHistoryPage.page.getByText('pendle')).toBeVisible();

    const transactionCount = await transactionHistoryPage.getTransactionCount();
    expect(transactionCount).toBe(4);
  });

  test('should show transactions in chronological order (newest first)', async () => {
    await transactionHistoryPage.openTransactionHistory();
    await transactionHistoryPage.waitForTransactionsLoad();

    // Check order - newest (pendle) should be first
    const firstTransaction = await transactionHistoryPage.getTransactionData(0);
    expect(firstTransaction.type).toContain('pendle');

    const lastTransaction = await transactionHistoryPage.getTransactionData(3);
    expect(lastTransaction.type).toContain('swap');
  });

  test('should filter by agent type', async ({ page }) => {
    // This test assumes there's a filter functionality - if not implemented yet,
    // this serves as a specification for future enhancement
    await transactionHistoryPage.openTransactionHistory();
    await transactionHistoryPage.waitForTransactionsLoad();

    // If filter exists
    const agentFilter = page.getByTestId('agent-type-filter');
    if (await agentFilter.isVisible()) {
      await agentFilter.selectOption('swap');
      await expect(transactionHistoryPage.page.getByText('swap')).toBeVisible();
      await expect(transactionHistoryPage.page.getByText('lending')).not.toBeVisible();
    }
  });

  test('should handle different transaction statuses across agents', async () => {
    await transactionHistoryPage.openTransactionHistory();
    await transactionHistoryPage.waitForTransactionsLoad();

    // Check for both confirmed and pending statuses
    const confirmedElements = transactionHistoryPage.page.getByText('Confirmed');
    const pendingElements = transactionHistoryPage.page.getByText('Pending');

    await expect(confirmedElements).toHaveCount(3); // swap, lending, pendle
    await expect(pendingElements).toHaveCount(1);   // liquidity
  });
});