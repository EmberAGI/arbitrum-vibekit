'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useId, useMemo, useState } from 'react';

import { iconMonogram, proxyIconUri } from '../../utils/iconResolution';

type CursorPos = { x: number; y: number };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export type CursorTooltipItem =
  | string
  | {
      label: string;
      iconUri?: string | null;
    };

function normalizeTooltipItem(item: CursorTooltipItem): { label: string; iconUri: string | null } | null {
  if (typeof item === 'string') {
    const label = item.trim();
    return label.length > 0 ? { label, iconUri: null } : null;
  }

  const label = item.label.trim();
  if (label.length === 0) return null;
  return { label, iconUri: item.iconUri ?? null };
}

export function CursorListTooltip(props: {
  title?: string;
  items: CursorTooltipItem[];
  children: React.ReactNode;
}) {
  const { title, items, children } = props;
  const tooltipId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<CursorPos>({ x: 0, y: 0 });

  const onMove = useCallback((event: React.MouseEvent) => {
    // Keep the tooltip near the cursor while avoiding viewport overflow.
    const padding = 12;
    const maxWidth = 320;
    const maxHeight = 240;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const nextX = clamp(event.clientX + padding, padding, Math.max(padding, vw - maxWidth - padding));
    const nextY = clamp(event.clientY + padding, padding, Math.max(padding, vh - maxHeight - padding));

    setPos({ x: nextX, y: nextY });
  }, []);

  const visibleItems = useMemo(
    () => items.map(normalizeTooltipItem).filter((item): item is NonNullable<typeof item> => item !== null),
    [items],
  );

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={(e) => {
        setIsOpen(true);
        onMove(e);
      }}
      onMouseMove={onMove}
      onMouseLeave={() => setIsOpen(false)}
      aria-describedby={isOpen ? tooltipId : undefined}
    >
      {children}
      {isOpen && visibleItems.length > 0 ? (
        <div
          id={tooltipId}
          role="tooltip"
          className="fixed z-[100] w-[min(320px,calc(100vw-24px))] pointer-events-none rounded-xl border border-white/10 bg-[#0c0c10]/95 backdrop-blur-md shadow-[0_18px_60px_rgba(0,0,0,0.55)]"
          style={{ left: pos.x, top: pos.y }}
        >
          {title ? (
            <div className="px-3 pt-2.5 pb-2 text-[11px] uppercase tracking-[0.14em] text-white/60 border-b border-white/10">
              {title}
            </div>
          ) : null}
          <div className="p-2.5 max-h-60 overflow-auto">
            <div className="flex flex-wrap gap-1.5">
              {visibleItems.map((item) => (
                <span
                  key={`${item.label}-${item.iconUri ?? ''}`}
                  className="px-2 py-1 rounded-lg bg-white/[0.05] ring-1 ring-white/10 text-[12px] text-gray-100 inline-flex items-center gap-1.5"
                >
                  {item.iconUri ? (
                    <img
                      src={proxyIconUri(item.iconUri)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-4 w-4 rounded-full bg-black/30 ring-1 ring-white/10 object-contain"
                    />
                  ) : (
                    <span
                      className="h-4 w-4 rounded-full bg-white/[0.06] ring-1 ring-white/10 flex items-center justify-center text-[7px] font-semibold text-white/70 select-none"
                      aria-hidden="true"
                    >
                      {iconMonogram(item.label)}
                    </span>
                  )}
                  <span>{item.label}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </span>
  );
}
