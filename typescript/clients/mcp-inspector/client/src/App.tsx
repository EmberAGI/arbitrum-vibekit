import { useState } from "react";
import { useConnection } from "./lib/hooks/useConnection";
import { Tabs } from "@/components/ui/tabs";
import ToolsTab from "./components/ToolsTab";
import Sidebar from "./components/Sidebar";
import { InspectorConfig } from "./lib/configurationTypes";
import {
  Tool,
  CompatibilityCallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

const minimalConfig: InspectorConfig = {
  MCP_SERVER_REQUEST_TIMEOUT: {
    label: "Request Timeout",
    description:
      "Maximum time in ms to wait for a response from the MCP server before timing out.",
    value: 30000,
    is_session_item: false,
  },
  MCP_REQUEST_TIMEOUT_RESET_ON_PROGRESS: {
    label: "Reset Timeout on Progress",
    description: "Whether to reset the timeout on progress notifications.",
    value: true,
    is_session_item: false,
  },
  MCP_REQUEST_MAX_TOTAL_TIMEOUT: {
    label: "Max Total Timeout",
    description:
      "Maximum total time in ms to wait for a response from the MCP server before timing out.",
    value: 120000,
    is_session_item: false,
  },
  MCP_PROXY_FULL_ADDRESS: {
    label: "Proxy Full Address",
    description: "The full address of the MCP Proxy Server.",
    value: "",
    is_session_item: false,
  },
  MCP_PROXY_AUTH_TOKEN: {
    label: "Proxy Auth Token",
    description: "Session token for authenticating with the MCP Proxy Server.",
    value: "",
    is_session_item: false,
  },
};

const App = () => {
  const [tools] = useState<Tool[]>([]);
  const [toolResult] = useState<CompatibilityCallToolResult | null>(null);

  const {
    connectionStatus,
    mcpClient,
    connect: connectMcpServer,
    disconnect: disconnectMcpServer,
  } = useConnection({
    transportType: "streamable-http",
    command: "",
    args: "",
    sseUrl: "http://api.emberai.xyz/mcp",
    env: {},
    config: minimalConfig,
  });

  return (
    <div className="flex h-screen bg-background">
      <div
        style={{
          width: 320,
          minWidth: 320,
          maxWidth: 320,
          transition: "none",
        }}
        className="bg-card border-r border-border flex flex-col h-full relative"
      >
        <Sidebar
          connectionStatus={connectionStatus}
          onConnect={connectMcpServer}
          onDisconnect={disconnectMcpServer}
        />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          {mcpClient ? (
            <Tabs
              defaultValue="tools"
              className="w-full p-4"
              onValueChange={() => {}}
            >
              <div className="w-full">
                <ToolsTab
                  tools={tools}
                  callTool={async () => Promise.resolve()}
                  selectedTool={null}
                  setSelectedTool={() => {}}
                  toolResult={toolResult}
                />
              </div>
            </Tabs>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <p className="text-lg text-gray-500 dark:text-gray-400">
                Connect to an MCP server to start inspecting
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
