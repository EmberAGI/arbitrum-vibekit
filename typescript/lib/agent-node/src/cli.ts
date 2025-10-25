#!/usr/bin/env node
/**
 * CLI Binary Entry Point
 * This file is the entry point for the `agent` CLI command
 */

// Import the CLI loader which handles environment loading and CLI execution
await import('./cli/loader.js');
