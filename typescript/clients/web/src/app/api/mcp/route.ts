import { NextRequest, NextResponse } from "next/server";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { randomUUID } from "crypto";
import { createExpressMocks, createExpressResponse } from "@/lib/express-mock";

// Store transports by session ID
const webAppTransports = new Map<string, StreamableHTTPServerTransport>();
const serverTransports = new Map<string, Transport>();

// MCP Proxy function to forward messages between transports
function mcpProxy({
  transportToClient,
  transportToServer,
}: {
  transportToClient: Transport;
  transportToServer: Transport;
}) {
  let transportToClientClosed = false;
  let transportToServerClosed = false;

  transportToClient.onmessage = (message) => {
    console.log("[MCP Proxy] Message from client to server:", {
      method: "method" in message ? message.method : "unknown",
      hasParams: "params" in message,
    });

    transportToServer.send(message).catch((error) => {
      console.error("[MCP Proxy] Error sending to server:", error);
      if (
        "id" in message &&
        message.id !== undefined &&
        !transportToClientClosed
      ) {
        const errorResponse = {
          jsonrpc: "2.0" as const,
          id: message.id,
          error: {
            code: -32001,
            message: error.message,
            data: error,
          },
        };
        transportToClient.send(errorResponse).catch(console.error);
      }
    });
  };

  transportToServer.onmessage = (message) => {
    console.log("[MCP Proxy] Message from server to client:", {
      method: "method" in message ? message.method : "unknown",
      hasResult: "result" in message,
      hasError: "error" in message,
    });

    transportToClient.send(message).catch((error) => {
      console.error("[MCP Proxy] Error sending message to client:", error);
    });
  };

  transportToClient.onclose = () => {
    if (transportToServerClosed) return;
    transportToClientClosed = true;
    transportToServer.close().catch(console.error);
  };

  transportToServer.onclose = () => {
    if (transportToClientClosed) return;
    transportToServerClosed = true;
    setTimeout(() => {
      if (!transportToClientClosed) {
        transportToClient.close().catch(console.error);
      }
    }, 1000);
  };

  transportToClient.onerror = (error) => {
    console.error("[MCP Proxy] Client transport error:", error);
  };

  transportToServer.onerror = (error) => {
    console.error("[MCP Proxy] Server transport error:", error);
  };
}

// Create transport
async function createTransport(
  url: string,
  transportType: string,
  headers: Record<string, string>
): Promise<Transport> {
  if (transportType === "streamable-http") {
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers },
    });
    await transport.start();
    return transport;
  } else if (transportType === "stdio") {
    const urlObj = new URL(url);
    const command = urlObj.searchParams.get("command") || "";
    const args = JSON.parse(urlObj.searchParams.get("args") || "[]");

    const transport = new StdioClientTransport({
      command,
      args,
      env: process.env as Record<string, string>,
    });
    await transport.start();
    return transport;
  } else {
    throw new Error(`Unsupported transport type: ${transportType}`);
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const sessionId = request.headers.get("mcp-session-id");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing session ID" },
        { status: 400 }
      );
    }

    console.log(`[MCP API] GET request for session ${sessionId}`);

    const transport = webAppTransports.get(sessionId);
    if (!transport) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const mockReq = createExpressMocks(request);

    return new Promise<NextResponse>((resolve) => {
      const mockRes = createExpressResponse((result) => {
        result.headers.set("Access-Control-Allow-Origin", "*");
        result.headers.set(
          "Access-Control-Allow-Methods",
          "GET, POST, DELETE, OPTIONS"
        );
        result.headers.set("Access-Control-Allow-Headers", "*");
        result.headers.set("Access-Control-Expose-Headers", "mcp-session-id");

        resolve(
          new NextResponse(result.body, {
            status: result.status,
            headers: result.headers,
          })
        );
      });

      transport.handleRequest(mockReq, mockRes).catch((error: any) => {
        console.error("[MCP API] GET transport error:", error);
        resolve(
          NextResponse.json(
            { error: "Failed to handle request", details: error.message },
            { status: 500 }
          )
        );
      });
    });
  } catch (error: any) {
    console.error("[MCP API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to handle request", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    const transportType =
      searchParams.get("transportType") || "streamable-http";
    const sessionId = request.headers.get("mcp-session-id");

    console.log(
      `[MCP API] POST request - session: ${sessionId}, url: ${url}, transport: ${transportType}`
    );

    // Handle existing session
    if (sessionId) {
      const transport = webAppTransports.get(sessionId);
      if (!transport) {
        // Session not found - create new session with provided session ID
        console.log(
          `[MCP API] Session ${sessionId} not found, creating new session...`
        );

        if (!url) {
          return NextResponse.json(
            { error: "Missing URL for new session" },
            { status: 400 }
          );
        }

        const headers: Record<string, string> = {
          Accept: "text/event-stream, application/json",
          "Content-Type": "application/json",
        };

        const authHeader = request.headers.get("authorization");
        if (authHeader) {
          headers["Authorization"] = authHeader;
        }

        let serverTransport: Transport;
        try {
          serverTransport = await createTransport(url, transportType, headers);
          console.log(
            "[MCP API] Created server transport for session recreation"
          );
        } catch (error: any) {
          console.error("[MCP API] Failed to create server transport:", error);
          return NextResponse.json(
            {
              error: "Failed to connect to MCP server",
              details: error.message,
            },
            { status: 502 }
          );
        }

        const webAppTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => sessionId,
          onsessioninitialized: (newSessionId) => {
            webAppTransports.set(newSessionId, webAppTransport);
            serverTransports.set(newSessionId, serverTransport);
            console.log(`[MCP API] Session recreated: ${newSessionId}`);
          },
        });

        await webAppTransport.start();
        console.log(
          "[MCP API] Started web app transport for session recreation"
        );

        mcpProxy({
          transportToClient: webAppTransport,
          transportToServer: serverTransport,
        });

        const body = await request.text();
        const parsedBody = body ? JSON.parse(body) : undefined;

        const mockReq = createExpressMocks(request, body, parsedBody);

        return new Promise((resolve) => {
          const mockRes = createExpressResponse((result) => {
            result.headers.set("Access-Control-Allow-Origin", "*");
            result.headers.set(
              "Access-Control-Allow-Methods",
              "GET, POST, DELETE, OPTIONS"
            );
            result.headers.set("Access-Control-Allow-Headers", "*");
            result.headers.set(
              "Access-Control-Expose-Headers",
              "mcp-session-id"
            );

            resolve(
              new NextResponse(result.body, {
                status: result.status,
                headers: result.headers,
              })
            );
          });

          webAppTransport
            .handleRequest(mockReq, mockRes, parsedBody)
            .catch((error: any) => {
              console.error("[MCP API] Request handling error:", error);
              resolve(
                NextResponse.json(
                  { error: "Failed to handle request", details: error.message },
                  { status: 500 }
                )
              );
            });
        });
      }

      const body = await request.text();
      const parsedBody = body ? JSON.parse(body) : undefined;

      // If this is an initialize call for an existing session, just forward it
      // The proxy is already set up when the session was created
      if (parsedBody && parsedBody.method === "initialize") {
        console.log(
          "[MCP API] Forwarding initialize request for existing session"
        );
      }

      const mockReq = createExpressMocks(request, body, parsedBody);

      return new Promise((resolve) => {
        const mockRes = createExpressResponse((result) => {
          result.headers.set("Access-Control-Allow-Origin", "*");
          result.headers.set(
            "Access-Control-Allow-Methods",
            "GET, POST, DELETE, OPTIONS"
          );
          result.headers.set("Access-Control-Allow-Headers", "*");
          result.headers.set("Access-Control-Expose-Headers", "mcp-session-id");

          resolve(
            new NextResponse(result.body, {
              status: result.status,
              headers: result.headers,
            })
          );
        });

        transport
          .handleRequest(mockReq, mockRes, parsedBody)
          .catch((error: any) => {
            console.error("[MCP API] Request handling error:", error);
            resolve(
              NextResponse.json(
                { error: "Failed to handle request", details: error.message },
                { status: 500 }
              )
            );
          });
      });
    }

    // New session
    if (!url) {
      return NextResponse.json(
        { error: "Missing URL for new session" },
        { status: 400 }
      );
    }

    console.log("[MCP API] Creating new session...");

    const headers: Record<string, string> = {
      Accept: "text/event-stream, application/json",
      "Content-Type": "application/json",
    };

    const authHeader = request.headers.get("authorization");
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    let serverTransport: Transport;
    try {
      serverTransport = await createTransport(url, transportType, headers);
      console.log("[MCP API] Created server transport");
    } catch (error: any) {
      console.error("[MCP API] Failed to create server transport:", error);
      return NextResponse.json(
        { error: "Failed to connect to MCP server", details: error.message },
        { status: 502 }
      );
    }

    const webAppTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      onsessioninitialized: (newSessionId) => {
        webAppTransports.set(newSessionId, webAppTransport);
        serverTransports.set(newSessionId, serverTransport);
        console.log(`[MCP API] Session initialized: ${newSessionId}`);
      },
    });

    await webAppTransport.start();
    console.log("[MCP API] Started web app transport");

    mcpProxy({
      transportToClient: webAppTransport,
      transportToServer: serverTransport,
    });

    const body = await request.text();
    const parsedBody = body ? JSON.parse(body) : undefined;

    const mockReq = createExpressMocks(request, body, parsedBody);

    return new Promise((resolve) => {
      const mockRes = createExpressResponse((result) => {
        result.headers.set("Access-Control-Allow-Origin", "*");
        result.headers.set(
          "Access-Control-Allow-Methods",
          "GET, POST, DELETE, OPTIONS"
        );
        result.headers.set("Access-Control-Allow-Headers", "*");
        result.headers.set("Access-Control-Expose-Headers", "mcp-session-id");

        resolve(
          new NextResponse(result.body, {
            status: result.status,
            headers: result.headers,
          })
        );
      });

      webAppTransport
        .handleRequest(mockReq, mockRes, parsedBody)
        .catch((error: any) => {
          console.error("[MCP API] Initial request handling error:", error);
          resolve(
            NextResponse.json(
              { error: "Failed to handle request", details: error.message },
              { status: 500 }
            )
          );
        });
    });
  } catch (error: any) {
    console.error("[MCP API] POST error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const sessionId = request.headers.get("mcp-session-id");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing session ID" },
        { status: 400 }
      );
    }

    console.log(`[MCP API] DELETE request for session ${sessionId}`);

    const serverTransport = serverTransports.get(sessionId);
    const webAppTransport = webAppTransports.get(sessionId);

    if (!serverTransport || !webAppTransport) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    await serverTransport.close();
    await webAppTransport.close();

    serverTransports.delete(sessionId);
    webAppTransports.delete(sessionId);

    console.log(`[MCP API] Session ${sessionId} deleted`);

    return new NextResponse(null, { status: 200 });
  } catch (error: any) {
    console.error("[MCP API] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete session", details: error.message },
      { status: 500 }
    );
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}
