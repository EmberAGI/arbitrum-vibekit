"use client";

import { useEffect, useState } from "react";
import { useIsChatGptApp, useWidgetProps } from "@/app/hooks";
import { TransactionPreviewComponent } from "@/components/TransactionPreviewComponent";

type TransactionWidgetProps = {
  success?: boolean;
  rpcUrl?: string;
  txPreview?: Array<{
    to: string;
    data: string;
    value: string;
    chainId: string;
  }>;
  txPlan?: Array<{
    to: string;
    data: string;
    value: string;
    chainId: string;
    gasLimit?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  }>;
};

export default function SignTransaction() {
  const isChatGptApp = useIsChatGptApp();
  const toolOutput = useWidgetProps<TransactionWidgetProps>();

  const widgetTxPreview = toolOutput?.txPreview;
  const widgetRpcUrl = toolOutput?.rpcUrl;

  const [txPreview, setTxPreview] = useState<
    TransactionWidgetProps["txPreview"]
  >([]);
  const [rpcUrl, setRpcUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (widgetTxPreview && widgetTxPreview.length > 0) {
      setTxPreview(widgetTxPreview);
    } else {
      setTxPreview([]);
    }

    setRpcUrl(widgetRpcUrl);
  }, [widgetTxPreview, widgetRpcUrl]);

  // When running inside ChatGPT Apps, wait for the widget props to arrive
  if (isChatGptApp && toolOutput == null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex w-full max-w-2xl flex-col gap-4 rounded-lg bg-white p-8 shadow-lg dark:bg-zinc-900">
          <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
            <svg
              className="h-5 w-5 animate-spin text-zinc-400"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
              />
            </svg>
            <span className="text-sm">Loading transaction data...</span>
          </div>
        </main>
      </div>
    );
  }

  // Error state
  if (toolOutput && !toolOutput.success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex w-full max-w-2xl flex-col gap-4 rounded-lg bg-white p-8 shadow-lg dark:bg-zinc-900">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            Transaction Error
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            {(toolOutput as { error?: string }).error ||
              "Failed to load transaction data"}
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-4 rounded-lg bg-white p-8 shadow-lg dark:bg-zinc-900">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          Sign Transaction
        </h1>
   
          <p className="text-zinc-600 dark:text-zinc-400">
            Review and sign the transaction below using your Para wallet.
          </p>
      

        <TransactionPreviewComponent
          txPreview={txPreview || []}
          rpcUrl={rpcUrl}
        />
      </main>
    </div>
  );
}
