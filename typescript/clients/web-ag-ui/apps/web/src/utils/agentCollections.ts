import { normalizeSymbolKey } from './iconResolution';

type StringKeyFn = (value: string) => string;
type StringMapFn = (value: string) => string;

type ChainGroup = {
  chains?: string[];
};

type TokenGroup = {
  tokens?: string[];
  protocols?: string[];
};

export function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    return [value];
  }
  return [];
}

export function mergeUniqueStrings(params: {
  primary: string[];
  secondary: string[];
  keyFn: StringKeyFn;
  mapFn?: StringMapFn;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const map = params.mapFn ?? ((value: string) => value);

  const push = (value: string) => {
    const trimmed = map(value).trim();
    if (trimmed.length === 0) return;
    const key = params.keyFn(trimmed);
    if (key.length === 0 || seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };

  for (const value of params.primary) push(value);
  for (const value of params.secondary) push(value);
  return out;
}

export function collectUniqueChainNames(params: {
  groups: ChainGroup[];
  mapFn?: StringMapFn;
  keyFn?: StringKeyFn;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const map = params.mapFn ?? ((value: string) => value);
  const keyFn = params.keyFn ?? ((value: string) => value.toLowerCase());

  for (const group of params.groups) {
    for (const chain of group.chains ?? []) {
      const mapped = map(chain).trim();
      if (mapped.length === 0) continue;
      const key = keyFn(mapped);
      if (key.length === 0 || seen.has(key)) continue;
      seen.add(key);
      out.push(mapped);
    }
  }

  return out;
}

export function collectUniqueTokenSymbols(params: {
  groups: TokenGroup[];
  protocolTokenFallback: Record<string, string>;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (symbol: string | undefined) => {
    if (!symbol) return;
    const key = normalizeSymbolKey(symbol);
    if (key.length === 0 || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };

  for (const group of params.groups) {
    for (const token of group.tokens ?? []) push(token);
    for (const protocol of group.protocols ?? []) {
      push(params.protocolTokenFallback[protocol]);
    }
  }

  return out;
}
