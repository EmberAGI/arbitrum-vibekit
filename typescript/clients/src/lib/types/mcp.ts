import {
  ServerCapabilities,
  Tool,
  Resource,
  ResourceTemplate,
  Prompt,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";

export interface MCPServer {
  name: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport: TransportType;
  description?: string;
  sessionId?: string;
}

export interface MCPServerConfig {
  servers: Record<string, MCPServer>;
  defaultServer?: string;
}

export interface ConnectionState {
  status: "disconnected" | "connecting" | "connected" | "error";
  server?: MCPServer;
  capabilities?: ServerCapabilities;
  tools: Tool[];
  resources: Resource[];
  resourceTemplates: ResourceTemplate[];
  prompts: Prompt[];
  notifications: ServerNotification[];
  error?: string;
  errorDetails?: any;
}

export type TransportType = "streamable-http" | "stdio";

