const LANGGRAPH_BUSY_STATUSES = new Set([409, 422]);

export function isLangGraphBusyStatus(status: number): boolean {
  return LANGGRAPH_BUSY_STATUSES.has(status);
}
