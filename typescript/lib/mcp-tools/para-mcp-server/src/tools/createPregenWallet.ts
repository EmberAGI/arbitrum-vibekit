import { z } from 'zod';
import { createArtifact, createSuccessTask, VibkitError, type VibkitToolDefinition } from 'arbitrum-vibekit-core';
import type { Task } from '@google-a2a/types';
import { addPregenWallet, findPregenWallet } from '../store/pregenWalletStore.js';
import { getParaServerClient, loadParaModule } from '../utils/paraServer.js';

export const CreatePregenWalletParams = z.object({
  email: z.string().email('Valid email is required').describe('Email address for pregenerated wallet'),
});

export const createPregenWalletTool: VibkitToolDefinition<typeof CreatePregenWalletParams, Task> = {
  name: 'create-pregen-wallet',
  description: 'Create a Para pregenerated wallet for a specific identifier and cache its user share in memory.',
  parameters: CreatePregenWalletParams,
  execute: async (args: z.infer<typeof CreatePregenWalletParams>) => {
    const existing = findPregenWallet(args.email);
    if (existing) {
      // If wallet exists but is NOT claimed, don't allow creating a new one
      if (!existing.isClaimed) {
        const artifact = createArtifact(
          [{ kind: 'text', text: JSON.stringify(existing, null, 2) }],
          'ExistingUnclaimedWallet',
          'An unclaimed wallet already exists for this email',
        );
        return createSuccessTask(
          'pregen-wallet',
          [artifact],
          `Cannot create new wallet: an unclaimed wallet already exists for email:${args.email}`,
        );
      }
      // If wallet exists and IS claimed, allow creation of a new wallet (will proceed below)
    }

    const para = await getParaServerClient();
    const { WalletType } = await loadParaModule();

    // Always create EVM wallet
    const walletType = WalletType.EVM;

    // Para v1 SDK uses pregenIdentifier and pregenIdentifierType
    let alreadyExists = false;
    try {
      alreadyExists = await para.hasPregenWallet({
        pregenIdentifier: args.email,
        pregenIdentifierType: 'EMAIL',
      });
    } catch (error) {
      throw new VibkitError(
        'ParaHasPregenWalletFailed',
        -32002,
        `Unable to verify existing pregenerated wallet: ${(error as Error).message}`,
      );
    }

    if (alreadyExists) {
      const artifact = createArtifact(
        [{ kind: 'text', text: JSON.stringify({ pregenIdentifier: args.email, pregenIdentifierType: 'EMAIL', walletType }, null, 2) }],
        'ExistingPregenWalletExternal',
        'Wallet exists in Para but was not cached locally yet',
      );
      const placeholderId = `external-${Date.now()}`;
      addPregenWallet({
        walletId: placeholderId,
        address: undefined,
        email: args.email,
        userShareJson: 'Unavailable - wallet already existed before caching',
        rawWallet: { pregenIdentifier: args.email, pregenIdentifierType: 'EMAIL' },
      });
      return createSuccessTask(
        'pregen-wallet',
        [artifact],
        `Wallet already existed in Para for email:${args.email}. Cached placeholder entry locally.`,
      );
    }

    // Para v1 SDK: createPregenWallet with pregenIdentifier and pregenIdentifierType
    let walletResponse;
    try {
      walletResponse = await para.createPregenWallet({
        type: walletType,
        pregenIdentifier: args.email,
        pregenIdentifierType: 'EMAIL',
      });
    } catch (error) {
      throw new VibkitError('ParaCreatePregenWalletFailed', -32003, (error as Error).message);
    }

    let userShare: unknown;
    try {
      userShare = await para.getUserShare();
    } catch (error) {
      throw new VibkitError('ParaGetUserShareFailed', -32004, (error as Error).message);
    }

    const stored = addPregenWallet({
      walletId: typeof walletResponse.id === 'string' ? walletResponse.id : 'unknown',
      address: typeof (walletResponse as { address?: string }).address === 'string' ? (walletResponse as { address?: string }).address : undefined,
      email: args.email,
      userShareJson: JSON.stringify(userShare ?? null),
      rawWallet: walletResponse,
    });

    const artifact = createArtifact(
      [{ kind: 'text', text: JSON.stringify(stored, null, 2) }],
      'CreatedPregenWallet',
      'Details of the newly created pregenerated wallet',
    );

    return createSuccessTask(
      'pregen-wallet',
      [artifact],
      `Pregenerated wallet ${stored.walletId} created for email:${args.email}.`,
    );
  },
};
