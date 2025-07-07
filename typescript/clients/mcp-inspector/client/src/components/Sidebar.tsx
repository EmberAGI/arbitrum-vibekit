import { useState, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  RotateCcw,
  Settings,
  HelpCircle,
  Copy,
  CheckCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LoggingLevel,
  LoggingLevelSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { InspectorConfig } from "@/lib/configurationTypes";
import { ConnectionStatus } from "@/lib/constants";
import useTheme from "../lib/hooks/useTheme";
// import { version } from "../../../package.json";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useToast } from "../lib/hooks/useToast";

interface SidebarProps {
  connectionStatus: ConnectionStatus;
  transportType: "stdio" | "sse" | "streamable-http";
  env: Record<string, string>;
  setEnv: (env: Record<string, string>) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  logLevel: LoggingLevel;
  sendLogLevelRequest: (level: LoggingLevel) => void;
  loggingSupported: boolean;
  config: InspectorConfig;
  setConfig: (config: InspectorConfig) => void;
  command: string;
  args: string;
  sseUrl: string;
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
  transportType,
  env,
  setEnv,
  onConnect,
  onDisconnect,
  logLevel,
  sendLogLevelRequest,
  loggingSupported,
  config,
  setConfig,
  command,
  args,
  sseUrl,
}: SidebarProps) => {
  const [theme, setTheme] = useTheme();
  const [showEnvVars, setShowEnvVars] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [shownEnvVars, setShownEnvVars] = useState<Set<string>>(new Set());
  const [copiedServerEntry, setCopiedServerEntry] = useState(false);
  const [copiedServerFile, setCopiedServerFile] = useState(false);
  const { toast } = useToast();

  const isConnected = connectionStatus === "connected";

  // Reusable error reporter for copy actions
  const reportError = useCallback(
    (error: unknown) => {
      toast({
        title: "Error",
        description: `Failed to copy config: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    },
    [toast],
  );

  // Shared utility function to generate server config
  const generateServerConfig = useCallback(() => {
    if (transportType === "stdio") {
      return {
        command,
        args: args.trim() ? args.split(/\s+/) : [],
        env: { ...env },
      };
    }
    if (transportType === "sse") {
      return {
        type: "sse",
        url: sseUrl,
        note: "For SSE connections, add this URL directly in your MCP Client",
      };
    }
    if (transportType === "streamable-http") {
      return {
        type: "streamable-http",
        url: sseUrl,
        note: "For Streamable HTTP connections, add this URL directly in your MCP Client",
      };
    }
    return {};
  }, [transportType, command, args, env, sseUrl]);

  // Memoized config entry generator
  const generateMCPServerEntry = useCallback(() => {
    return JSON.stringify(generateServerConfig(), null, 4);
  }, [generateServerConfig]);

  // Memoized config file generator
  const generateMCPServerFile = useCallback(() => {
    return JSON.stringify(
      {
        mcpServers: {
          "default-server": generateServerConfig(),
        },
      },
      null,
      4,
    );
  }, [generateServerConfig]);

  // Memoized copy handlers
  const handleCopyServerEntry = useCallback(() => {
    try {
      const configJson = generateMCPServerEntry();
      navigator.clipboard
        .writeText(configJson)
        .then(() => {
          setCopiedServerEntry(true);

          toast({
            title: "Config entry copied",
            description:
              transportType === "stdio"
                ? "Server configuration has been copied to clipboard. Add this to your mcp.json inside the 'mcpServers' object with your preferred server name."
                : "SSE URL has been copied. Use this URL directly in your MCP Client.",
          });

          setTimeout(() => {
            setCopiedServerEntry(false);
          }, 2000);
        })
        .catch((error) => {
          reportError(error);
        });
    } catch (error) {
      reportError(error);
    }
  }, [generateMCPServerEntry, transportType, toast, reportError]);

  const handleCopyServerFile = useCallback(() => {
    try {
      const configJson = generateMCPServerFile();
      navigator.clipboard
        .writeText(configJson)
        .then(() => {
          setCopiedServerFile(true);

          toast({
            title: "Servers file copied",
            description:
              "Servers configuration has been copied to clipboard. Add this to your mcp.json file. Current testing server will be added as 'default-server'",
          });

          setTimeout(() => {
            setCopiedServerFile(false);
          }, 2000);
        })
        .catch((error) => {
          reportError(error);
        });
    } catch (error) {
      reportError(error);
    }
  }, [generateMCPServerFile, toast, reportError]);

  return (
    <div
      className="bg-card border-r border-border flex flex-col h-full"
      style={{
        width: "320px",
        minWidth: "320px",
        maxWidth: "320px",
        flexShrink: 0,
      }}
    >
      <div className="flex flex-col items-center justify-start w-full px-4 pt-4 space-y-3">
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

        {/* Server configuration section */}
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

        {/* Server entry/configuration section (move all config here) */}
        <div className="w-full mt-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="transport-type-select"
              >
                Transport Type
              </label>
              <Select value={transportType} disabled>
                <SelectTrigger id="transport-type-select">
                  <SelectValue placeholder="Select transport type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stdio">STDIO</SelectItem>
                  <SelectItem value="sse">SSE</SelectItem>
                  <SelectItem value="streamable-http">
                    Streamable HTTP
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Always show command and arguments fields for demo purposes */}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="command-input">
                Command
              </label>
              <Input
                id="command-input"
                placeholder="Command"
                value={command}
                readOnly
                className="font-mono bg-muted cursor-not-allowed"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="arguments-input">
                Arguments
              </label>
              <Input
                id="arguments-input"
                placeholder="Arguments (space-separated)"
                value={args}
                readOnly
                className="font-mono bg-muted cursor-not-allowed"
              />
            </div>

            {transportType === "stdio" && (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  onClick={() => setShowEnvVars(!showEnvVars)}
                  className="flex items-center w-full"
                  data-testid="env-vars-button"
                  aria-expanded={showEnvVars}
                >
                  {showEnvVars ? (
                    <ChevronDown className="w-4 h-4 mr-2" />
                  ) : (
                    <ChevronRight className="w-4 h-4 mr-2" />
                  )}
                  Environment Variables
                </Button>
                {showEnvVars && (
                  <div className="space-y-2">
                    {Object.entries(env).map(([key, value], idx) => (
                      <div key={idx} className="space-y-2 pb-4">
                        <div className="flex gap-2">
                          <Input
                            aria-label={`Environment variable key ${idx + 1}`}
                            placeholder="Key"
                            value={key}
                            onChange={(e) => {
                              const newKey = e.target.value;
                              const newEnv = Object.entries(env).reduce(
                                (acc, [k, v]) => {
                                  if (k === key) {
                                    acc[newKey] = value;
                                  } else {
                                    acc[k] = v;
                                  }
                                  return acc;
                                },
                                {} as Record<string, string>,
                              );
                              setEnv(newEnv);
                              setShownEnvVars((prev) => {
                                const next = new Set(prev);
                                if (next.has(key)) {
                                  next.delete(key);
                                  next.add(newKey);
                                }
                                return next;
                              });
                            }}
                            className="font-mono"
                          />
                          <Button
                            variant="destructive"
                            size="icon"
                            className="h-9 w-9 p-0 shrink-0"
                            onClick={() => {
                              // eslint-disable-next-line @typescript-eslint/no-unused-vars
                              const { [key]: _removed, ...rest } = env;
                              setEnv(rest);
                            }}
                          >
                            ×
                          </Button>
                        </div>
                        <div className="flex gap-2">
                          <Input
                            aria-label={`Environment variable value ${idx + 1}`}
                            type={shownEnvVars.has(key) ? "text" : "password"}
                            placeholder="Value"
                            value={value}
                            onChange={(e) => {
                              const newEnv = { ...env };
                              newEnv[key] = e.target.value;
                              setEnv(newEnv);
                            }}
                            className="font-mono"
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 p-0 shrink-0"
                            onClick={() => {
                              setShownEnvVars((prev) => {
                                const next = new Set(prev);
                                if (next.has(key)) {
                                  next.delete(key);
                                } else {
                                  next.add(key);
                                }
                                return next;
                              });
                            }}
                            aria-label={
                              shownEnvVars.has(key)
                                ? "Hide value"
                                : "Show value"
                            }
                            aria-pressed={shownEnvVars.has(key)}
                            title={
                              shownEnvVars.has(key)
                                ? "Hide value"
                                : "Show value"
                            }
                          >
                            {shownEnvVars.has(key) ? (
                              <Eye className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <EyeOff className="h-4 w-4" aria-hidden="true" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      className="w-full mt-2"
                      onClick={() => {
                        const key = "";
                        const newEnv = { ...env };
                        newEnv[key] = "";
                        setEnv(newEnv);
                      }}
                    >
                      Add Environment Variable
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 mt-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyServerEntry}
                    className="w-full"
                  >
                    {copiedServerEntry ? (
                      <CheckCheck className="h-4 w-4 mr-2" />
                    ) : (
                      <Copy className="h-4 w-4 mr-2" />
                    )}
                    Server Entry
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy Server Entry</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyServerFile}
                    className="w-full"
                  >
                    {copiedServerFile ? (
                      <CheckCheck className="h-4 w-4 mr-2" />
                    ) : (
                      <Copy className="h-4 w-4 mr-2" />
                    )}
                    Servers File
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy Servers File</TooltipContent>
              </Tooltip>
            </div>

            <div className="space-y-2">
              <Button
                variant="outline"
                onClick={() => setShowConfig(!showConfig)}
                className="flex items-center w-full"
                data-testid="config-button"
                aria-expanded={showConfig}
              >
                {showConfig ? (
                  <ChevronDown className="w-4 h-4 mr-2" />
                ) : (
                  <ChevronRight className="w-4 h-4 mr-2" />
                )}
                <Settings className="w-4 h-4 mr-2" />
                Configuration
              </Button>
              {showConfig && (
                <div className="space-y-2">
                  {Object.entries(config).map(([key, configItem]) => {
                    const configKey = key as keyof InspectorConfig;
                    return (
                      <div key={key} className="space-y-2">
                        <div className="flex items-center gap-1">
                          <label
                            className="text-sm font-medium text-green-600 break-all"
                            htmlFor={`${configKey}-input`}
                          >
                            {configItem.label}
                          </label>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                              {configItem.description}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        {typeof configItem.value === "number" ? (
                          <Input
                            id={`${configKey}-input`}
                            type="number"
                            data-testid={`${configKey}-input`}
                            value={configItem.value}
                            onChange={(e) => {
                              const newConfig = { ...config };
                              newConfig[configKey] = {
                                ...configItem,
                                value: Number(e.target.value),
                              };
                              setConfig(newConfig);
                            }}
                            className="font-mono"
                          />
                        ) : typeof configItem.value === "boolean" ? (
                          <Select
                            data-testid={`${configKey}-select`}
                            value={configItem.value.toString()}
                            onValueChange={(val) => {
                              const newConfig = { ...config };
                              newConfig[configKey] = {
                                ...configItem,
                                value: val === "true",
                              };
                              setConfig(newConfig);
                            }}
                          >
                            <SelectTrigger id={`${configKey}-input`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">True</SelectItem>
                              <SelectItem value="false">False</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            id={`${configKey}-input`}
                            data-testid={`${configKey}-input`}
                            value={configItem.value}
                            onChange={(e) => {
                              const newConfig = { ...config };
                              newConfig[configKey] = {
                                ...configItem,
                                value: e.target.value,
                              };
                              setConfig(newConfig);
                            }}
                            className="font-mono"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {loggingSupported && isConnected && (
              <div className="space-y-2">
                <label
                  className="text-sm font-medium"
                  htmlFor="logging-level-select"
                >
                  Logging Level
                </label>
                <Select
                  value={logLevel}
                  onValueChange={(value: LoggingLevel) =>
                    sendLogLevelRequest(value)
                  }
                >
                  <SelectTrigger id="logging-level-select">
                    <SelectValue placeholder="Select logging level" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(LoggingLevelSchema.enum).map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
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
