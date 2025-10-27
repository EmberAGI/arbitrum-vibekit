/**
 * Config Workspace Watcher
 * Watches config files for changes and triggers minimal restarts
 */

import { watch, type FSWatcher } from 'fs';
import { resolve, relative } from 'path';

import { Logger } from '../../utils/logger.js';

export type ChangeType =
  | 'agent'
  | 'manifest'
  | 'skill'
  | 'mcp'
  | 'workflow'
  | 'workflow-module'
  | 'manual';

export interface FileChange {
  type: ChangeType;
  path: string;
  event: 'change' | 'rename';
}

export type ChangeHandler = (change: FileChange) => void | Promise<void>;

export class ConfigWorkspaceWatcher {
  private watchers: FSWatcher[] = [];
  private logger = Logger.getInstance('ConfigWorkspaceWatcher');
  private changeHandler?: ChangeHandler;
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly debounceMs = 300;

  /**
   * Start watching config workspace
   * @param configRoot - Root path of config workspace
   * @param onChange - Handler called when files change
   */
  start(configRoot: string, onChange: ChangeHandler): void {
    this.changeHandler = onChange;
    const root = resolve(configRoot);

    this.logger.info(`Starting config workspace watcher`, { root });

    // Watch agent.md
    this.watchFile(root, 'agent.md', 'agent');

    // Watch agent.manifest.json
    this.watchFile(root, 'agent.manifest.json', 'manifest');

    // Watch mcp.json
    this.watchFile(root, 'mcp.json', 'mcp');

    // Watch workflow.json
    this.watchFile(root, 'workflow.json', 'workflow');

    // Watch skills directory (only .md files to avoid directory-only events)
    this.watchDirectory(root, 'skills', 'skill', '.md');

    // Watch workflows directory (for module changes)
    this.watchDirectory(root, 'workflows', 'workflow-module');

    this.logger.info(`Config workspace watcher started`);
  }

  /**
   * Watch a specific file
   */
  private watchFile(basePath: string, filename: string, type: ChangeType): void {
    const filePath = resolve(basePath, filename);

    try {
      const watcher = watch(filePath, (event) => {
        this.handleChange({
          type,
          path: filePath,
          event: event === 'change' ? 'change' : 'rename',
        });
      });

      watcher.on('error', (error) => {
        this.logger.error(`Watcher error for ${filename}`, error);
      });

      this.watchers.push(watcher);
      this.logger.debug(`Watching file: ${relative(basePath, filePath)}`);
    } catch (error) {
      this.logger.warn(`Could not watch ${filename}`, { error });
    }
  }

  /**
   * Watch a directory
   * @param basePath - Base path for the config workspace
   * @param dirname - Directory name to watch
   * @param type - Type of change to report
   * @param fileExtension - Optional file extension filter (e.g., '.md') to ignore directory-only events
   */
  private watchDirectory(
    basePath: string,
    dirname: string,
    type: ChangeType,
    fileExtension?: string,
  ): void {
    const dirPath = resolve(basePath, dirname);

    try {
      const watcher = watch(dirPath, { recursive: true }, (event, filename) => {
        if (!filename) return;

        // Filter by file extension if provided (fixes macOS fs.watch quirk where
        // directory modification events report the directory name instead of the file)
        if (fileExtension && !filename.endsWith(fileExtension)) {
          return;
        }

        const filePath = resolve(dirPath, filename);

        this.handleChange({
          type,
          path: filePath,
          event: event === 'change' ? 'change' : 'rename',
        });
      });

      watcher.on('error', (error) => {
        this.logger.error(`Watcher error for ${dirname}/`, error);
      });

      this.watchers.push(watcher);
      this.logger.debug(`Watching directory: ${relative(basePath, dirPath)}`);
    } catch (error) {
      this.logger.warn(`Could not watch directory ${dirname}/`, { error });
    }
  }

  /**
   * Handle file change with debouncing
   */
  private handleChange(change: FileChange): void {
    const key = `${change.type}:${change.path}`;

    // Clear existing debounce timer
    const existing = this.debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    // Set new debounce timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      this.notifyChange(change);
    }, this.debounceMs);

    this.debounceTimers.set(key, timer);
  }

  /**
   * Notify change handler
   */
  private notifyChange(change: FileChange): void {
    if (!this.changeHandler) return;

    this.logger.info(`Config file changed`, {
      type: change.type,
      path: change.path,
      event: change.event,
    });

    try {
      const result = this.changeHandler(change);

      if (result instanceof Promise) {
        result.catch((error) => {
          this.logger.error(`Change handler error`, error);
        });
      }
    } catch (error) {
      // Catch synchronous errors from handler
      this.logger.error(`Change handler error`, error);
    }
  }

  /**
   * Stop watching
   */
  stop(): void {
    this.logger.info(`Stopping config workspace watcher`);

    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // Close all watchers
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];

    this.changeHandler = undefined;
    this.logger.info(`Config workspace watcher stopped`);
  }
}
