'use client';

import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';

import { COINGECKO_TOKEN_ICON_BY_SYMBOL } from '@/constants/coingeckoTokenIcons';
import { layoutRectangularTreemap } from '@/lib/rectangularTreemap';
import { iconMonogram, proxyIconUri, resolveTokenIconUri } from '@/utils/iconResolution';

import type { DashboardTreemapItem } from './dashboardTypes';

type RectangularTreemapProps = {
  items: readonly DashboardTreemapItem[];
  className?: string;
  onHoveredItemChange?: (item: DashboardTreemapItem | null) => void;
};

type TreemapContainerSize = {
  width: number;
  height: number;
};

const FALLBACK_CONTAINER_SIZE: TreemapContainerSize = {
  width: 248,
  height: 188,
};

function cn(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

function TreemapTokenIcon(props: {
  symbol?: string;
  fallbackSymbol?: string;
  sizePx: number;
  ringColor: string;
}) {
  const [failedIconUri, setFailedIconUri] = useState<string | null>(null);
  const primaryIconUri = props.symbol
    ? resolveTokenIconUri({
        symbol: props.symbol,
        tokenIconBySymbol: COINGECKO_TOKEN_ICON_BY_SYMBOL,
      })
    : null;
  const fallbackIconUri = props.fallbackSymbol
    ? resolveTokenIconUri({
        symbol: props.fallbackSymbol,
        tokenIconBySymbol: COINGECKO_TOKEN_ICON_BY_SYMBOL,
      })
    : null;
  const iconUri = primaryIconUri ?? fallbackIconUri;
  const monogram = iconMonogram(props.fallbackSymbol ?? props.symbol ?? '?');
  const showIcon = iconUri && failedIconUri !== iconUri;

  if (showIcon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={proxyIconUri(iconUri)}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => {
          setFailedIconUri(iconUri);
        }}
        className="shrink-0 rounded-full object-contain"
        style={{
          width: `${props.sizePx}px`,
          height: `${props.sizePx}px`,
          backgroundColor: 'rgba(255,255,255,0.18)',
          boxShadow: `0 0 0 1px ${props.ringColor}`,
        }}
      />
    );
  }

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold uppercase"
      aria-hidden="true"
      style={{
        width: `${props.sizePx}px`,
        height: `${props.sizePx}px`,
        backgroundColor: 'rgba(255,255,255,0.18)',
        boxShadow: `0 0 0 1px ${props.ringColor}`,
        fontSize: `${Math.max(7, props.sizePx * 0.34)}px`,
        letterSpacing: '0.08em',
      }}
    >
      {monogram}
    </span>
  );
}

export function RectangularTreemap({
  items,
  className,
  onHoveredItemChange,
}: RectangularTreemapProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState<TreemapContainerSize>(FALLBACK_CONTAINER_SIZE);
  const layout = layoutRectangularTreemap(items);
  const largestLayoutItem = layout[0];
  const targetHoverWidth = largestLayoutItem
    ? ((containerSize.width * largestLayoutItem.width) / 100) * 1.5
    : containerSize.width;
  const targetHoverHeight = largestLayoutItem
    ? ((containerSize.height * largestLayoutItem.height) / 100) * 1.5
    : containerSize.height;
  const targetHoverArea = targetHoverWidth * targetHoverHeight;

  useEffect(() => {
    const node = containerRef.current;

    if (!node) {
      return;
    }

    const updateSize = () => {
      setContainerSize({
        width: node.clientWidth || FALLBACK_CONTAINER_SIZE.width,
        height: node.clientHeight || FALLBACK_CONTAINER_SIZE.height,
      });
    };

    updateSize();

    const observer = new ResizeObserver(() => {
      updateSize();
    });

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      aria-label="Asset allocation treemap"
      className={cn(
        'relative isolate overflow-visible rounded-[20px] border border-[#E7DBD0] bg-[#0B0B0B]',
        className,
      )}
      ref={containerRef}
      role="img"
    >
      {layout.map((item) => {
        const itemWidth = (containerSize.width * item.width) / 100;
        const itemHeight = (containerSize.height * item.height) / 100;
        const isHovered = hoveredItemId === item.id;
        const hoverScale = Math.sqrt(targetHoverArea / Math.max(itemWidth * itemHeight, 1));
        const displayBounds = getScaledBounds(
          {
            left: (containerSize.width * item.x) / 100,
            top: (containerSize.height * item.y) / 100,
            width: itemWidth,
            height: itemHeight,
          },
          isHovered ? hoverScale : 1,
        );
        const metrics = getTreemapTextMetrics({
          label: item.label,
          shareLabel: item.shareLabel ?? '',
          valueLabel: item.valueLabel,
          width: displayBounds.width,
          height: displayBounds.height,
          allowWrappedLabel: isHovered,
        });
        const iconSize = clamp(Math.min(displayBounds.width, displayBounds.height) * 0.18, 12, 22);
        const hoverChildLayout =
          isHovered && item.hoverChildren ? layoutRectangularTreemap(item.hoverChildren) : null;

        return (
          <Fragment key={item.id}>
            <div
              className="absolute z-20"
              onMouseEnter={() => {
                setHoveredItemId(item.id);
                onHoveredItemChange?.(item);
              }}
              onMouseLeave={() => {
                setHoveredItemId((current) => (current === item.id ? null : current));
                onHoveredItemChange?.(null);
              }}
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                width: `${item.width}%`,
                height: `${item.height}%`,
              }}
              title={`${item.label}: ${item.shareLabel ?? ''} ${item.valueLabel}`.trim()}
            />
            <div
              className="pointer-events-none absolute p-px"
              style={{
                left: `${displayBounds.left}px`,
                top: `${displayBounds.top}px`,
                width: `${displayBounds.width}px`,
                height: `${displayBounds.height}px`,
                zIndex: isHovered ? 10 : 1,
                transition:
                  'left 200ms ease-out, top 200ms ease-out, width 200ms ease-out, height 200ms ease-out',
              }}
            >
              <div
                className="relative flex h-full min-h-0 flex-col justify-start overflow-hidden rounded-[18px]"
                style={{
                  ...item.toneStyle,
                  ...(isHovered && !hoverChildLayout ? item.hoverToneStyle : undefined),
                  paddingInline: `${metrics.paddingX}px`,
                  paddingBlock: `${metrics.paddingY}px`,
                  gap: `${metrics.contentGap}px`,
                  boxShadow: isHovered ? '0 24px 50px rgba(0, 0, 0, 0.18)' : 'none',
                  transition: 'box-shadow 200ms ease-out',
                }}
              >
                {hoverChildLayout ? (
                  <div className="pointer-events-none absolute inset-0">
                    {hoverChildLayout.map((child) => {
                      const childMetrics = getTreemapTextMetrics({
                        label: child.label,
                        subtitle: child.subtitle ?? '',
                        shareLabel: child.shareLabel ?? '',
                        valueLabel: child.valueLabel,
                        width: (displayBounds.width * child.width) / 100,
                        height: (displayBounds.height * child.height) / 100,
                        allowWrappedLabel: true,
                      });
                      const childIconSize = clamp(
                        Math.min(
                          (displayBounds.width * child.width) / 100,
                          (displayBounds.height * child.height) / 100,
                        ) * 0.17,
                        10,
                        18,
                      );

                      return (
                        <div
                          key={child.id}
                          className="pointer-events-none absolute p-px"
                          style={{
                            left: `${child.x}%`,
                            top: `${child.y}%`,
                            width: `${child.width}%`,
                            height: `${child.height}%`,
                          }}
                        >
                          <div
                            className="flex h-full min-h-0 flex-col justify-start overflow-hidden rounded-[16px]"
                            style={{
                              ...child.toneStyle,
                              paddingInline: `${childMetrics.paddingX}px`,
                              paddingBlock: `${childMetrics.paddingY}px`,
                              gap: `${childMetrics.contentGap}px`,
                            }}
                          >
                            <div className="flex min-w-0 items-start gap-1.5">
                              <TreemapTokenIcon
                                symbol={child.iconSymbol}
                                fallbackSymbol={child.fallbackIconSymbol}
                                sizePx={childIconSize}
                                ringColor="rgba(255,255,255,0.18)"
                              />
                              <div className="min-w-0">
                                <div
                                  className="min-w-0 font-mono uppercase leading-none"
                                  style={{
                                    fontSize: `${childMetrics.labelSize}px`,
                                    letterSpacing: `${childMetrics.labelTracking}em`,
                                    display: childMetrics.wrapLabel ? '-webkit-box' : 'block',
                                    WebkitBoxOrient: childMetrics.wrapLabel ? 'vertical' : undefined,
                                    WebkitLineClamp: childMetrics.wrapLabel
                                      ? childMetrics.labelLineCount
                                      : undefined,
                                    overflow: 'hidden',
                                    overflowWrap: childMetrics.wrapLabel ? 'anywhere' : 'normal',
                                    textOverflow: childMetrics.wrapLabel ? 'clip' : 'ellipsis',
                                    whiteSpace: childMetrics.wrapLabel ? 'normal' : 'nowrap',
                                    lineHeight: childMetrics.labelLineHeight,
                                  }}
                                >
                                  {child.label}
                                </div>
                                {child.subtitle ? (
                                  <div
                                    className="mt-0.5 font-mono uppercase leading-none text-current/72"
                                    style={{
                                      fontSize: `${childMetrics.subtitleSize}px`,
                                      letterSpacing: '0.08em',
                                      whiteSpace: 'normal',
                                      overflowWrap: 'anywhere',
                                      lineHeight: childMetrics.subtitleLineHeight,
                                    }}
                                  >
                                    {child.subtitle}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <div
                              className="font-semibold leading-none tracking-[-0.04em]"
                              style={{
                                fontSize: `${childMetrics.valueSize}px`,
                                whiteSpace: 'normal',
                                overflowWrap: 'anywhere',
                              }}
                            >
                              {child.valueLabel}
                            </div>
                            <div
                              className="mt-auto font-mono leading-none text-current/78"
                              style={{
                                fontSize: `${childMetrics.shareSize}px`,
                                whiteSpace: 'normal',
                                overflowWrap: 'anywhere',
                              }}
                            >
                              {child.shareLabel}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <>
                    <div className="flex min-w-0 items-start gap-2">
                      <TreemapTokenIcon
                        symbol={item.iconSymbol}
                        fallbackSymbol={item.fallbackIconSymbol}
                        sizePx={iconSize}
                        ringColor="rgba(255,255,255,0.16)"
                      />
                      <div
                        className="min-w-0 font-mono uppercase leading-none"
                        style={{
                          fontSize: `${metrics.labelSize}px`,
                          letterSpacing: `${metrics.labelTracking}em`,
                          display: metrics.wrapLabel ? '-webkit-box' : 'block',
                          WebkitBoxOrient: metrics.wrapLabel ? 'vertical' : undefined,
                          WebkitLineClamp: metrics.wrapLabel ? metrics.labelLineCount : undefined,
                          overflow: 'hidden',
                          overflowWrap: metrics.wrapLabel ? 'anywhere' : 'normal',
                          textOverflow: metrics.wrapLabel ? 'clip' : 'ellipsis',
                          whiteSpace: metrics.wrapLabel ? 'normal' : 'nowrap',
                          lineHeight: metrics.labelLineHeight,
                        }}
                      >
                        {item.label}
                      </div>
                    </div>
                    <div
                      className="overflow-hidden text-ellipsis font-semibold leading-none tracking-[-0.04em]"
                      style={{
                        fontSize: `${metrics.valueSize}px`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.valueLabel}
                    </div>
                    <div
                      className="mt-auto overflow-hidden text-ellipsis font-mono leading-none text-current/78"
                      style={{
                        fontSize: `${metrics.shareSize}px`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.shareLabel}
                    </div>
                  </>
                )}
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

function getScaledBounds(
  bounds: { left: number; top: number; width: number; height: number },
  scale: number,
) {
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const width = bounds.width * scale;
  const height = bounds.height * scale;

  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    width,
    height,
  };
}

function getTreemapTextMetrics(params: {
  label: string;
  subtitle?: string;
  shareLabel: string;
  valueLabel: string;
  width: number;
  height: number;
  allowWrappedLabel?: boolean;
}) {
  const boxWidth = Math.max(params.width, 1);
  const boxHeight = Math.max(params.height, 1);
  const paddingX = clamp(boxWidth * 0.08, 0.25, 10);
  const paddingY = clamp(boxHeight * 0.08, 0.25, 8);
  const contentWidth = Math.max(boxWidth - paddingX * 2, 0.5);
  const contentHeight = Math.max(boxHeight - paddingY * 2, 0.5);
  const contentGap = clamp(contentHeight * 0.08, 1.5, 4);
  const labelLineHeight = params.allowWrappedLabel ? 0.94 : 1;

  let labelSize = Math.min(
    Math.min(
      fontSizeForWidth(
        params.label,
        params.allowWrappedLabel ? contentWidth * 1.75 : contentWidth,
        0.9,
      ),
      contentHeight * (params.allowWrappedLabel ? 0.2 : 0.16),
    ),
    params.allowWrappedLabel ? 11 : 10,
  );
  let subtitleSize = params.subtitle
    ? Math.min(Math.max(labelSize - 2, 6), contentHeight * 0.12, 9)
    : 0;
  let valueSize = Math.min(
    Math.min(fontSizeForWidth(params.valueLabel, contentWidth, 0.8), contentHeight * 0.24),
    14,
  );
  let shareSize = Math.min(
    Math.min(fontSizeForWidth(params.shareLabel, contentWidth, 0.84), contentHeight * 0.14),
    9,
  );

  const labelLineCount = params.allowWrappedLabel
    ? Math.min(2, Math.max(1, Math.ceil((params.label.length * 0.9 * labelSize) / Math.max(contentWidth, 1))))
    : 1;
  const subtitleLineHeight = params.subtitle ? 0.94 : 1;
  const subtitleLineCount = params.subtitle
    ? Math.max(
        1,
        Math.ceil((params.subtitle.length * 0.78 * Math.max(subtitleSize, 1)) / Math.max(contentWidth, 1)),
      )
    : 0;

  const totalHeight =
    labelSize * labelLineHeight * labelLineCount +
    subtitleSize * subtitleLineHeight * subtitleLineCount +
    valueSize +
    shareSize +
    contentGap * (params.subtitle ? 2.5 : 2);

  if (totalHeight > contentHeight) {
    const scale = contentHeight / totalHeight;
    labelSize *= scale;
    subtitleSize *= scale;
    valueSize *= scale;
    shareSize *= scale;
  }

  return {
    paddingX,
    paddingY,
    contentGap,
    labelSize,
    subtitleSize,
    valueSize,
    shareSize,
    wrapLabel: Boolean(params.allowWrappedLabel),
    labelLineCount,
    labelLineHeight,
    subtitleLineHeight,
    labelTracking: params.allowWrappedLabel ? 0.08 : 0.12,
  };
}

function fontSizeForWidth(value: string, width: number, factor: number): number {
  if (value.length === 0) {
    return 0;
  }

  return width / Math.max(value.length * factor, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
