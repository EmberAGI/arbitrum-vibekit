// Core AI service exports
export { AIService } from './service.js';
export type { AIConfig, AIContext, AIOptions, AIResponse } from './service.js';

// Adapter utilities
export {
  a2aMessageToModelMessage,
  modelMessageToA2AParts,
  a2aHistoryToModelMessages,
  createCoreToolFromMCP,
  workflowToCoreTools,
  extractToolCalls,
} from './adapters.js';

// Provider selector - public API
export {
  createProviderSelector,
  getAvailableProviders,
  DEFAULT_MODELS,
  type ProviderSelector,
  type ProviderSelectorConfig,
} from './providers/index.js';

// AI config utility - public API
export {
  validateConfig,
  loadConfig,
  saveConfig,
  AIConfigSchema,
  type AIConfigFile,
  type ValidationResult,
} from './ai-config.js';
