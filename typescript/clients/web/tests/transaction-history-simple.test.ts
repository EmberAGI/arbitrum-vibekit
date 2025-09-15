// arbitrum-vibekit/typescript/clients/web/tests/transaction-history-simple.test.ts
import { test, expect } from '@playwright/test';

// Run without any authentication
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Transaction History - Simple Tests', () => {
  
  test('should show wallet connection requirement', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Should show the wallet connection overlay
    const overlay = page.getByText('Connect Your Wallet');
    await expect(overlay).toBeVisible();
    
    const authMessage = page.getByText('Authentication required to chat with Ember Agents');
    await expect(authMessage).toBeVisible();
    
    console.log('✅ Wallet connection overlay shown correctly');
  });

  test('should show RainbowKit connect button in overlay', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Look for the specific connect button in the overlay
    const overlay = page.locator('[class*="fixed"][class*="inset-0"]').filter({
      hasText: 'Connect Your Wallet'
    });
    
    await expect(overlay).toBeVisible();
    
    // Find the connect button within the overlay
    const connectButton = overlay.getByRole('button');
    await expect(connectButton).toBeVisible();
    
    console.log('✅ Connect button found in wallet overlay');
    
    // Click it to see the RainbowKit modal
    await connectButton.click();
    
    // Wait for modal to appear
    await page.waitForTimeout(1000);
    
    // Should show RainbowKit modal
    const modal = page.getByText('Connect a Wallet');
    await expect(modal).toBeVisible();
    
    console.log('✅ RainbowKit modal opened correctly');
  });

  test('should not show transaction history button when not connected', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Transaction history button should not be visible
    const historyButton = page.getByTestId('transaction-history-button');
    const isVisible = await historyButton.isVisible().catch(() => false);
    
    expect(isVisible).toBe(false);
    console.log('✅ Transaction history button correctly hidden when not connected');
  });

  test('should show page structure without authentication', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Take a screenshot to see what we're working with
    await page.screenshot({ path: 'debug-page-structure.png', fullPage: true });
    
    // Check basic page elements
    const body = page.locator('body');
    await expect(body).toBeVisible();
    
    // Count total buttons
    const buttonCount = await page.locator('button').count();
    console.log('📊 Total buttons found:', buttonCount);
    
    // List all buttons for debugging
    const buttons = await page.locator('button').all();
    for (let i = 0; i < Math.min(buttons.length, 5); i++) {
      const text = await buttons[i].textContent();
      const isVisible = await buttons[i].isVisible();
      console.log(`   Button ${i}: "${text}" (visible: ${isVisible})`);
    }
    
    console.log('✅ Page structure analyzed');
  });
});