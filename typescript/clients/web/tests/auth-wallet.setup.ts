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

  // Mock at the deepest level - before any React components load
  await page.addInitScript(() => {
    // Mock window.ethereum
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

    // Override fetch to mock session requests
    const originalFetch = window.fetch;
    window.fetch = async (url: any, options?: any) => {
      if (typeof url === 'string' && url.includes('/api/auth/session')) {
        console.log('🔧 Mocking session fetch');
        return new Response(JSON.stringify({
          user: {
            id: 'mock-user-id',
            address: '0x1234567890123456789012345678901234567890',
          },
          expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(url, options);
    };

    // Set up localStorage
    localStorage.setItem('wagmi.store', JSON.stringify({
      state: {
        chainId: 42161,
        connections: new Map([['injected', {
          accounts: ['0x1234567890123456789012345678901234567890'],
          chainId: 42161,
        }]]),
        current: 'injected',
        status: 'connected'
      },
      version: 2
    }));

    // Set cookies
    document.cookie = 'next-auth.session-token=mock-token; path=/; max-age=86400';

    console.log('✅ Improved wallet mocks initialized');
  });

  // Navigate to page
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);

  // Check authentication
  const walletOverlay = page.getByText('Connect Your Wallet');
  const isOverlayVisible = await walletOverlay.isVisible().catch(() => false);
  
  console.log('📊 Wallet overlay visible:', isOverlayVisible);

  if (isOverlayVisible) {
    console.log('❌ Authentication mock failed');
    
    // Try to interact with the page to trigger authentication
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

  await page.screenshot({ path: 'debug-improved-auth.png', fullPage: true });
  await page.context().storageState({ path: authFile });
  
});

