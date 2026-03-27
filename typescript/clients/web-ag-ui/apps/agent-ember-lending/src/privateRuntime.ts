import type { PiRuntimeGatewayService } from 'agent-runtime';

export const DEFAULT_EMBER_LENDING_RUNTIME_MODULE = '@emberagi/ember-lending-runtime';

export type EmberLendingRuntimeEnv = Record<string, string | undefined> & {
  EMBER_LENDING_RUNTIME_MODULE?: string;
};

export type EmberLendingRuntimeModule = {
  createEmberLendingGatewayService: (options: {
    env: EmberLendingRuntimeEnv;
  }) => PiRuntimeGatewayService | Promise<PiRuntimeGatewayService>;
};

type ModuleImport = (specifier: string) => Promise<unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function loadEmberLendingRuntimeModule(
  env: EmberLendingRuntimeEnv = process.env,
  options: {
    importModule?: ModuleImport;
  } = {},
): Promise<EmberLendingRuntimeModule> {
  const moduleName = env.EMBER_LENDING_RUNTIME_MODULE?.trim() || DEFAULT_EMBER_LENDING_RUNTIME_MODULE;
  const importModule = options.importModule ?? ((specifier: string) => import(specifier));
  const loadedModule = await importModule(moduleName);

  if (
    !isRecord(loadedModule) ||
    typeof loadedModule.createEmberLendingGatewayService !== 'function'
  ) {
    throw new Error(
      `Private Ember lending runtime module "${moduleName}" must export createEmberLendingGatewayService().`,
    );
  }

  return loadedModule as EmberLendingRuntimeModule;
}
