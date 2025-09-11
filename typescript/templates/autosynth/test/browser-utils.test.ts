/**
 * Tests for Browser Utils
 * Note: These tests are designed for browser environments
 * They will be skipped in Node.js environments
 */

import { describe, it, expect } from 'mocha';
import { connectMetaMaskSigner, isMetaMaskInstalled, isMetaMaskConnected, getCurrentMetaMaskSigner } from '../src/utils/browser-utils';

// Mock window object for testing
const mockWindow = {
  ethereum: {
    isMetaMask: true,
    request: async (args: any) => {
      if (args.method === 'eth_requestAccounts') {
        return ['0x1234567890123456789012345678901234567890'];
      }
      if (args.method === 'eth_accounts') {
        return ['0x1234567890123456789012345678901234567890'];
      }
      return [];
    }
  }
};

describe('Browser Utils', () => {
  // Skip all tests if not in browser environment
  const isBrowser = typeof globalThis !== 'undefined' && (globalThis as any).window;

  if (!isBrowser) {
    console.log('Skipping browser utils tests - not in browser environment');
    return;
  }

  describe('isMetaMaskInstalled', () => {
    it('should return false when MetaMask is not available', () => {
      // Temporarily remove ethereum from window
      const originalEthereum = (globalThis as any).window?.ethereum;
      if ((globalThis as any).window) {
        delete (globalThis as any).window.ethereum;
      }

      expect(isMetaMaskInstalled()).to.be.false;

      // Restore ethereum
      if ((globalThis as any).window && originalEthereum) {
        (globalThis as any).window.ethereum = originalEthereum;
      }
    });

    it('should return true when MetaMask is available', () => {
      if ((globalThis as any).window) {
        (globalThis as any).window.ethereum = mockWindow.ethereum;
        expect(isMetaMaskInstalled()).to.be.true;
      } else {
        expect(isMetaMaskInstalled()).to.be.false;
      }
    });
  });

  describe('isMetaMaskConnected', () => {
    it('should return false when not connected', async () => {
      if ((globalThis as any).window) {
        (globalThis as any).window.ethereum = {
          ...mockWindow.ethereum,
          request: async () => []
        };
        const connected = await isMetaMaskConnected();
        expect(connected).to.be.false;
      }
    });

    it('should return true when connected', async () => {
      if ((globalThis as any).window) {
        (globalThis as any).window.ethereum = mockWindow.ethereum;
        const connected = await isMetaMaskConnected();
        expect(connected).to.be.true;
      }
    });
  });

  describe('getCurrentMetaMaskSigner', () => {
    it('should return null when MetaMask is not available', async () => {
      const originalEthereum = (globalThis as any).window?.ethereum;
      if ((globalThis as any).window) {
        delete (globalThis as any).window.ethereum;
      }

      const signer = await getCurrentMetaMaskSigner();
      expect(signer).to.be.null;

      // Restore ethereum
      if ((globalThis as any).window && originalEthereum) {
        (globalThis as any).window.ethereum = originalEthereum;
      }
    });

    it('should return signer when MetaMask is available and connected', async () => {
      if ((globalThis as any).window) {
        (globalThis as any).window.ethereum = mockWindow.ethereum;
        const signer = await getCurrentMetaMaskSigner();
        expect(signer).to.not.be.null;
      }
    });
  });

  describe('connectMetaMaskSigner', () => {
    it('should throw error when MetaMask is not available', async () => {
      const originalEthereum = (globalThis as any).window?.ethereum;
      if ((globalThis as any).window) {
        delete (globalThis as any).window.ethereum;
      }

      try {
        await connectMetaMaskSigner();
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('MetaMask not detected');
      }

      // Restore ethereum
      if ((globalThis as any).window && originalEthereum) {
        (globalThis as any).window.ethereum = originalEthereum;
      }
    });

    it('should throw error when not in browser environment', async () => {
      const originalWindow = (globalThis as any).window;
      delete (globalThis as any).window;

      try {
        await connectMetaMaskSigner();
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('browser environments');
      }

      // Restore window
      if (originalWindow) {
        (globalThis as any).window = originalWindow;
      }
    });
  });
});


