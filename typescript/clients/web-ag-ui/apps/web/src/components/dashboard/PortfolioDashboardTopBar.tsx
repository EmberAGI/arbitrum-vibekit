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
        <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8C7F72]">
          {props.totalValue}
        </div>
      </div>
      <div className="flex items-baseline gap-2 text-[16px] font-semibold tracking-[-0.04em]">
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

function BenchmarkTeaserControl(props: { benchmarkAssetLabel: string }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8C7F72]">Benchmark</div>
      <button
        type="button"
        title="Benchmark switching coming soon"
        aria-label={`Benchmark ${props.benchmarkAssetLabel}. Benchmark switching coming soon.`}
        className="group mt-1 inline-flex items-center gap-2.5 rounded-full border border-[#D7C5B4] bg-[#F8EFE5] px-2.5 py-1.5 text-left transition-colors hover:border-[#E8C9AA] hover:bg-[#FFF7F2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8C9AA] focus-visible:ring-offset-2 focus-visible:ring-offset-[#EFE5DA]"
      >
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
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#B07A52] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          Soon
        </span>
      </button>
    </div>
  );
}

export function PortfolioDashboardTopBar(props: {
  view: DashboardTopbarView;
}): React.JSX.Element {
  const gridClassName = props.view.benchmarkAssetLabel ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2 xl:grid-cols-3';

  return (
    <section className="rounded-[24px] border border-[#E4D5C7] bg-[#EFE5DA] px-4 py-3 shadow-[0_12px_28px_rgba(68,46,21,0.08)] md:px-5">
      <div className={`grid gap-3 ${gridClassName}`}>
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
                  className={`mt-0.5 text-[16px] font-semibold tracking-[-0.04em] ${
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
    </section>
  );
}
