import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConnectionStatus } from "@/lib/constants";
import useTheme from "../lib/hooks/useTheme";
// import { version } from "../../../package.json";

interface SidebarProps {
  connectionStatus: ConnectionStatus;
  onConnect: () => void;
  onDisconnect: () => void;
}

// Define allowed statuses for type safety
type AllowedStatus =
  | "connected"
  | "connecting"
  | "error"
  | "error-connecting-to-proxy"
  | "disconnected";

const Sidebar = ({
  connectionStatus,
  onConnect,
  onDisconnect,
}: SidebarProps) => {
  const [theme, setTheme] = useTheme();
  const isConnected = connectionStatus === "connected";

  return (
    <div
      className="bg-gray-50 border-r border-border flex flex-col h-full shadow-md"
      style={{
        width: "320px",
        minWidth: "320px",
        maxWidth: "320px",
        flexShrink: 0,
      }}
    >
      <div className="flex flex-col items-start justify-start w-full px-4 pt-4 space-y-3">
        <h1 className="text-2xl font-bold">EmberAI MCP Server</h1>
        <p className="text-base text-gray-600 text-left max-w-[260px]">
          The Ember MCP server exposes on-chain AI agent skills and tools for
          DeFi, trading, and analytics. Use this panel to connect and interact
          with Ember's AI capabilities.
        </p>
        <div className="mb-16" />
        <a
          href="https://docs.emberai.xyz/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-lg text-blue-600 hover:underline font-semibold mb-14 text-left w-full block"
        >
          Ember Documentation
        </a>
        <div className="mb-8" />
        {/* Only show connection status and connect/restart button */}
        <div className="w-full flex flex-col items-center mt-4">
          <div className="mb-16" />
          {/* Status indicator and message */}
          <div className="flex items-center justify-center space-x-2 mb-2">
            <div
              className={`w-2 h-2 rounded-full ${(() => {
                switch (connectionStatus as AllowedStatus) {
                  case "connected":
                    return "bg-green-500";
                  case "connecting":
                    return "bg-yellow-500";
                  case "error":
                  case "error-connecting-to-proxy":
                    return "bg-red-500";
                  default:
                    return "bg-gray-400";
                }
              })()}`}
            />
            <span className="text-xs text-gray-600">
              {(() => {
                switch (connectionStatus as AllowedStatus) {
                  case "connected":
                    return "Connected";
                  case "connecting":
                    return "Connecting...";
                  case "error":
                  case "error-connecting-to-proxy":
                    return "Connection Error";
                  default:
                    return "Disconnected";
                }
              })()}
            </span>
          </div>
          {/* Connect/Restart button */}
          {isConnected ? (
            <Button
              data-testid="connect-button"
              onClick={() => {
                onDisconnect();
                onConnect();
              }}
              className="w-full"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Restart
            </Button>
          ) : (
            <Button
              className="w-full"
              onClick={onConnect}
              data-testid="connect-button"
            >
              Connect
            </Button>
          )}
          <div className="mb-16" />
        </div>
        <div className="mb-48" style={{ minHeight: 96 }} />
        {/* Theme selector section (move to end) */}
        <div className="w-full mt-4">
          <label
            htmlFor="theme-select"
            className="block text-xs font-medium text-gray-500 mb-1 text-left"
          >
            Theme
          </label>
          <Select
            value={theme}
            onValueChange={(value: string) =>
              setTheme(value as "system" | "light" | "dark")
            }
          >
            <SelectTrigger className="w-full" id="theme-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {/*
      <div className="p-4 border-t border-border bg-card">
        <div className="flex flex-col items-center">
          <div className="w-full flex flex-col items-center mt-4">
            <Button variant="ghost" title="Inspector Documentation" asChild>
              <a
                href="https://modelcontextprotocol.io/docs/tools/inspector"
                target="_blank"
                rel="noopener noreferrer"
              >
                <CircleHelp className="w-4 h-4 text-foreground" />
              </a>
            </Button>
            <Button variant="ghost" title="Debugging Guide" asChild>
              <a
                href="https://modelcontextprotocol.io/docs/tools/debugging"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Bug className="w-4 h-4 text-foreground" />
              </a>
            </Button>
            <Button
              variant="ghost"
              title="Report bugs or contribute on GitHub"
              asChild
            >
              <a
                href="https://github.com/modelcontextprotocol/inspector"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="w-4 h-4 text-foreground" />
              </a>
            </Button>
          </div>
        </div>
      </div>
      */}
    </div>
  );
};

export default Sidebar;
