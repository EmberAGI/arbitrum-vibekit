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
      className="bg-card border-r border-border flex flex-col px-4 pt-4 pb-4 shadow-md"
      style={{
        width: "320px",
        minWidth: "320px",
        maxWidth: "320px",
        flexShrink: 0,
        height: "100vh",
      }}
    >
      {/* Main content */}
      <h1 className="text-2xl font-bold text-foreground">EmberAI MCP Server</h1>
      <p className="text-base text-left text-muted-foreground mt-3 mb-6">
        The Ember MCP server exposes on-chain AI agent skills and tools for
        DeFi, trading, and analytics. Use this panel to connect and interact
        with Ember's AI capabilities.
      </p>
      <a
        href="https://docs.emberai.xyz/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-lg hover:underline font-semibold text-left block text-blue-600 mb-12"
      >
        Ember Documentation
      </a>

      {/* Hardcoded connection config display */}
      <div className="flex flex-col items-start space-y-2 mb-12">
        <div>
          <span className="text-xs font-semibold text-muted-foreground">
            Transport:
          </span>
          <span className="ml-2 text-sm text-foreground select-text">
            simple-http
          </span>
        </div>
        <div>
          <span className="text-xs font-semibold text-muted-foreground">
            MCP Server URL:
          </span>
          <span className="ml-2 text-sm text-foreground select-text">
            http://api.emberai.xyz/mcp
          </span>
        </div>
      </div>

      {/* Spacer */}
      <div className="h-32"></div>

      {/* Connection status and button */}
      <div className="flex flex-col items-center mb-8">
        {/* Connect/Restart button */}
        {isConnected ? (
          <Button
            data-testid="connect-button"
            onClick={() => {
              onDisconnect();
              onConnect();
            }}
            className="w-full mb-4"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Restart
          </Button>
        ) : (
          <Button
            onClick={onConnect}
            data-testid="connect-button"
            className="w-full mb-4"
          >
            Connect
          </Button>
        )}
        {/* Status indicator and message */}
        <div className="flex items-center justify-center space-x-2 mt-4">
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
          <span className="text-xs text-muted-foreground">
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
      </div>

      {/* Theme selector - pushed to bottom with margin-top: auto */}
      <div className="mt-auto">
        <label
          htmlFor="theme-select"
          className="block text-xs font-medium text-muted-foreground mb-1 text-left"
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
  );
};

export default Sidebar;
