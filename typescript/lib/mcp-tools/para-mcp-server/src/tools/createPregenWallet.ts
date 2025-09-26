import { z } from 'zod';
import { createArtifact, createSuccessTask, VibkitError, type VibkitToolDefinition } from 'arbitrum-vibekit-core';
import type { Task } from '@google-a2a/types';
import { addPregenWallet, findPregenWallet } from '../store/pregenWalletStore.js';
import { getParaServerClient, loadParaModule } from '../utils/paraServer.js';

const identifierTypeSchema = z
  .enum(['email', 'phone', 'username', 'id', 'custom'])
  .describe('Identifier key used for pregenerated wallet lookup (e.g., email, phone, username, id)');

const walletTypeSchema = z
  .enum(['EVM', 'SOLANA', 'COSMOS'])
  .describe('Target wallet network type');

export const CreatePregenWalletParams = z.object({
  identifier: z.string().min(1, 'Identifier is required').describe('Unique identifier for pregenerated wallet'),
  identifierType: identifierTypeSchema.default('email'),
  walletType: walletTypeSchema.default('EVM'),
});

export const createPregenWalletTool: VibkitToolDefinition<typeof CreatePregenWalletParams, Task> = {
  name: 'create-pregen-wallet',
  description: 'Create a Para pregenerated wallet for a specific identifier and cache its user share in memory.',
  parameters: CreatePregenWalletParams,
  execute: async (args: z.infer<typeof CreatePregenWalletParams>) => {
    const existing = findPregenWallet(args.identifierType, args.identifier);
    if (existing) {
      const artifact = createArtifact(
        [{ kind: 'text', text: JSON.stringify(existing, null, 2) }],
        'ExistingPregeneratedWallet',
        'Wallet already pregenerated for this identifier',
      );
      return createSuccessTask('pregen-wallet', [artifact], `Wallet already exists for ${args.identifierType}:${args.identifier}`);
    }

    const para = await getParaServerClient();
    const { WalletType } = await loadParaModule();

    const walletType = WalletType[args.walletType as keyof typeof WalletType] ?? WalletType.EVM;
    const identifierKey = args.identifierType;
    const pregenId: Record<string, string> = { [identifierKey]: args.identifier };

    let alreadyExists = false;
    try {
      alreadyExists = await para.hasPregenWallet({ pregenId });
    } catch (error) {
      try {
        alreadyExists = await para.hasPregenWallet({
          pregenIdentifier: args.identifier,
          pregenIdentifierType: args.identifierType.toUpperCase(),
        });
      } catch (innerError) {
        throw new VibkitError(
          'ParaHasPregenWalletFailed',
          -32002,
          `Unable to verify existing pregenerated wallet: ${(innerError as Error).message}`,
        );
      }
    }

    if (alreadyExists) {
     const artifact = createArtifact(
        [{ kind: 'text', text: JSON.stringify({ pregenId, walletType }, null, 2) }],
        'ExistingPregenWalletExternal',
        'Wallet exists in Para but was not cached locally yet',
      );
      const placeholderId = `external-${Date.now()}`;
      addPregenWallet({
        walletId: placeholderId,
        address: undefined,
        walletType: args.walletType,
        identifierKey,
        identifierValue: args.identifier,
        userShareJson: 'Unavailable - wallet already existed before caching',
        rawWallet: { pregenId },
      });
      return createSuccessTask(
        'pregen-wallet',
        [artifact],
        `Wallet already existed in Para for ${identifierKey}:${args.identifier}. Cached placeholder entry locally.`,
      );
    }

    let walletResponse;
    try {
      walletResponse = await para.createPregenWallet({
        type: walletType,
        pregenId,
        pregenIdentifier: args.identifier,
        pregenIdentifierType: args.identifierType.toUpperCase(),
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
      walletType: args.walletType,
      identifierKey,
      identifierValue: args.identifier,
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
      `Pregenerated wallet ${stored.walletId} created for ${identifierKey}:${args.identifier}.`,
    );
  },
};
