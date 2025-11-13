// BREAKING CHANGE: Remove simple script workflow support
import { z } from 'zod';
import { WorkflowPlugin, WorkflowContext, WorkflowState } from './types.js';
import { existsSync } from 'fs';
import path from 'path';

/**
 * Workflow manager - PACKAGE-BASED WORKFLOWS ONLY
 * 
 * BREAKING CHANGE: Simple script workflows have been removed
 * All workflows must now have their own package.json and dependencies
 * This improves dependency isolation and enables better tooling support
 */
export class WorkflowManager {
  private workflows: Map<string, WorkflowPlugin> = new Map();

  constructor() {
    console.log('WorkflowManager initialized - Package-based workflows only');
    console.log('Simple script workflows are no longer supported');
  }

  /**
   * Load package-based workflow from directory with package.json
   * 
   * REMOVED: loadSimpleScript() method - no longer supported
   * REMOVED: Support for .js files without package.json
   * 
   * @param workflowPath - Path to workflow directory containing package.json
   */
  async loadPackageWorkflow(workflowPath: string): Promise<void> {
    const packageJsonPath = path.join(workflowPath, 'package.json');
    
    if (!existsSync(packageJsonPath)) {
      throw new Error(
        `BREAKING: Package-based workflow requires package.json at ${packageJsonPath}. ` +
        `Simple script workflows are no longer supported. Please migrate to package-based structure.`
      );
    }

    // Validate package.json structure
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    if (!packageJson.main) {
      throw new Error(`Package workflow must specify 'main' entry point in package.json`);
    }

    // Load and validate the workflow plugin
    const plugin = await import(path.join(workflowPath, packageJson.main));
    
    if (!plugin.default || typeof plugin.default !== 'object') {
      throw new Error(`Workflow must export default WorkflowPlugin object`);
    }

    this.workflows.set(plugin.default.id, plugin.default);
    console.log(`Loaded package-based workflow: ${plugin.default.id}`);
  }

  /**
   * Get all loaded workflows (package-based only)
   * Simple script workflows are no longer supported
   */
  getWorkflows(): WorkflowPlugin[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Validate workflow configuration
   * Ensures all workflows follow package-based structure
   */
  validateWorkflows(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    for (const workflow of this.workflows.values()) {
      if (!workflow.version) {
        errors.push(`Workflow ${workflow.id} missing version (required for package-based workflows)`);
      }
      
      if (!workflow.inputSchema) {
        errors.push(`Workflow ${workflow.id} missing inputSchema (required for type safety)`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
