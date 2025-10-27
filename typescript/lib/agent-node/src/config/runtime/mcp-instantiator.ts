/**
 * MCP Server Instantiator
 * Handles MCP server lifecycle (stdio and HTTP transports)
 */

import { spawn, type ChildProcess } from 'child_process';

import { Logger } from '../../utils/logger.js';
import type { EffectiveMCPServer } from '../composers/effective-set-composer.js';
import { normalizeMCPServerConfig, type MCPServerConfig } from '../schemas/mcp.schema.js';

export interface MCPServerInstance {
  id: string;
  namespace: string;
  type: 'stdio' | 'http';
  process?: ChildProcess;
  url?: string;
  allowedTools?: string[];
  status: 'starting' | 'running' | 'stopped' | 'error';
  error?: Error;
  config: MCPServerConfig;
}

export class MCPInstantiator {
  private instances = new Map<string, MCPServerInstance>();
  private logger = Logger.getInstance('MCPInstantiator');

  /**
   * Instantiate MCP servers from effective set
   * @param effectiveServers - Array of effective MCP servers
   * @returns Map of server ID to instance
   */
  instantiate(effectiveServers: EffectiveMCPServer[]): Map<string, MCPServerInstance> {
    for (const server of effectiveServers) {
      try {
        this.instantiateServer(server);
      } catch (error) {
        this.logger.error(`Failed to instantiate MCP server ${server.id}`, error);
        throw error;
      }
    }

    return this.instances;
  }

  /**
   * Instantiate a single MCP server
   * @param server - Effective MCP server
   */
  private instantiateServer(server: EffectiveMCPServer): void {
    const normalized = normalizeMCPServerConfig(server.config);

    if (normalized.type === 'http') {
      // HTTP transport
      this.instances.set(server.id, {
        id: server.id,
        namespace: server.namespace,
        type: 'http',
        url: normalized.url,
        allowedTools: server.allowedTools,
        status: 'running',
        config: server.config,
      });

      this.logger.info(`MCP server ${server.id} configured (HTTP)`, {
        namespace: server.namespace,
        url: normalized.url,
        allowedTools: server.allowedTools?.length ?? 'all',
      });
    } else {
      // Stdio transport - spawn process
      const { command, args = [], env = {} } = normalized;

      if (!command) {
        throw new Error(`MCP server ${server.id} missing command`);
      }

      const instance: MCPServerInstance = {
        id: server.id,
        namespace: server.namespace,
        type: 'stdio',
        allowedTools: server.allowedTools,
        status: 'starting',
        config: server.config,
      };

      this.instances.set(server.id, instance);

      try {
        const serverEnv = {
          ...process.env,
          ...env,
        };

        const childProcess = spawn(command, args, {
          env: serverEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        instance.process = childProcess;
        instance.status = 'running';

        childProcess.on('error', (error) => {
          this.logger.error(`MCP server ${server.id} process error`, error);
          instance.status = 'error';
          instance.error = error;
        });

        childProcess.on('exit', (code, signal) => {
          this.logger.warn(`MCP server ${server.id} exited`, { code, signal });
          instance.status = 'stopped';
        });

        this.logger.info(`MCP server ${server.id} started (stdio)`, {
          command,
          args,
          namespace: server.namespace,
          allowedTools: server.allowedTools?.length ?? 'all',
        });
      } catch (error) {
        instance.status = 'error';
        instance.error = error instanceof Error ? error : new Error(String(error));
        throw error;
      }
    }
  }

  /**
   * Shutdown all MCP server instances
   */
  async shutdown(): Promise<void> {
    const ids = Array.from(this.instances.keys());
    for (const id of ids) {
      await this.stopInstance(id);
    }
  }

  /**
   * Get all instances
   */
  getInstances(): Map<string, MCPServerInstance> {
    return this.instances;
  }

  /**
   * Get instance by ID
   */
  getInstance(id: string): MCPServerInstance | undefined {
    return this.instances.get(id);
  }

  /**
   * Reload MCP server instances based on new effective set
   */
  async reload(
    effectiveServers: EffectiveMCPServer[],
  ): Promise<{ started: string[]; stopped: string[]; restarted: string[] }> {
    const desired = new Map<string, EffectiveMCPServer>();
    for (const server of effectiveServers) {
      desired.set(server.id, server);
    }

    const started: string[] = [];
    const stopped: string[] = [];
    const restarted: string[] = [];

    for (const existingId of Array.from(this.instances.keys())) {
      if (!desired.has(existingId)) {
        await this.stopInstance(existingId);
        stopped.push(existingId);
      }
    }

    for (const server of effectiveServers) {
      const existing = this.instances.get(server.id);
      if (!existing) {
        this.instantiateServer(server);
        started.push(server.id);
        continue;
      }

      const currentConfig = normalizeMCPServerConfig(existing.config);
      const nextConfig = normalizeMCPServerConfig(server.config);

      if (!deepEqual(currentConfig, nextConfig)) {
        await this.stopInstance(server.id);
        this.instantiateServer(server);
        restarted.push(server.id);
        continue;
      }

      existing.allowedTools = server.allowedTools;
      existing.namespace = server.namespace;
      existing.config = server.config;
    }

    return { started, stopped, restarted };
  }

  private async stopInstance(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) {
      return;
    }

    if (instance.type === 'stdio' && instance.process) {
      await new Promise<void>((resolve) => {
        const child = instance.process;
        if (!child) {
          resolve();
          return;
        }

        const timeout = setTimeout(() => {
          this.logger.warn(`MCP server ${id} shutdown timeout, forcing kill`);
          child.kill('SIGKILL');
          resolve();
        }, 5000);

        child.on('exit', () => {
          clearTimeout(timeout);
          this.logger.info(`MCP server ${id} shutdown`);
          resolve();
        });

        child.kill('SIGTERM');
      });
    } else {
      this.logger.info(`MCP server ${id} removed (HTTP)`);
    }

    this.instances.delete(id);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  if (a === null || b === null) {
    return false;
  }

  if (typeof a !== typeof b) {
    return false;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((value, index) => deepEqual(value, b[index]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aEntries = Object.entries(a as Record<string, unknown>);
    const bEntries = Object.entries(b as Record<string, unknown>);

    if (aEntries.length !== bEntries.length) {
      return false;
    }

    for (const [key, value] of aEntries) {
      if (!deepEqual(value, (b as Record<string, unknown>)[key])) {
        return false;
      }
    }

    return true;
  }

  return false;
}
