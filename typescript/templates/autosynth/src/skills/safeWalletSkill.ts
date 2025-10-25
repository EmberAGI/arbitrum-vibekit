/**
 * Safe Wallet Management Skill
 * Handles Safe wallet creation and management operations
 */

import { defineSkill } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import { createSafeWalletTool } from '../tools/createSafeWallet.js';
import { getSafeWalletInfoTool } from '../tools/getSafeWalletInfo.js';

export const safeWalletSkill = defineSkill({
  id: 'safe-wallet-management',
  name: 'Safe Wallet Management',
  description: 'Create NEW Safe wallets or get information about EXISTING Safe wallets. For creating a NEW Safe wallet, just say "create safe wallet" - no safeAddress needed. For getting info about an EXISTING Safe wallet, provide the safeAddress.',
  tags: ['safe', 'wallet', 'security', 'automation'],
  examples: [
    'Create a new Safe wallet',
    'I want to create a safe wallet',
    'Create safe wallet',
    'Set up a Safe wallet for job automation',
    'Create a new Safe wallet for automated jobs',
    'Get information about Safe wallet 0x1234...',
    'Check Safe wallet status for 0x1234...',
  ],
  inputSchema: z.object({
    instruction: z.string().describe('What you want to do with Safe wallets. For NEW wallets: "create safe wallet". For EXISTING wallets: "get info about safe wallet 0x1234..."'),
    userAddress: z.string().optional().describe('User wallet address (will be auto-detected if not provided)'),
    safeAddress: z.string().optional().describe('ONLY required for getting info about EXISTING Safe wallets. NOT needed for creating NEW wallets.'),
    chainId: z.string().default('421614').describe('Blockchain chain ID (defaults to Arbitrum Sepolia)'),
  }),
  tools: [createSafeWalletTool, getSafeWalletInfoTool],
});

