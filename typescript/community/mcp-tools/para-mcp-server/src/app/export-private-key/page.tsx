"use client";

import { useExportPrivateKey, useLogout } from "@getpara/react-sdk";
import { useState } from "react";
import ParaAuthComponent, {
  type ParaAuthComponentProps,
} from "@/components/ParaAuthComponent";
import { useOpenExternal } from "@/app/hooks/use-open-external";

type ExportableWallet = {
  id?: string;
  address?: string;
  type?: string;
  isPregen?: boolean;
};

function isExportableWallet(value: unknown): value is ExportableWallet {
  if (!value || typeof value !== "object") return false;
  const wallet = value as { [key: string]: unknown };
  const addressOk =
    typeof wallet.address === "string" || typeof wallet.address === "undefined";
  const typeOk =
    typeof wallet.type === "string" || typeof wallet.type === "undefined";
  const isPregenOk =
    typeof wallet.isPregen === "boolean" ||
    typeof wallet.isPregen === "undefined";
  return addressOk && typeOk && isPregenOk;
}

export default function ExportPrivateKeyPage() {
  const { mutate: triggerExport, isPending } = useExportPrivateKey();
  const { logoutAsync } = useLogout();
  const openExternal = useOpenExternal();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [allWallets, setAllWallets] = useState<ExportableWallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string>("");
  const [exportStatus, setExportStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [exportMessage, setExportMessage] = useState("");

  // Filter to only show EVM non-pregenerated wallets
  const eligibleWallets = allWallets.filter(
    (wallet) => wallet.type === "EVM",
  );

  const handleAuthSuccess: NonNullable<
    ParaAuthComponentProps["onAuthSuccess"]
  > = (walletData) => {
    setIsLoggedIn(walletData.isLoggedIn);
    const normalizedWallets = walletData.allWallets.filter(isExportableWallet);
    setAllWallets(normalizedWallets);

    // Find first eligible wallet and select it
    const eligible = normalizedWallets.filter(
      (wallet) => wallet.type === "EVM",
    );
    if (eligible.length > 0) {
      setSelectedWalletId(eligible[0].id ?? eligible[0].address ?? "");
    }
  };

  const handleLogout = async () => {
    try {
      await logoutAsync();
    } catch {}
    setIsLoggedIn(false);
    setAllWallets([]);
    setSelectedWalletId("");
    setExportStatus("idle");
    setExportMessage("");
  };

  const handleExportPrivateKey = () => {
    if (!selectedWalletId) {
      setExportStatus("error");
      setExportMessage("Please select a wallet");
      return;
    }

    setExportStatus("loading");
    setExportMessage("Opening Para export portal...");

    triggerExport(
      { walletId: selectedWalletId, shouldOpenPopup: false },
      {
        onSuccess: (data) => {
          if (!data?.url) {
            setExportStatus("error");
            setExportMessage("Failed to get export URL from Para.");
            return;
          }

          openExternal(data.url);
          setExportStatus("success");
          setExportMessage(
            "Export page opened in a new tab. View and copy your private key in the Para portal.",
          );
        },
        onError: (error) => {
          setExportStatus("error");
          setExportMessage(
            error instanceof Error
              ? error.message
              : "Failed to export private key.",
          );
        },
      },
    );
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-purple-600 via-pink-500 to-red-500 p-4">
      {!isLoggedIn ? (
        <ParaAuthComponent
          onAuthSuccess={handleAuthSuccess}
          onLogout={handleLogout}
          showWalletDetails={true}
        />
      ) : (
        <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-2xl">
          <div className="mb-6">
            <h1 className="mb-2 text-3xl font-bold text-gray-900">
              Export Private Key
            </h1>
            <p className="text-sm text-gray-600">
              Export your EVM wallet private key.
            </p>
          </div>

          {/* Warning Banner */}
          <div className="mb-6 rounded-lg border-2 border-red-200 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <svg
                className="h-6 w-6 flex-shrink-0 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <title>Warning icon</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <div className="font-semibold text-red-900">
                  Security Warning
                </div>
                <div className="mt-1 text-sm text-red-800">
                  Never share your private key with anyone. Anyone with your
                  private key can access and control your wallet. Store it
                  securely offline.
                </div>
              </div>
            </div>
          </div>

          {/* Wallet Selection */}
          {eligibleWallets.length > 0 ? (
            <div className="mb-6 space-y-3">
              <label
                htmlFor="wallet-select"
                className="block text-sm font-medium text-gray-700"
              >
                Select EVM Wallet
              </label>
              <select
                id="wallet-select"
                value={selectedWalletId}
                onChange={(e) => setSelectedWalletId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={exportStatus === "loading"}
              >
                {eligibleWallets.map((wallet) => (
                  <option key={wallet.id || wallet.address} value={wallet.id}>
                    {wallet.address
                      ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
                      : wallet.id}
                  </option>
                ))}
              </select>

              {/* Selected Wallet Details */}
              {selectedWalletId && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="text-sm font-medium text-gray-700 mb-2">
                    Selected Wallet Details
                  </div>
                  {(() => {
                    const selected = eligibleWallets.find(
                      (w) =>
                        w.id === selectedWalletId ||
                        w.address === selectedWalletId
                    );
                    return selected ? (
                      <div className="space-y-2">
                        <div>
                          <span className="text-xs text-gray-600">
                            Address:{" "}
                          </span>
                          <span className="font-mono text-xs text-gray-900">
                            {selected.address}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-gray-600">Type: </span>
                          <span className="text-xs font-medium text-gray-900">
                            {selected.type}
                          </span>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </div>
          ) : (
            <div className="mb-6 rounded-lg border-2 border-yellow-200 bg-yellow-50 p-4">
              <div className="flex items-start gap-3">
                <svg
                  className="h-6 w-6 flex-shrink-0 text-yellow-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <title>Info icon</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <div className="font-semibold text-yellow-900">
                    No Eligible Wallets
                  </div>
                  <div className="mt-1 text-sm text-yellow-800">
                    You don't have any non-pregenerated EVM wallets. Private
                    key export is only available for embedded EVM wallets that
                    are not pregenerated.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Export Button */}
          {eligibleWallets.length > 0 && (
            <button
              type="button"
              onClick={handleExportPrivateKey}
              disabled={!selectedWalletId || isPending}
              className="w-full rounded-lg bg-purple-600 px-6 py-4 font-semibold text-white transition-colors hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Exporting..." : "Export Private Key"}
            </button>
          )}

          {/* Status Messages */}
          {exportMessage && (
            <div
              className={`mt-4 rounded-lg p-4 ${
                exportStatus === "error"
                  ? "bg-red-50 text-red-800"
                  : exportStatus === "success"
                    ? "bg-green-50 text-green-800"
                    : "bg-blue-50 text-blue-800"
              }`}
            >
              <div className="flex items-start gap-2">
                {exportStatus === "success" && (
                  <svg
                    className="h-5 w-5 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <title>Success icon</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                )}
                {exportStatus === "error" && (
                  <svg
                    className="h-5 w-5 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <title>Error icon</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                )}
                <div className="flex-1">{exportMessage}</div>
              </div>
            </div>
          )}

          {/* Logout Button */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full rounded-lg border-2 border-red-600 px-6 py-3 font-semibold text-red-600 transition-colors hover:bg-red-50"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
