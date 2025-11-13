// Simulated change: Remove simple script workflow support
import { z } from 'zod';
import { WorkflowPlugin, WorkflowContext, WorkflowState } from './types.js';

/**
 * Workflow manager - now only supports package-based workflows
 * Simple script workflows have been removed for better dependency management
 */
export class WorkflowManager {
  private workflows: Map<string, WorkflowPlugin> = new Map();

  constructor() {
    console.log('WorkflowManager initialized - Package-based workflows only');
  }

  /**
   * Load package-based workflow from directory with package.json
   * Simple script workflows are no longer supported
   */
  async loadPackageWorkflow(workflowPath: string): Promise<void> {
    const packageJsonPath = path.join(workflowPath, 'package.json');
    
    if (!existsSync(packageJsonPath)) {
      throw new Error(`Package-based workflow requires package.json at ${packageJsonPath}`);
    }

    // Load and validate the workflow plugin
    const plugin = await import(path.join(workflowPath, 'src/index.ts'));
    this.workflows.set(plugin.id, plugin);
  }

  /**
   * Get all loaded workflows (package-based only)
   */
  getWorkflows(): WorkflowPlugin[] {
    return Array.from(this.workflows.values());
  }
}
