import { requestContext } from "@/app/mcp/route";
import { baseURL as rawBaseURL } from "@/config/baseUrl";
import { getAppsSdkCompatibleHtml, baseURL } from "@/lib/apps-sdk-html";

// Helper to check if client is OpenAI
function isOpenAIClient(): boolean {
  const context = requestContext.getStore();
  return context?.userAgent?.includes("openai-mcp") ?? false;
}

// Define tool metadata
export const metadata = {
  get name() {
    const isOpenAI = isOpenAIClient();
    return isOpenAI ? "export-url" : "get-export-private-key-url";
  },
  get description() {
    const isOpenAI = isOpenAIClient();
    if (isOpenAI) {
      return "Return a URL the user can open to export in the Para portal.";
    }
    return "Generate a URL for the Para Export Private Key page. Returns a fully-qualified URL pointing to /export-private-key.";
  },
  annotations: {
    get title() {
      const isOpenAI = isOpenAIClient();
      return isOpenAI ? "Export Private Key URL" : "Get Export Private Key URL";
    },
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  _meta: {
    openai: {
      toolInvocation: {
        invoking: "Loading export private key page",
        invoked: "Export private key page ready",
      },
      widgetAccessible: true,
      resultCanProduceWidget: true,
      widgetDescription: "Export private key page viewer",
      widgetPrefersBorder: true,
      widgetCSP: {
        connect_domains: [
          "https://app.beta.usecapsule.com",
          "connector_69153801992c8191842add9057bbd621.web-sandbox.oaiusercontent.com",
        ],
        resource_domains: ["https://app.beta.usecapsule.com"],
      },
    },
  },
};

function resolveBaseUrl(input?: string | null) {
  const value = input ?? rawBaseURL ?? "";
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `https://${value}`;
}

// Tool implementation (no parameters / schema)
export default async function getExportPrivateKeyUrl() {
  try {
    const html = await getAppsSdkCompatibleHtml(baseURL, "/export-private-key");

    const base = resolveBaseUrl();
    if (!base) {
      throw new Error(
        "Base URL is not configured. Ensure Vercel environment variables (VERCEL_URL/VERCEL_BRANCH_URL/VERCEL_PROJECT_PRODUCTION_URL) are set.",
      );
    }

    const url = `${base}/export-private-key`;

    return {
      content: [
        {
          type: "text" as const,
          text: `<html>${html}</html>`,
        },
      ],
      // Only expose the URL in structuredContent
      structuredContent: url,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to generate export private key URL";

    const result = {
      success: false,
      error: errorMessage,
    };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
      isError: true,
    };
  }
}
