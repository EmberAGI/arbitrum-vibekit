import { xmcpHandler } from "@xmcp/adapter";
import type { NextRequest } from "next/server";
import { AsyncLocalStorage } from "async_hooks";

// Create async local storage for request context
export const requestContext = new AsyncLocalStorage<{
  userAgent: string | null;
}>();

async function loggedHandler(request: NextRequest) {
  const userAgent = request.headers.get("user-agent");

  // Log client information
  console.log("MCP Request:", {
    method: request.method,
    url: request.url,
    userAgent,
    origin: request.headers.get("origin"),
    referer: request.headers.get("referer"),
    ip:
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip"),
    timestamp: new Date().toISOString(),
  });

  // Run handler with request context
  return requestContext.run({ userAgent }, () => xmcpHandler(request));
}

export { loggedHandler as GET, loggedHandler as POST };
