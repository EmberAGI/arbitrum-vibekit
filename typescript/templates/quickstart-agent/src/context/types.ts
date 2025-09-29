/**
 * Context types for Hello Quickstart Agent
 * Demonstrates custom context with type safety
 */

export interface HelloContext {
  // Default language for greetings
  defaultLanguage: string;

  // List of supported languages loaded from MCP
  supportedLanguages: string[];

  // Greeting prefix for all greetings
  greetingPrefix: string;

  // When the context was loaded
  loadedAt: Date;

  // Additional metadata
  metadata: {
    mcpServersConnected: number;
    environment: string;
  };
}
