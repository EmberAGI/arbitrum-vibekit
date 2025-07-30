// arbitrum-vibekit/typescript/clients/web/tests/types/globals.d.ts
export {};

declare global {
  interface Window {
    __mockWallet?: {
      address?: string;
      isConnected: boolean;
      chainId?: number;
    };
    __mockTransactionExecution?: {
      isSuccess: boolean;
      txHash?: string;
      error?: string;
    };
  }
}