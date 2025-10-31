import { unstable_cache } from "next/cache";
import ClaimPregenWalletClient from "./Client";
import type { PregenWallet } from "./Client";
import { db } from "@/db";
import { pregenWallets } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
// Cached DB fetch by id so we don't requery repeatedly for the same id
function getPregenWalletCached(id: string) {
  return unstable_cache(
    async () => {
      const [row] = await db
        .select({
          id: pregenWallets.id,
          email: pregenWallets.email,
          walletAddress: pregenWallets.walletAddress,
          walletId: pregenWallets.walletId,
          walletType: pregenWallets.walletType,
          createdAt: pregenWallets.createdAt,
          claimedAt: pregenWallets.claimedAt,
          userShare: pregenWallets.userShare,
        })
        .from(pregenWallets)
        .where(eq(pregenWallets.id, id))
        .limit(1);

      if (!row) {
        return { wallet: null as PregenWallet | null, userShare: undefined as string | undefined };
      }

      const wallet: PregenWallet = {
        id: row.id,
        email: row.email,
        address: row.walletAddress,
        walletId: row.walletId,
        type: row.walletType,
        createdAt: row.createdAt ? row.createdAt.toISOString() : undefined,
        claimed: !!row.claimedAt,
      };

      return { wallet, userShare: row.userShare as string | undefined };
    },
    ["pregen-wallet", id],
    { tags: ["pregen-wallet", `pregen-wallet:${id}`] },
  )();
}

export default async function ClaimPregenWalletById({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { wallet, userShare } = await getPregenWalletCached(id);
  const error = wallet ? null : "Wallet not found. You can still paste your user share to claim.";

  return (
    <ClaimPregenWalletClient
      wallet={wallet}
      error={error}
      initialUserShare={wallet ? userShare : undefined}
    />
  );
}
