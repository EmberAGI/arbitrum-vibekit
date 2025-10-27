import { z } from 'zod';

import { Logger } from './utils/logger.js';

/**
 * ServiceConfig Schema (Service-level configuration)
 * Per PRD: Contains only runtime/host-owned concerns, no agent-level config
 *
 * Includes:
 * - server: { port, host }
 * - logging: { level: enum, structured: boolean, enabled?: boolean }
 * - AI provider secrets (OPENROUTER_API_KEY, etc.)
 *
 * Excludes (these live in config/ workspace):
 * - Agent card/prompt configuration (including card.url)
 * - MCP/workflow behavior toggles
 * - Model defaults
 */
export const ServiceConfigSchema = z.object({
  // Server runtime
  server: z.object({
    port: z.number().int().positive().default(3000),
    host: z.string().default('0.0.0.0'),
  }),

  // A2A runtime overrides (optional path override)
  a2a: z.object({
    path: z.string().optional(),
  }),

  // Logging configuration (Zod enum per PRD)
  logging: z.object({
    enabled: z.boolean().default(true),
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    structured: z.boolean().default(false),
  }),

  // AI provider secrets
  ai: z.object({
    provider: z.enum(['openrouter', 'openai', 'xai', 'hyperbolic']).default('openrouter'),
    openRouterApiKey: z.string().optional(),
    openaiApiKey: z.string().optional(),
    xaiApiKey: z.string().optional(),
    hyperbolicApiKey: z.string().optional(),
  }),

  // Agent runtime parameters (not agent-level config, but execution limits)
  agent: z.object({
    maxSteps: z.number().int().positive().default(100),
  }),
});

export type ServiceConfig = z.infer<typeof ServiceConfigSchema>;

class ConfigManager {
  private static instance: ConfigManager;
  private _config: ServiceConfig;

  private constructor() {
    this._config = this.loadConfig();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): ServiceConfig {
    const rawConfig = {
      server: {
        port: this.parseNumber(process.env['PORT']),
        host: process.env['HOST'],
      },
      a2a: {
        path: process.env['A2A_PATH'],
      },
      logging: {
        enabled: this.parseBoolean(process.env['LOG_ENABLED']),
        level: process.env['LOG_LEVEL'],
        structured: this.parseBoolean(process.env['LOG_STRUCTURED']),
      },
      ai: {
        provider: process.env['AI_PROVIDER'] as
          | 'openrouter'
          | 'openai'
          | 'xai'
          | 'hyperbolic'
          | undefined,
        openRouterApiKey: process.env['OPENROUTER_API_KEY'],
        openaiApiKey: process.env['OPENAI_API_KEY'],
        xaiApiKey: process.env['XAI_API_KEY'],
        hyperbolicApiKey: process.env['HYPERBOLIC_API_KEY'],
      },
      agent: {
        maxSteps: this.parseNumber(process.env['AGENT_MAX_STEPS']),
      },
    };

    try {
      return ServiceConfigSchema.parse(rawConfig);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const logger = Logger.getInstance('Config');
        logger.error('Configuration validation failed');
        for (const issue of error.issues) {
          logger.error(`  ${issue.path.join('.')}: ${issue.message}`);
        }
      }
      throw new Error('Invalid configuration');
    }
  }

  private parseNumber(value: string | undefined): number | undefined {
    if (!value) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private parseBoolean(value: string | undefined): boolean | undefined {
    if (!value) {
      return undefined;
    }
    return value.toLowerCase() === 'true';
  }

  public get(): ServiceConfig {
    return this._config;
  }

  public reload(): void {
    this._config = this.loadConfig();
  }
}

/**
 * Primary export: serviceConfig (service-level configuration)
 * Per PRD: Contains only runtime/host-owned concerns validated via ServiceConfigSchema
 */
export const serviceConfig = ConfigManager.getInstance().get();

export const reloadConfig = (): void => ConfigManager.getInstance().reload();
