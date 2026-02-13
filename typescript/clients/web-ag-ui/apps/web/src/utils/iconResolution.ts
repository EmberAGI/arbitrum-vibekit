import { PROTOCOL_TOKEN_FALLBACK } from '../constants/protocolTokenFallback';

export function normalizeNameKey(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeSymbolKey(value: string): string {
  return value.trim().toUpperCase();
}

export function chainNameKeyVariants(value: string): string[] {
  const normalized = normalizeNameKey(value);
  if (normalized.length === 0) return [];

  const variants = new Set<string>([normalized]);

  // Common "long" chain names from providers (ex: "Arbitrum One", "BNB Smart Chain").
  const withoutCommonSuffixes = normalized
    .replace(/\b(one|mainnet|network|chain)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (withoutCommonSuffixes.length > 0) variants.add(withoutCommonSuffixes);

  const firstToken = normalized.split(' ')[0];
  if (firstToken && firstToken.length > 0) variants.add(firstToken);

  return [...variants];
}

export function resolveChainIconUris(params: {
  chainNames: string[];
  chainIconByName: Record<string, string>;
}): string[] {
  const { chainNames, chainIconByName } = params;
  const out: string[] = [];
  const seen = new Set<string>();

  for (const name of chainNames) {
    const uri = chainIconByName[normalizeNameKey(name)];
    if (!uri) continue;
    if (seen.has(uri)) continue;
    seen.add(uri);
    out.push(uri);
  }

  return out;
}

export function resolveProtocolIconUris(params: {
  protocols: string[];
  tokenIconBySymbol: Record<string, string>;
  protocolTokenFallback?: Record<string, string>;
}): string[] {
  const { protocols, tokenIconBySymbol, protocolTokenFallback = PROTOCOL_TOKEN_FALLBACK } = params;
  const out: string[] = [];
  const seen = new Set<string>();

  for (const protocol of protocols) {
    const fallbackSymbol = protocolTokenFallback[protocol];
    if (!fallbackSymbol) continue;
    const uri = tokenIconBySymbol[normalizeSymbolKey(fallbackSymbol)];
    if (!uri) continue;
    if (seen.has(uri)) continue;
    seen.add(uri);
    out.push(uri);
  }

  return out;
}

export function resolveTokenIconUris(params: {
  tokenSymbols: string[];
  tokenIconBySymbol: Record<string, string>;
}): string[] {
  const { tokenSymbols, tokenIconBySymbol } = params;
  const out: string[] = [];
  const seen = new Set<string>();

  for (const symbol of tokenSymbols) {
    const uri = tokenIconBySymbol[normalizeSymbolKey(symbol)];
    if (!uri) continue;
    if (seen.has(uri)) continue;
    seen.add(uri);
    out.push(uri);
  }

  return out;
}

export function resolveAgentAvatarUri(params: {
  protocols: string[];
  tokenIconBySymbol: Record<string, string>;
  protocolTokenFallback?: Record<string, string>;
}): string | null {
  const { protocols, tokenIconBySymbol, protocolTokenFallback = PROTOCOL_TOKEN_FALLBACK } = params;
  for (const protocol of protocols) {
    const fallbackSymbol = protocolTokenFallback[protocol];
    if (!fallbackSymbol) continue;
    const uri = tokenIconBySymbol[normalizeSymbolKey(fallbackSymbol)];
    if (uri) return uri;
  }
  return null;
}
