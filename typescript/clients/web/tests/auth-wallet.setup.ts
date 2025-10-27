import path from 'node:path';
import { test as setup } from '@playwright/test';

const authFile = path.join(__dirname, '../playwright/.auth/session.json');

setup('authenticate with improved wallet mock', async ({ page }) => {
  console.log('🔗 Setting up improved wallet authentication...');

  // Step 1: Intercept and mock all authentication-related network requests
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
    } else if (url.includes('callback')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    } else {
      await route.continue();
    }
  });

  // Step 2: Mock window.ethereum and related functionality
  await page.addInitScript(() => {
    // Mock MetaMask's window.ethereum object
    (window as any).ethereum = {
      isMetaMask: true,
      isConnected: () => true,
      selectedAddress: '0x1234567890123456789012345678901234567890',
      chainId: '0xa4b1', // Example: Arbitrum One chain ID
      request: async ({ method, params: _params }: any) => {
        switch (method) {
          case 'eth_requestAccounts':
          case 'eth_accounts':
            return ['0x1234567890123456789012345678901234567890'];
          case 'eth_chainId':
            return '0xa4b1';
          case 'personal_sign':
            return '0xmocksignature123456789'; // Mock signature
          case 'eth_signTypedData_v4': // SIWE often uses this
            return '0xmocksignature123456789';
          default:
            throw new Error(`Method not mocked: ${method}`);
        }
      },
      on: () => {},
      removeListener: () => {},
    };

    // Mock fetch for session requests
    const originalFetch = window.fetch;
    window.fetch = async (url: any, options?: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/session')) {
        console.log('🔧 Mocking session fetch');
        return new Response(
          JSON.stringify({
            user: {
              id: 'mock-user-id',
              address: '0x1234567890123456789012345678901234567890',
            },
            expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
      return originalFetch(url, options);
    };

    // Step 3: Set up localStorage (e.g., for wagmi or similar libraries)
    localStorage.setItem(
      'wagmi.store',
      JSON.stringify({
        state: {
          chainId: 42161, // Arbitrum One
          connections: new Map([
            [
              'injected',
              {
                accounts: ['0x1234567890123456789012345678901234567890'],
                chainId: 42161,
              },
            ],
          ]),
          current: 'injected',
          status: 'connected',
        },
        version: 2,
      }),
    );

    // Set cookies for session persistence
    document.cookie =
      'next-auth.session-token=mock-token; path=/; max-age=86400';

    console.log('✅ Improved wallet mocks initialized');
  });

  // Navigate to the page
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000); // Allow time for the app to process

  // Step 4: Verify authentication
  const walletOverlay = page.getByText('Connect Your Wallet');
  const isOverlayVisible = await walletOverlay.isVisible().catch(() => false);
  console.log('📊 Wallet overlay visible:', isOverlayVisible);

  if (isOverlayVisible) {
    console.log('❌ Authentication mock failed');
    const connectButton = page
      .locator('button')
      .filter({ hasText: /connect/i })
      .first();
    if (await connectButton.isVisible()) {
      console.log('🔧 Attempting to click connect button...');
      await connectButton.click();
      await page.waitForTimeout(2000);
      const isStillVisible = await walletOverlay.isVisible().catch(() => false);
      console.log('📊 Overlay still visible after click:', isStillVisible);
    }
  } else {
    console.log('✅ Authentication mock successful');
  }

  // Save the session state for reuse in tests
  await page.context().storageState({ path: authFile });
  await page.screenshot({ path: 'debug-improved-auth.png', fullPage: true });
});
