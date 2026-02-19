function clampHistory<T>(items: T[], limit: number): T[] {
  if (limit <= 0 || items.length <= limit) {
    return items;
  }
  return items.slice(-limit);
}

function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
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
      if (rightMessages[index] !== leftMessages[index]) {
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
