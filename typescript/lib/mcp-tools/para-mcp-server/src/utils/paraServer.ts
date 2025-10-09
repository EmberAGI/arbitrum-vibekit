import { VibkitError } from 'arbitrum-vibekit-core';
import * as ParaSdk from '@getpara/server-sdk';

let paraModule: typeof ParaSdk | null = ParaSdk;
let paraClientFactory: (() => Promise<any>) | null = null;

export async function loadParaModule(): Promise<typeof ParaSdk> {
  if (!paraModule) {
    throw new VibkitError('MissingParaModule', -32603, 'Para module not initialized');
  }
  return paraModule;
}

export async function getParaServerClient() {
  // If a test factory is set, use it
  if (paraClientFactory) {
    return paraClientFactory();
  }

  const apiKey = process.env.PARA_API_KEY;
  if (!apiKey) {
    throw new VibkitError('MissingParaApiKey', -32602, 'PARA_API_KEY environment variable is required');
  }

  const module = await loadParaModule();
  const { Para: ParaServer, Environment } = module;

  const envSetting = process.env.PARA_ENVIRONMENT?.toUpperCase() ?? 'BETA';
  const environment = (Environment as Record<string, (typeof Environment)[keyof typeof Environment]>)[envSetting] ?? Environment.BETA;

  return new ParaServer(environment, apiKey);
}

// Testing utilities
export function __setParaModuleForTesting(mockModule: typeof ParaSdk): void {
  paraModule = mockModule;
}

export function __setParaClientFactoryForTesting(factory: () => Promise<any>): void {
  paraClientFactory = factory;
}

export function __resetParaTestingOverrides(): void {
  paraModule = ParaSdk;
  paraClientFactory = null;
}
