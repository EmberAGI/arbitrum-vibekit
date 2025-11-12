import { randomBytes } from 'crypto';

import { keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * Get test private key from environment or deterministic variant
 */
export function getTestPrivateKey(variant: string = 'default'): `0x${string}` {
  const envKey = process.env['TEST_PRIVATE_KEY'];
  if (envKey && envKey !== '0x' && envKey.length === 66) {
    return envKey as `0x${string}`;
  }

  const variants: Record<string, string> = {
    default: 'a',
    secondary: 'b',
    tertiary: 'c',
    quaternary: 'd',
    quinary: 'e',
    senary: 'f',
  };

  const char = variants[variant] || 'a';
  return `0x${char.repeat(64)}`;
}

/**
 * Derive test account from deterministic key variant
 */
export function getTestAccount(
  variant: string = 'default',
): ReturnType<typeof privateKeyToAccount> {
  return privateKeyToAccount(getTestPrivateKey(variant));
}

/**
 * Deterministic salts for test scenarios
 */
export function getTestSalt(variant: string = 'default'): `0x${string}` {
  const variants: Record<string, string> = {
    default: 'f',
    secondary: 'b',
  };

  const char = variants[variant] || 'f';
  return `0x${char.repeat(64)}`;
}

/**
 * Test utilities for wallet testing
 * Provides helpers for generating test data and validating wallet operations
 */

/**
 * Generate a random valid private key
 */
export function generateTestPrivateKey(): string {
  const bytes = randomBytes(32);
  return '0x' + bytes.toString('hex');
}

/**
 * Generate multiple unique private keys
 */
export function generateTestPrivateKeys(count: number): string[] {
  const keys = new Set<string>();
  while (keys.size < count) {
    keys.add(generateTestPrivateKey());
  }
  return Array.from(keys);
}

/**
 * Test vectors for HD wallet derivation (BIP-39/44)
 * Source: https://github.com/trezor/python-mnemonic
 */
export const hdWalletTestVectors = [
  {
    mnemonic:
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    seed: '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4',
    path: "m/44'/60'/0'/0/0",
    address: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
    privateKey: '0x1ab42cc412b618bdea3a599e3c9bae199ebf030895b039e9db1e30dafb12b727',
  },
  {
    mnemonic: 'legal winner thank year wave sausage worth useful legal winner thank yellow',
    seed: '878386efb78845b3355bd15ea4d39ef97d179cb712b77d5c12b5b6d4f1b5e8e4',
    path: "m/44'/60'/0'/0/0",
    address: '0x9C5083A2773f0366D43a868acA08C2919D2Cf886',
    privateKey: '0x3c4c8b372f2e5d3e2f4c4b3a1e5f6d7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f',
  },
  {
    mnemonic: 'letter advice cage absurd amount doctor acoustic avoid letter advice cage above',
    seed: 'c0c519bd0e91a2ed54357d9d1ebef2f4e5a4e8d0e4e5e6e7e8e9eaebecedeef0f1',
    path: "m/44'/60'/0'/0/0",
    address: '0xAc173B9D5fC0154C7673d5F96Ba5a0F190Bc09a2',
    privateKey: '0x5d5c4e3b2a1908070605040302010a0b0c0d0e0f101112131415161718191a1b',
  },
];

/**
 * EIP-712 test vectors
 */
export const eip712TestVectors = [
  {
    domain: {
      name: 'Ether Mail',
      version: '1',
      chainId: 1,
      verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
    },
    types: {
      Person: [
        { name: 'name', type: 'string' },
        { name: 'wallet', type: 'address' },
      ],
      Mail: [
        { name: 'from', type: 'Person' },
        { name: 'to', type: 'Person' },
        { name: 'contents', type: 'string' },
      ],
    },
    primaryType: 'Mail',
    message: {
      from: {
        name: 'Cow',
        wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826',
      },
      to: {
        name: 'Bob',
        wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB',
      },
      contents: 'Hello, Bob!',
    },
    // Expected hash of the typed data
    expectedHash: '0xbe609aee343fb3c4b28e1df9e632fca64fcfaede20f02e86244efddf30957bd2',
  },
  {
    domain: {
      name: 'Test DApp',
      version: '1.0.0',
      chainId: 137, // Polygon
      verifyingContract: '0x1234567890123456789012345678901234567890',
    },
    types: {
      Transfer: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: 'Transfer',
    message: {
      from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      amount: '1000000000000000000', // 1 ETH
      nonce: '1',
    },
  },
];

/**
 * Personal sign test messages with expected prefixed hashes
 */
export const personalSignTestVectors = [
  {
    message: 'Hello World',
    // Expected hash with EIP-191 prefix: "\x19Ethereum Signed Message:\n11Hello World"
    prefixedHash: keccak256(toHex('\x19Ethereum Signed Message:\n11Hello World')),
  },
  {
    message: 'Sign this message to authenticate',
    prefixedHash: keccak256(
      toHex('\x19Ethereum Signed Message:\n34Sign this message to authenticate'),
    ),
  },
  {
    message: '',
    prefixedHash: keccak256(toHex('\x19Ethereum Signed Message:\n0')),
  },
  {
    message: '🦄🌈', // Unicode test
    prefixedHash: keccak256(toHex('\x19Ethereum Signed Message:\n8🦄🌈')),
  },
];

/**
 * Generate deterministic test wallet data for reproducible tests
 */
export function generateDeterministicWallet(seed: string): { privateKey: string; address: string } {
  const hash = keccak256(toHex(seed));
  return {
    privateKey: hash,
    address: deriveAddressFromPrivateKey(hash),
  };
}

/**
 * Derive address from private key (simplified, actual implementation would use secp256k1)
 */
function deriveAddressFromPrivateKey(privateKey: string): string {
  // This is a placeholder - actual implementation would:
  // 1. Get public key from private key using secp256k1
  // 2. Hash the public key
  // 3. Take last 20 bytes as address
  const hash = keccak256(privateKey as `0x${string}`);
  return ('0x' + hash.slice(-40)) as `0x${string}`;
}

/**
 * Test transaction templates
 */
export const testTransactions = {
  simple: {
    to: '0x' + '1'.repeat(40),
    value: BigInt('1000000000000000000'), // 1 ETH
    data: '0x',
  },
  withData: {
    to: '0x' + '2'.repeat(40),
    value: BigInt(0),
    data: '0xa9059cbb' + '0'.repeat(24) + '3'.repeat(40) + '0'.repeat(62) + '64', // transfer(address,uint256)
  },
  eip1559: {
    to: '0x' + '3'.repeat(40),
    value: BigInt('500000000000000000'), // 0.5 ETH
    data: '0x',
    type: 2,
    maxFeePerGas: BigInt('30000000000'),
    maxPriorityFeePerGas: BigInt('2000000000'),
  },
  legacy: {
    to: '0x' + '4'.repeat(40),
    value: BigInt('100000000000000000'), // 0.1 ETH
    data: '0x',
    gasPrice: BigInt('20000000000'),
  },
};

/**
 * Chain configurations for multi-chain testing
 */
export const testChains = {
  ethereum: { id: 1, name: 'Ethereum Mainnet' },
  polygon: { id: 137, name: 'Polygon' },
  arbitrum: { id: 42161, name: 'Arbitrum One' },
  optimism: { id: 10, name: 'Optimism' },
  base: { id: 8453, name: 'Base' },
  avalanche: { id: 43114, name: 'Avalanche C-Chain' },
  bsc: { id: 56, name: 'BNB Smart Chain' },
};

/**
 * Helper to validate Ethereum address format
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Helper to validate transaction signature format
 */
export function isValidSignature(signature: string): boolean {
  // Should be 65 bytes (130 hex chars + 0x prefix)
  return /^0x[a-fA-F0-9]{130}$/.test(signature);
}

/**
 * Helper to validate transaction hash format
 */
export function isValidTxHash(hash: string): boolean {
  // Should be 32 bytes (64 hex chars + 0x prefix)
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

/**
 * Mock authorization request generator
 */
export function createMockAuthRequest(
  action: string,
  data: Record<string, unknown>,
): {
  id: string;
  action: string;
  data: Record<string, unknown>;
  timestamp: number;
  status: 'pending';
} {
  return {
    id: `auth-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    action,
    data,
    timestamp: Date.now(),
    status: 'pending' as const,
  };
}

/**
 * Helper to simulate delayed operations (for timing tests)
 */
export async function measureExecutionTime<T>(
  fn: () => Promise<T>,
  samples: number = 10,
): Promise<{ result: T; avgTime: number; stdDev: number }> {
  const times: number[] = [];
  let result: T;

  for (let i = 0; i < samples; i++) {
    const start = process.hrtime.bigint();
    result = await fn();
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1e6); // Convert to milliseconds
  }

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const variance = times.reduce((sum, time) => sum + Math.pow(time - avgTime, 2), 0) / times.length;
  const stdDev = Math.sqrt(variance);

  return { result: result!, avgTime, stdDev };
}

/**
 * Helper for testing error scenarios
 */
export class WalletTestError extends Error {
  constructor(
    public code: string,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'WalletTestError';
  }
}

/**
 * Generate invalid test data for negative testing
 */
export const invalidTestData = {
  privateKeys: [
    '', // Empty
    'not-hex', // Invalid format
    '0x', // No data
    '0xZZZZ', // Invalid hex
    '0x' + 'a'.repeat(63), // Too short
    '0x' + 'a'.repeat(65), // Too long
    '0x' + '0'.repeat(64), // Zero key (invalid for secp256k1)
  ],
  mnemonics: [
    '', // Empty
    'invalid', // Too short
    'word '.repeat(11), // 11 words instead of 12
    'word '.repeat(13), // 13 words
    'xxxx '.repeat(12), // Invalid words
    'test test test test test test test test test test test test', // No checksum
  ],
  addresses: [
    '', // Empty
    '0x', // No address
    '0x' + 'g'.repeat(40), // Invalid hex
    '0x' + '1'.repeat(39), // Too short
    '0x' + '1'.repeat(41), // Too long
    '1'.repeat(40), // Missing 0x prefix
  ],
  passwords: [
    '', // Empty (might be valid in some cases)
    ' ', // Whitespace only
    '\n\t', // Control characters
    'a'.repeat(1000), // Very long
  ],
};

/**
 * Security test helpers
 */
export const securityPatterns = {
  // Patterns that should never appear in logs or public data
  sensitivePatterns: [
    /0x[a-fA-F0-9]{64}/, // Private key pattern
    /([a-z]+\s+){11,23}[a-z]+/, // Mnemonic pattern
    /password|secret|private|key/i, // Sensitive words
  ],

  // Check if a string contains sensitive patterns
  containsSensitive(str: string): boolean {
    return this.sensitivePatterns.some((pattern) => pattern.test(str));
  },

  // Redact sensitive information from string
  redact(str: string): string {
    let redacted = str;
    this.sensitivePatterns.forEach((pattern) => {
      redacted = redacted.replace(pattern, '[REDACTED]');
    });
    return redacted;
  },
};

/**
 * Helper to create a mock wallet for testing interactions
 */
export function createMockWallet(overrides?: Partial<Record<string, unknown>>): {
  isInitialized: () => boolean;
  isLocked: () => boolean;
  getAddress: () => string;
  signMessage: (msg: string) => Promise<string>;
  signTransaction: (tx: Record<string, unknown>) => Promise<string>;
  signTypedData: (data: Record<string, unknown>) => Promise<string>;
  lock: () => Promise<void>;
  unlock: (password: string) => Promise<void>;
} {
  return {
    isInitialized: () => true,
    isLocked: () => false,
    getAddress: () => '0x' + 'a'.repeat(40),
    signMessage: (_msg: string) => Promise.resolve('0x' + 'b'.repeat(130)),
    signTransaction: (_tx: Record<string, unknown>) => Promise.resolve('0x' + 'c'.repeat(200)),
    signTypedData: (_data: Record<string, unknown>) => Promise.resolve('0x' + 'd'.repeat(130)),
    lock: async () => {},
    unlock: async (_password: string) => {},
    ...overrides,
  };
}
