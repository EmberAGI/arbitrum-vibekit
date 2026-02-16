import { PROTOCOL_TOKEN_FALLBACK } from '../constants/protocolTokenFallback';

export function normalizeNameKey(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeSymbolKey(value: string): string {
  return value.trim().toUpperCase();
}

export function canonicalizeChainLabel(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return trimmed;
  const key = trimmed.toLowerCase().replace(/\s+/g, ' ').trim();
  if (key === 'arbitrum one' || key === 'arbitrum') return 'Arbitrum';
  return trimmed;
}

export function resolveTokenIconUri(params: {
  symbol: string;
  tokenIconBySymbol: Record<string, string>;
}): string | null {
  const symbolKey = normalizeSymbolKey(params.symbol);
  return params.tokenIconBySymbol[symbolKey] ?? null;
}

export function iconMonogram(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length === 0) return '?';

  const match = trimmed.match(/[A-Z]{2,}/);
  if (match && match[0]) return match[0].slice(0, 2);

  const cleaned = trimmed.replace(/[^a-z0-9]/gi, '');
  if (cleaned.length === 0) return '?';
  return cleaned.toUpperCase().slice(0, 2);
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

export function proxyIconUri(uri: string): string {
  return `/api/icon-proxy?url=${encodeURIComponent(uri)}`;
}
