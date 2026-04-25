import type React from 'react';

import type { DashboardTopbarView } from './dashboardTypes';
import { DashboardTokenAvatar } from './DashboardTokenAvatar';

function ExposureSplitValue(props: {
  label: string;
  positiveAssetsValue: string;
  liabilitiesValue: string;
  totalValue: string;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8C7F72]">
          {props.label}
        </div>
        <div className="font-mono text-[12px] font-semibold text-[#6D5B4C]">
          {props.totalValue}
        </div>
      </div>
      <div className="flex items-baseline gap-2 text-[18px] font-semibold tracking-[-0.04em]">
        <span className="text-[#0F5A38]">{props.positiveAssetsValue}</span>
        <span className="inline-flex items-baseline gap-1">
          <span className="text-[#8C7F72]">(</span>
          <span className="text-[#B23A32]">{props.liabilitiesValue}</span>
          <span className="text-[#8C7F72]">)</span>
        </span>
      </div>
    </div>
  );
}

function BenchmarkPreviewOption(props: {
  symbol: string;
  selected?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-medium ${
        props.selected
          ? 'border-[#fd6731]/40 bg-[#fff0e6] text-[#2f2118]'
          : 'border-[#eadac7] bg-[#fffdf8] text-[#8b7563] opacity-75'
      }`}
    >
      <DashboardTokenAvatar symbol={props.symbol} fallbackSymbol={props.symbol} small />
      <span>{props.symbol}</span>
    </div>
  );
}

function BenchmarkTeaserControl(props: { benchmarkAssetLabel: string }) {
  const previewSymbols = [props.benchmarkAssetLabel, 'ETH', 'BTC'].filter(
    (symbol, index, all) => all.indexOf(symbol) === index,
  );

  return (
    <div className="group/benchmark relative inline-flex self-center">
      <button
        type="button"
        title="Preview benchmark selector"
        aria-label={`Benchmark ${props.benchmarkAssetLabel}. Preview benchmark selector.`}
        aria-disabled="true"
        aria-haspopup="dialog"
        className="inline-flex h-9 cursor-default items-center gap-2.5 rounded-full border border-[#D7C5B4] bg-[#F8EFE5] px-3 text-left transition-colors hover:border-[#E8C9AA] hover:bg-[#FFF7F2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8C9AA] focus-visible:ring-offset-2 focus-visible:ring-offset-[#EFE5DA]"
      >
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8C7F72]">
          Benchmark
        </span>
        <span className="inline-flex items-center gap-1.5">
          <DashboardTokenAvatar
            symbol={props.benchmarkAssetLabel}
            fallbackSymbol={props.benchmarkAssetLabel}
            small
          />
          <span className="text-[12px] font-semibold tracking-[-0.02em] text-[#221A13]">
            {props.benchmarkAssetLabel}
          </span>
        </span>
      </button>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-[calc(100%+8px)] z-30 w-[min(22rem,calc(100vw-1.5rem))] cursor-default rounded-[20px] border border-[#eadac7] bg-[#fffdf8]/98 p-3 opacity-0 shadow-[0_18px_44px_rgba(115,78,48,0.16)] backdrop-blur-sm translate-y-1 transition duration-150 before:absolute before:-top-2 before:left-0 before:h-2 before:w-full before:content-[''] group-hover/benchmark:pointer-events-auto group-hover/benchmark:translate-y-0 group-hover/benchmark:opacity-100 group-focus-within/benchmark:pointer-events-auto group-focus-within/benchmark:translate-y-0 group-focus-within/benchmark:opacity-100"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8C7F72]">
              Selected Benchmark
            </div>
            <div className="rounded-full bg-[#fff0e6] px-2 py-0.5 text-[11px] font-medium text-[#b84f2c] ring-1 ring-[#f3d5c5]">
              Pro Only
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {previewSymbols.map((symbol, index) => (
              <BenchmarkPreviewOption key={symbol} symbol={symbol} selected={index === 0} />
            ))}
          </div>
          <div className="text-[13px] leading-5 text-[#7c6757]">
            The benchmark is the reference asset you compare this portfolio against to measure performance.
          </div>
        </div>
      </div>
    </div>
  );
}

export function PortfolioDashboardTopBar(props: {
  view: DashboardTopbarView;
  leftAccessory?: React.ReactNode;
  rightAccessory?: React.ReactNode;
}): React.JSX.Element {
  const gridClassName = props.view.benchmarkAssetLabel
    ? 'sm:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto]'
    : 'sm:grid-cols-2 xl:grid-cols-3';

  return (
    <section className="rounded-b-[24px] rounded-t-none border border-[#E4D5C7] bg-[#EFE5DA] px-4 py-3 shadow-[0_12px_28px_rgba(68,46,21,0.08)] md:px-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        {props.leftAccessory ? <div className="shrink-0">{props.leftAccessory}</div> : null}
        <div className={`grid flex-1 gap-3 xl:pl-3 ${gridClassName}`}>
          {props.view.metrics.map((metric) => (
            <div key={metric.label}>
              {metric.positiveAssetsValue && metric.liabilitiesValue ? (
                <ExposureSplitValue
                  label={metric.label}
                  positiveAssetsValue={metric.positiveAssetsValue}
                  liabilitiesValue={metric.liabilitiesValue}
                  totalValue={metric.value}
                />
              ) : (
                <>
                  <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8C7F72]">
                    {metric.label}
                  </div>
                  <div
                    className={`mt-0.5 text-[18px] font-semibold tracking-[-0.04em] ${
                      metric.valueClassName ?? 'text-[#221A13]'
                    }`}
                  >
                    {metric.value}
                  </div>
                </>
              )}
            </div>
          ))}
          {props.view.benchmarkAssetLabel ? (
            <BenchmarkTeaserControl benchmarkAssetLabel={props.view.benchmarkAssetLabel} />
          ) : null}
        </div>
        {props.rightAccessory ? <div className="ml-auto">{props.rightAccessory}</div> : null}
      </div>
    </section>
  );
}
