import { type ToolMetadata } from "xmcp";
import { getAppsSdkCompatibleHtml, baseURL } from "@/lib/apps-sdk-html";

export const metadata: ToolMetadata = {
  name: "view_wave_cute_detail",
  description:
    "Display detailed information about a specific Wave Cute by ID from the Akindo API",
  annotations: {
    title: "View Wave Cute Detail",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  _meta: {
    openai: {
      toolInvocation: {
        invoking: "Loading wave cute details",
        invoked: "Wave cute detail ready",
      },
      widgetAccessible: true,
      resultCanProduceWidget: true,
      widgetDescription: "Wave Cute detail viewer",
      widgetPrefersBorder: true,
      widgetCSP: {
        connect_domains: ["https://app.beta.usecapsule.com","connector_69153801992c8191842add9057bbd621.web-sandbox.oaiusercontent.com"],
        resource_domains: ["https://app.beta.usecapsule.com"],
      },
    },
  },
};

export default async function viewWaveCuteDetail() {
  try {
    const html = await getAppsSdkCompatibleHtml(baseURL, "/custom-auth");
    return {
      content: [
        { type: "text", text: `<html>${html}</html>` },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: errorMessage,
              timestamp: new Date().toISOString(),
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }
}