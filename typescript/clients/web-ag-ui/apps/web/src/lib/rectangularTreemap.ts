export type RectangularTreemapDatum = {
  id: string;
  value: number;
};

export type RectangularTreemapBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RectangularTreemapNode<T extends RectangularTreemapDatum> = T & RectangularTreemapBounds;

const DEFAULT_BOUNDS: RectangularTreemapBounds = {
  x: 0,
  y: 0,
  width: 100,
  height: 100,
};

export function layoutRectangularTreemap<T extends RectangularTreemapDatum>(
  input: readonly T[],
  bounds: RectangularTreemapBounds = DEFAULT_BOUNDS,
): RectangularTreemapNode<T>[] {
  const items = [...input]
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value);

  if (items.length === 0) {
    return [];
  }

  return partition(items, bounds).map((node) => ({
    ...node,
    x: round(node.x),
    y: round(node.y),
    width: round(node.width),
    height: round(node.height),
  }));
}

function partition<T extends RectangularTreemapDatum>(
  items: readonly T[],
  bounds: RectangularTreemapBounds,
): RectangularTreemapNode<T>[] {
  if (items.length === 1) {
    return [{ ...items[0], ...bounds }];
  }

  const total = sumValues(items);
  const splitIndex = pickSplitIndex(items, total);
  const leadingItems = items.slice(0, splitIndex);
  const trailingItems = items.slice(splitIndex);
  const leadingTotal = sumValues(leadingItems);
  const leadingRatio = leadingTotal / total;

  if (bounds.width >= bounds.height) {
    const leadingWidth = bounds.width * leadingRatio;

    return [
      ...partition(leadingItems, {
        ...bounds,
        width: leadingWidth,
      }),
      ...partition(trailingItems, {
        ...bounds,
        x: bounds.x + leadingWidth,
        width: bounds.width - leadingWidth,
      }),
    ];
  }

  const leadingHeight = bounds.height * leadingRatio;

  return [
    ...partition(leadingItems, {
      ...bounds,
      height: leadingHeight,
    }),
    ...partition(trailingItems, {
      ...bounds,
      y: bounds.y + leadingHeight,
      height: bounds.height - leadingHeight,
    }),
  ];
}

function pickSplitIndex<T extends RectangularTreemapDatum>(
  items: readonly T[],
  total: number,
): number {
  const target = total / 2;
  let runningTotal = 0;
  let bestIndex = 1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < items.length - 1; index += 1) {
    runningTotal += items[index].value;
    const distance = Math.abs(target - runningTotal);

    if (distance < bestDistance) {
      bestIndex = index + 1;
      bestDistance = distance;
    }
  }

  return bestIndex;
}

function sumValues<T extends RectangularTreemapDatum>(items: readonly T[]): number {
  return items.reduce((total, item) => total + item.value, 0);
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
