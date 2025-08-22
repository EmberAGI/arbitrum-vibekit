// arbitrum-vibekit/typescript/clients/web/tests/auth-wallet-improved.setup.ts
import path from 'node:path';
import { test as setup } from '@playwright/test';

const authFile = path.join(__dirname, '../playwright/.auth/session.json');

setup('authenticate with improved wallet mock', async ({ page }) => {
  console.log('🔗 Setting up improved wallet authentication...');

  // Intercept and mock all authentication-related network requests
  await page.route('**/api/auth/**', async (route) => {
    const url = route.request().url();
    console.log('🔧 Intercepted auth request:', url);
    if (url.includes('session')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'mock-user-id',
            address: '0x1234567890123456789012345678901234567890',
          },
          expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }),
      });
    } else {
      await route.continue();
    }
  });

  // Mock window.ethereum
  await page.addInitScript(() => {
    (window as any).ethereum = {
      isMetaMask: true,
      isConnected: () => true,
      selectedAddress: '0x1234567890123456789012345678901234567890',
      chainId: '0xa4b1',
      request: async ({ method }: any) => {
        switch (method) {
          case 'eth_requestAccounts':
          case 'eth_accounts':
            return ['0x1234567890123456789012345678901234567890'];
          case 'eth_chainId':
            return '0xa4b1';
          case 'personal_sign':
            return '0xmocksignature123456789';
          default:
            return null;
        }
      },
      on: () => {},
      removeListener: () => {},
    };
  });

  // Mock chat API response
  await page.route('**/api/chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        messages: [
          { id: '1', content: 'Mocked response from the assistant' },
        ],
      }),
    });
  });

  // Navigate to the page
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Check if wallet overlay is visible
  const walletOverlay = page.getByText('Connect Your Wallet');
  const isOverlayVisible = await walletOverlay.isVisible().catch(() => false);

  console.log('📊 Wallet overlay visible:', isOverlayVisible);

  if (isOverlayVisible) {
    console.log('❌ Authentication mock failed');

    // Attempt to interact with the page to trigger authentication
    const connectButton = page.locator('button').filter({ hasText: /connect/i }).first();
    if (await connectButton.isVisible()) {
      console.log('🔧 Attempting to click connect button...');
      await connectButton.click();
      await page.waitForTimeout(2000);

      // Check if overlay is gone
      const isStillVisible = await walletOverlay.isVisible().catch(() => false);
      console.log('📊 Overlay still visible after click:', isStillVisible);
    }
  } else {
    console.log('✅ Authentication mock successful');
  }

  // Save storage state for authenticated session
  await page.context().storageState({ path: authFile });
});

