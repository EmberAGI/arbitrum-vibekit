import type { ChatAddToolApproveResponseFunction, DynamicToolUIPart } from "ai";
import { TransactionPreviewComponent } from "./TransactionPreviewComponent";

/**
 * Para-specific Dynamic Tool with Approval View
 *
 * Uses the Para TransactionPreviewComponent for transaction previews.
 */

export function DynamicToolWithApprovalView({
  invocation,
  addToolApprovalResponse,
}: {
  invocation: DynamicToolUIPart;
  addToolApprovalResponse: ChatAddToolApproveResponseFunction;
}) {
  switch (invocation.state) {
    case "approval-requested":
      return (
        <div className="text-gray-500">
          <div className="mb-2 bg-gray-600 rounded-xl border border-gray-900 shadow-lg">
            <pre className="overflow-x-auto p-4 text-sm text-gray-100 whitespace-pre-wrap">
              <div className="pb-2 font-semibold">
                Execute tool &quot;{invocation.toolName}&quot;
              </div>
              {JSON.stringify(invocation.input, null, 2)}
            </pre>
          </div>
          <div>
            <button
              className="px-4 py-2 mr-2 text-white bg-blue-500 rounded transition-colors hover:bg-blue-600"
              onClick={() =>
                addToolApprovalResponse({
                  id: invocation.approval.id,
                  approved: true,
                })
              }
            >
              Approve
            </button>
            <button
              className="px-4 py-2 text-white bg-red-500 rounded transition-colors hover:bg-red-600"
              onClick={() =>
                addToolApprovalResponse({
                  id: invocation.approval.id,
                  approved: false,
                })
              }
            >
              Deny
            </button>
          </div>
        </div>
      );
    case "approval-responded":
      return (
        <div className="text-gray-500">
          <div className="mb-2 bg-gray-600 rounded-xl border border-gray-900 shadow-lg">
            <pre className="overflow-x-auto p-4 text-sm text-gray-100 whitespace-pre-wrap">
              <div className="pb-2 font-semibold">
                Execute tool &quot;{invocation.toolName}&quot;
              </div>
              {JSON.stringify(invocation.input, null, 2)}
              <div className="font-semibold">
                {invocation.approval.approved ? "Approved" : "Denied"}
              </div>
            </pre>
          </div>
        </div>
      );
    case "output-available": {
      const isPreliminary = invocation.preliminary ?? false;
      const output = invocation.output as {
        content?: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      let displayContent = "";
      let hasError = output.isError ?? false;
      let parsedData: unknown = null;

      if (hasError) {
        if (output.content?.[0]?.text) {
          displayContent = output.content[0].text;
        } else {
          displayContent = JSON.stringify(invocation.output, null, 2);
        }
      } else {
        if (output.content?.[0]?.text) {
          try {
            parsedData = JSON.parse(output.content[0].text);
            displayContent = JSON.stringify(parsedData, null, 2);
          } catch {
            displayContent = output.content[0].text;
          }
        } else {
          displayContent = JSON.stringify(invocation.output, null, 2);
        }
      }

      // Special handling for transaction preview
      if (
        invocation.toolName === "create-transaction-preview" &&
        parsedData &&
        !hasError
      ) {
        const txData = parsedData as {
          artifacts?: Array<{
            name: string;
            parts: Array<{
              data: {
                txPreview?: Array<{
                  to: string;
                  data: string;
                  value: string;
                  chainId: string;
                }>;
              };
            }>;
          }>;
        };

        const txPreview = txData.artifacts?.[0]?.parts?.[0]?.data?.txPreview;

        if (txPreview && txPreview.length > 0) {
          return (
            <div className="text-gray-500">
              <div className="mb-2 bg-gray-600 rounded-xl border border-gray-900 shadow-lg">
                <div className="p-4">
                  <div className="pb-2 font-semibold text-gray-100">
                    {isPreliminary ? "Executing" : "Executed"} tool &quot;
                    {invocation.toolName}&quot;
                  </div>
                  <TransactionPreviewComponent txPreview={txPreview} />
                </div>
              </div>
            </div>
          );
        }
      }

      return (
        <div className="text-gray-500">
          <div className="mb-2 bg-gray-600 rounded-xl border border-gray-900 shadow-lg">
            <pre className="overflow-x-auto p-4 text-sm text-gray-100 whitespace-pre-wrap">
              <div className="pb-2 font-semibold">
                {isPreliminary ? "Executing" : "Executed"} tool &quot;
                {invocation.toolName}&quot;
              </div>
              {JSON.stringify(invocation.input, null, 2)}
              <div
                className={`pt-2 pb-2 font-semibold ${hasError ? "text-red-400" : ""}`}
              >
                {hasError ? "Error:" : "Output:"}
              </div>
              <div className={hasError ? "text-red-300" : ""}>
                {displayContent}
              </div>
            </pre>
          </div>
        </div>
      );
    }
    case "output-denied":
      return (
        <div className="text-red-500">
          Tool {invocation.toolName} with input{" "}
          {JSON.stringify(invocation.input)}
          execution denied.
        </div>
      );
    case "output-error":
      return <div className="text-red-500">Error: {invocation.errorText}</div>;
  }
}
