/**
 * Test setup and configuration
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';

// Mock environment variables
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.ARBITRUM_RPC_URL = 'https://arb1.arbitrum.io/rpc';
  process.env.SUBRAPH_API_KEY = 'test-api-key';
  process.env.WALLET_PRIVATE_KEY =
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  process.env.EMBER_MCP_SERVER_URL = 'https://api.emberai.xyz/mcp';
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  process.env.TELEGRAM_BOT_TOKEN = 'test-telegram-token';
  process.env.TELEGRAM_CHAT_ID = 'test-chat-id';
});

// Global mocks
beforeEach(() => {
  // Mock console methods to reduce noise in tests
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Mock fetch for HTTP requests
global.fetch = vi.fn();

// Mock viem
vi.mock('viem', () => ({
  createPublicClient: vi.fn(() => ({
    readContract: vi.fn(),
    getBlockNumber: vi.fn(),
  })),
  createWalletClient: vi.fn(() => ({
    writeContract: vi.fn(),
    sendTransaction: vi.fn(),
  })),
  http: vi.fn(),
  parseUnits: vi.fn((value: string) => BigInt(value)),
  formatUnits: vi.fn((value: bigint) => value.toString()),
  getContract: vi.fn(() => ({
    read: {
      positions: vi.fn(),
      pool: vi.fn(),
    },
    write: {
      mint: vi.fn(),
      burn: vi.fn(),
      swap: vi.fn(),
    },
  })),
  encodeFunctionData: vi.fn(),
  decodeFunctionResult: vi.fn(),
}));

// Mock graphql-request
vi.mock('graphql-request', () => ({
  request: vi.fn(),
  gql: vi.fn((query: string) => query),
}));

// Mock node-telegram-bot-api
vi.mock('node-telegram-bot-api', () => ({
  default: vi.fn(() => ({
    sendMessage: vi.fn(),
    sendPhoto: vi.fn(),
  })),
}));

// Mock express
vi.mock('express', () => ({
  default: vi.fn(() => ({
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    listen: vi.fn(),
  })),
}));

// Mock cors
vi.mock('cors', () => ({
  default: vi.fn(),
}));
