import { z } from 'zod';
import { createArtifact, createSuccessTask, VibkitError, type VibkitToolDefinition } from 'arbitrum-vibekit-core';
import type { Task } from '@google-a2a/types';
import { findPregenWallet } from '../store/pregenWalletStore.js';

const identifierTypeSchema = z
  .enum(['email', 'phone', 'username', 'id', 'custom'])
  .describe('Identifier key used for pregenerated wallet lookup (e.g., email, phone, username, id)');

export const ClaimPregenWalletParams = z.object({
  identifier: z.string().min(1, 'Identifier is required').describe('Unique identifier for pregenerated wallet'),
  identifierType: identifierTypeSchema.default('email'),
});

export const claimPregenWalletTool: VibkitToolDefinition<typeof ClaimPregenWalletParams, Task> = {
  name: 'claim-pregen-wallet',
  description: 'Retrieve pregenerated wallet info from cache and return identifier and user share as JSON.',
  parameters: ClaimPregenWalletParams,
  execute: async (args: z.infer<typeof ClaimPregenWalletParams>) => {
    const entry = findPregenWallet(args.identifierType, args.identifier);
    if (!entry) {
      throw new VibkitError(
        'PregenWalletNotFound',
        -32001,
        `No pregenerated wallet found for ${args.identifierType}:${args.identifier}`,
      );
    }



    const payload = {
      identifierKey: entry.identifierKey,
      identifierValue: entry.identifierValue,
      address: entry.address,
      isClaimed: Boolean(entry.isClaimed),
      note:
        entry.isClaimed
          ? 'This pregenerated wallet has already been claimed.'
          : 'This pregenerated wallet is not claimed. You can claim it from the frontend using the Claim button.',
    };

    const artifact = createArtifact(
      [{ kind: 'text', text: JSON.stringify(payload, null, 2) }],
      'ClaimPregenWallet',
      'Identifier and user share for the pregenerated wallet',
    );

    return createSuccessTask(
      'pregen-wallet',
      [artifact],
      `pregenerated wallet details for ${entry.identifierKey}:${entry.identifierValue}`,
    );
  },
};
