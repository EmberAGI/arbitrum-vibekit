const INTERNAL_PROTOCOL_LABELS = new Set(['Pi Runtime', 'Shared Ember Domain Service']);

export function getVisibleSurfaceProtocols(protocols: readonly string[]): string[] {
  return protocols.filter((protocol) => !INTERNAL_PROTOCOL_LABELS.has(protocol));
}
