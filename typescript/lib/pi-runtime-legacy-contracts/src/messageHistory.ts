function clampHistory<T>(items: T[], limit: number): T[] {
  if (limit <= 0 || items.length <= limit) {
    return items;
  }
  return items.slice(-limit);
}

function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function semanticMessageEquals<T>(left: T, right: T): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (!isRecord(left) || !isRecord(right)) {
    return false;
  }

  const leftId = left['id'];
  const rightId = right['id'];
  if (typeof leftId === 'string' && leftId.length > 0 && typeof rightId === 'string') {
    return leftId === rightId;
  }

  const leftRole = left['role'];
  const rightRole = right['role'];
  const leftContent = left['content'];
  const rightContent = right['content'];

  return (
    typeof leftRole === 'string' &&
    typeof rightRole === 'string' &&
    typeof leftContent === 'string' &&
    typeof rightContent === 'string' &&
    leftRole === rightRole &&
    leftContent === rightContent
  );
}

export function createMessageHistoryReducer<T>(resolveLimit: () => number) {
  return (left: T | T[], right: T | T[]): T[] => {
    return mergeMessageHistory<T>({
      left,
      right,
      limit: resolveLimit(),
    });
  };
}

export function mergeMessageHistory<T>(params: {
  left: T | T[];
  right: T | T[];
  limit: number;
}): T[] {
  const leftMessages = toArray(params.left);
  const rightMessages = toArray(params.right);

  if (rightMessages === leftMessages) {
    return leftMessages;
  }
  if (rightMessages.length === 0) {
    return leftMessages;
  }

  if (rightMessages.length >= leftMessages.length) {
    let isLeftPrefix = true;
    for (let index = 0; index < leftMessages.length; index += 1) {
      if (!semanticMessageEquals(rightMessages[index], leftMessages[index])) {
        isLeftPrefix = false;
        break;
      }
    }
    if (isLeftPrefix) {
      return clampHistory(rightMessages, params.limit);
    }
  }

  return clampHistory([...leftMessages, ...rightMessages], params.limit);
}
