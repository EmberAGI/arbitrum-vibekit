import Link from 'next/link';
import { ArrowRight, CircleDot, PiggyBank } from 'lucide-react';

export default function HomePage() {
  return (
    <section className="mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-6xl flex-col px-5 py-10 md:px-10">
      <div className="grid flex-1 items-center gap-10 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-7">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#9c6b4c]">
            Ember
          </p>
          <h1 className="max-w-[12ch] text-4xl font-semibold leading-none tracking-normal text-[#241813] md:text-6xl">
            Make the wallet work before you sell.
          </h1>
          <p className="max-w-[56ch] text-base leading-7 text-[#6d5948]">
            Ember reads what you already hold, finds idle capital, and turns the first
            setup into a money plan: earn yield, borrow against conviction, and avoid
            forced selling when you need liquidity.
          </p>
          <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
            <ValuePill label="Make" value="Put idle stables into yield first." />
            <ValuePill label="Save" value="Use lending to avoid selling into taxes or slippage." />
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/sign-up"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#241813] px-4 text-sm font-semibold text-white transition hover:bg-[#3a2519] active:translate-y-px"
            >
              Start
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/hire-agents"
              className="inline-flex h-11 items-center rounded-lg border border-[#d8c3ad] bg-[#fffaf4] px-4 text-sm font-semibold text-[#3f2a20] transition hover:border-[#fd6731] active:translate-y-px"
            >
              Skip to agents
            </Link>
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-[#dfc9b4] bg-[#fffaf4] p-5 shadow-[0_18px_45px_-30px_rgba(75,45,24,0.45)] md:p-7">
          <div className="space-y-4">
            {[
              ['Find yield', 'Spot the cash and stablecoins that can start earning.'],
              ['Preserve winners', 'Borrow alongside assets instead of selling conviction positions.'],
              ['Default the plan', 'Turn risk appetite into an agent-ready portfolio shape.'],
            ].map(([title, copy], index) => (
              <div key={title} className="flex gap-4 rounded-lg border border-[#ead8c5] bg-white/70 p-4">
                <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-[#fd6731]" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-[#241813]">
                    {index + 1}. {title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[#6d5948]">{copy}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ValuePill(props: { label: string; value: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-[#ead8c5] bg-[#fffaf4] p-3">
      <PiggyBank className="mt-0.5 h-4 w-4 shrink-0 text-[#fd6731]" aria-hidden="true" />
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9c6b4c]">
          {props.label}
        </p>
        <p className="mt-1 text-sm leading-5 text-[#4d392d]">{props.value}</p>
      </div>
    </div>
  );
}
