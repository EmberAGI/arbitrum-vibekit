/**
 * Coinbase Smart Wallet connector (minimal placeholder)
 *
 * NOTE:
 * - Para Modal v2 alpha accepts `externalWalletConfig.wallets` as an array.
 * - The connector shape is intentionally typed as unknown to avoid depending
 *   on internal SDK types while preserving compilation.
 * - This placeholder opens the Coinbase Smart Wallet web app for setup.
 *   Replace the connect logic with a full integration using @coinbase/cdp-sdk
 *   when ready (passkey creation, session restore, EIP-1193 provider, etc).
 */
export function coinbaseSmartWalletConnector(): unknown {
  return {
    id: "coinbase-smart-wallet",
    name: "Coinbase Smart Wallet",
    iconUrl: "https://avatars.githubusercontent.com/u/1885080?s=200&v=4",
    async connect() {
      // Open Smart Wallet web app for the user to complete passkey setup/sign-in.
      // Replace this with a proper CDP-based connection flow and return an
      // EIP-1193 provider or viem-compatible transport + address/chainId.
      const url = "https://wallet.coinbase.com";
      window.open(url, "_blank", "noopener,noreferrer");
      throw new Error(
        "Finish Coinbase Smart Wallet setup in the opened tab, then return to connect.",
      );
    },
    async disconnect() {
      // No-op placeholder; implement sign-out when CDP session wiring is added.
      return;
    },
  } as unknown;
}


