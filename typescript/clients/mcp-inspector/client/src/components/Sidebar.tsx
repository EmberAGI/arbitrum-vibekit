import {
  RotateCcw,
  BookOpen,
  Settings,
  ChevronDown,
  ChevronRight,
  Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";

import { ConnectionStatus } from "@/lib/constants";
import useTheme from "../lib/hooks/useTheme";
import { useEffect, useState } from "react";
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
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isServerConfigExpanded, setIsServerConfigExpanded] = useState(false);
  const [isThemeExpanded, setIsThemeExpanded] = useState(false);
  const isConnected = connectionStatus === "connected";

  useEffect(() => {
    const checkDarkMode = () => {
      if (theme === "system") {
        setIsDarkMode(
          window.matchMedia("(prefers-color-scheme: dark)").matches,
        );
      } else {
        setIsDarkMode(theme === "dark");
      }
    };

    checkDarkMode();

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", checkDarkMode);
      return () => mediaQuery.removeEventListener("change", checkDarkMode);
    }
  }, [theme]);

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
      <div className="mb-4">
        <img
          src={isDarkMode ? "/ember-logo-dark.png" : "/ember-logo-light.png"}
          alt="Ember AI"
          className="w-full h-auto max-w-[280px] mx-auto"
        />
      </div>
      {/* Spacer */}
      <div className="h-32"></div>

      {/* Connection status and button */}
      <div className="flex flex-col items-center mb-8">
        <p className="text-base text-left text-muted-foreground mb-4">
          Connect to Ember's MCP server to access on-chain AI agent skills and
          tools for DeFi, trading, and analytics.
        </p>
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
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: (() => {
                switch (connectionStatus as AllowedStatus) {
                  case "connected":
                    return "#22c55e"; // Green for connected
                  case "connecting":
                    return "#eab308"; // Yellow for connecting
                  case "error":
                  case "error-connecting-to-proxy":
                    return "#dc2626"; // Red for errors
                  default:
                    return "#dc2626"; // Red for disconnected
                }
              })(),
            }}
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

      {/* Navigation Links and Controls */}
      <div className="mt-auto mb-6">
        <a
          href="https://docs.emberai.xyz/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-base hover:underline font-semibold flex items-center mb-4"
          style={{ color: isDarkMode ? "#FD6731" : "#5B377D" }}
        >
          <BookOpen size={20} className="mr-2" style={{ opacity: 0.8 }} />
          Ember Docs
        </a>

        <div className="mb-4">
          <button
            onClick={() => setIsServerConfigExpanded(!isServerConfigExpanded)}
            className="text-base hover:underline font-semibold flex items-center hover:opacity-80 transition-opacity p-0 border-0 bg-transparent server-config-button"
            style={{ color: isDarkMode ? "#FD6731" : "#5B377D" }}
          >
            <Settings size={20} className="mr-2" />
            Server Configs
            {isServerConfigExpanded ? (
              <ChevronDown size={16} className="ml-2" />
            ) : (
              <ChevronRight size={16} className="ml-2" />
            )}
          </button>

          {isServerConfigExpanded && (
            <div className="mt-4 flex flex-col items-start space-y-3">
              <div className="w-full">
                <span className="text-xs font-semibold text-muted-foreground block mb-1">
                  Transport:
                </span>
                <div className="bg-muted px-3 py-2 rounded-md border">
                  <span className="text-sm text-foreground select-text">
                    simple-http
                  </span>
                </div>
              </div>
              <div className="w-full">
                <span className="text-xs font-semibold text-muted-foreground block mb-1">
                  MCP Server URL:
                </span>
                <div className="bg-muted px-3 py-2 rounded-md border">
                  <span className="text-sm text-foreground select-text">
                    http://api.emberai.xyz/mcp
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mb-4">
          <button
            onClick={() => setIsThemeExpanded(!isThemeExpanded)}
            className="text-base hover:underline font-semibold flex items-center hover:opacity-80 transition-opacity p-0 border-0 bg-transparent server-config-button"
            style={{ color: isDarkMode ? "#FD6731" : "#5B377D" }}
          >
            <Lightbulb size={20} className="mr-2" />
            Theme
            {isThemeExpanded ? (
              <ChevronDown size={16} className="ml-2" />
            ) : (
              <ChevronRight size={16} className="ml-2" />
            )}
          </button>

          {isThemeExpanded && (
            <div className="mt-4 flex flex-col items-start space-y-3">
              <div className="w-full">
                <div className="space-y-2">
                  {["system", "light", "dark"].map((themeOption) => (
                    <button
                      key={themeOption}
                      onClick={() =>
                        setTheme(themeOption as "system" | "light" | "dark")
                      }
                      className={`w-full text-left bg-muted px-3 py-2 rounded-md border hover:bg-accent transition-colors ${
                        theme === themeOption ? "ring-2 ring-primary" : ""
                      }`}
                    >
                      <span className="text-sm text-foreground capitalize">
                        {themeOption}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
