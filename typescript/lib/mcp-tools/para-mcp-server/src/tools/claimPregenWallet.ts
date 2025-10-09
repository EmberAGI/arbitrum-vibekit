import { z } from 'zod';
import { createArtifact, createSuccessTask, VibkitError, type VibkitToolDefinition } from 'arbitrum-vibekit-core';
import type { Task } from '@google-a2a/types';
import { findPregenWallet } from '../store/pregenWalletStore.js';

export const ClaimPregenWalletParams = z.object({
  email: z.string().email('Valid email is required').describe('Email address for pregenerated wallet'),
});

export const claimPregenWalletTool: VibkitToolDefinition<typeof ClaimPregenWalletParams, Task> = {
  name: 'claim-pregen-wallet',
  description: 'Retrieve pregenerated wallet info from cache and return identifier and user share as JSON.',
  parameters: ClaimPregenWalletParams,
  execute: async (args: z.infer<typeof ClaimPregenWalletParams>) => {
    const entry = findPregenWallet(args.email);
    if (!entry) {
      throw new VibkitError(
        'PregenWalletNotFound',
        -32001,
        `No pregenerated wallet found for email:${args.email}`,
      );
    }

    // Check if wallet is already claimed
    if (entry.isClaimed) {
      throw new VibkitError(
        'PregenWalletAlreadyClaimed',
        -32005,
        `This pregenerated wallet for email:${args.email} has already been claimed.`,
      );
    }

    const payload = {
      email: entry.email,
      address: entry.address,
      isClaimed: false,
      note: 'This pregenerated wallet is not claimed. You can claim it from the frontend using the Claim button.',
    };

    const artifact = createArtifact(
      [{ kind: 'text', text: JSON.stringify(payload, null, 2) }],
      'ClaimPregenWallet',
      'Identifier and user share for the pregenerated wallet',
    );

    return createSuccessTask(
      'pregen-wallet',
      [artifact],
      `pregenerated wallet details for email:${entry.email}`,
    );
  },
};
