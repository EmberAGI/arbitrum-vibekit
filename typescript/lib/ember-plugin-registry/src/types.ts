export type NetworkId = "mainnet" | "sepolia" | string;

export interface PluginMeta {
  name: string;
  version?: string;
  description?: string;
  author?: string;
  homepage?: string;
  repository?: string;
}

export interface CapabilityContext {
  network: NetworkId;
  chainId?: number;
  rpcUrl?: string;
  agentId?: string;
  utils?: Record<string, unknown>;
}

export interface CapabilityInput { [k: string]: unknown; }
export interface CapabilityResult {
  ok: boolean;
  txHash?: string;
  data?: unknown;
  error?: string;
}

export interface CapabilityDefinition<
  I extends CapabilityInput = CapabilityInput,
  R extends CapabilityResult = CapabilityResult
> {
  key: string; 
  run(input: I, ctx: CapabilityContext): Promise<R>;
  schema?: { input?: unknown; output?: unknown };
}

export interface EmberPlugin {
  meta: PluginMeta;
  capabilities: CapabilityDefinition[];
}