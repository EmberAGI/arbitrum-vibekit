import ClaimPregenWalletClient from "@/components/ClaimPregenWalletClient";

export const dynamic = "force-dynamic";

export default async function ClaimPregenWalletById({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClaimPregenWalletClient id={id} />;
}
