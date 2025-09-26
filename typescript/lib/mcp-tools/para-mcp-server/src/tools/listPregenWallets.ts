import { z } from 'zod';
import { createArtifact, createSuccessTask, type VibkitToolDefinition } from 'arbitrum-vibekit-core';
import type { Task } from '@google-a2a/types';
import { listPregenWallets } from '../store/pregenWalletStore.js';

const ListParams = z.object({}).describe('This tool does not require any arguments');

export const listPregenWalletsTool: VibkitToolDefinition<typeof ListParams, Task> = {
  name: 'list-pregen-wallets',
  description: 'List pregenerated wallets stored in the in-memory cache.',
  parameters: ListParams,
  execute: async () => {
    const wallets = listPregenWallets();
    const summary = `Found ${wallets.length} pregenerated wallet${wallets.length === 1 ? '' : 's'}.`;
    const artifact = createArtifact(
      [{ kind: 'text', text: JSON.stringify(wallets, null, 2) }],
      'PregeneratedWallets',
      'In-memory snapshot of pregenerated wallets',
    );
    return createSuccessTask('pregen-wallet', [artifact], summary);
  },
};
