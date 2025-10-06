import { privateKeyToAccount } from 'viem/accounts';

/**
 * Utility function to safely convert a private key to wallet address
 * Handles formatting and validation of the private key
 */
export function getWalletAddressFromPrivateKey(privateKey: string): string {
  // Ensure private key is properly formatted
  let formattedKey = privateKey;
  if (!formattedKey.startsWith('0x')) {
    formattedKey = '0x' + formattedKey;
  }

  // Validate private key length (should be 64 hex chars + 0x prefix = 66 total)
  if (formattedKey.length !== 66) {
    throw new Error(
      `Invalid private key length: expected 66 characters (including 0x), got ${formattedKey.length}`
    );
  }

  // Validate hex format
  if (!/^0x[0-9a-fA-F]{64}$/.test(formattedKey)) {
    throw new Error('Invalid private key format: must be 64 hex characters with 0x prefix');
  }

  const account = privateKeyToAccount(formattedKey as `0x${string}`);
  return account.address;
}
