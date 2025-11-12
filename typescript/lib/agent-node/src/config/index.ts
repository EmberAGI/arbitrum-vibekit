/**
 * Config v2 - Config-Driven A2A Agent Composition
 *
 * Main entry point for the agent configuration system.
 * Provides deterministic composition of A2A-compliant agents from:
 * - Independent skill fragments
 * - Shared MCP server registry (Claude-compatible)
 * - Workflow plugin registry
 */

// Schemas
export * from './schemas/index.js';

// Loaders
export * from './loaders/index.js';

// Validators
export * from './validators/index.js';

// Composers
export * from './composers/index.js';

// Runtime
export * from './runtime/index.js';

// Orchestrator
export * from './orchestrator.js';
