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

export function PortfolioDashboardTopBar(props: {
  view: DashboardTopbarView;
}): React.JSX.Element {
  return (
    <section className="rounded-[24px] border border-[#E4D5C7] bg-[#EFE5DA] px-4 py-3 shadow-[0_12px_28px_rgba(68,46,21,0.08)] md:px-5">
      <div className="flex items-center justify-between gap-4">
        <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8C7F72]">
          Portfolio
        </div>
        {props.view.benchmarkAssetLabel ? (
          <div className="inline-flex items-center gap-2.5 rounded-full border border-[#D7C5B4] bg-[#F8EFE5] px-2.5 py-1.5">
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8C7F72]">
              Benchmark
            </span>
            <span className="inline-flex items-center gap-1.5">
              <DashboardTokenAvatar symbol={props.view.benchmarkAssetLabel} fallbackSymbol={props.view.benchmarkAssetLabel} small />
              <span className="text-[12px] font-semibold tracking-[-0.02em] text-[#221A13]">
                {props.view.benchmarkAssetLabel}
              </span>
            </span>
          </div>
        ) : null}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
      </div>
    </section>
  );
}
