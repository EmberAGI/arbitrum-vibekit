import { z } from 'zod';

export const GetSafeWalletInfoSchema = z.object({
  safeAddress: z.string().optional().describe('Safe wallet address to query (optional)'),
  chainId: z.string().default('421614').describe('Blockchain chain ID (default Arbitrum Sepolia)'),
});

export async function getSafeWalletInfo(params: z.infer<typeof GetSafeWalletInfoSchema>) {
  try {
    console.log(' GetSafeWalletInfo executing with input:', JSON.stringify(params, null, 2));

    if (!params.safeAddress) {
      return {
        success: true,
        message:
          'No Safe wallet address provided. Provide safeAddress to check format. Use createSafeWallet to create a new Safe.',
        data: {},
      };
    }

    if (!params.safeAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return {
        success: false,
        error: 'Invalid Safe wallet address format. Please provide a valid Ethereum address.',
      };
    }

    return {
      success: true,
      message: `Safe wallet address validated: ${params.safeAddress}. Ensure owners/modules are configured on chain ${params.chainId}.`,
      data: { safeAddress: params.safeAddress, chainId: params.chainId },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get Safe wallet info: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

export type GetSafeWalletInfoInput = z.infer<typeof GetSafeWalletInfoSchema>;

