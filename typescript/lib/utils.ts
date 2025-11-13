// Utility functions without existing docs
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function parseConfig(json: string): Record<string, any> {
  return JSON.parse(json);
}
