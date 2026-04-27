import Link from 'next/link';
import { ArrowRight, CircleDot } from 'lucide-react';

export default function HomePage() {
  return (
    <section className="mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-6xl flex-col px-5 py-10 md:px-10">
      <div className="grid flex-1 items-center gap-10 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-7">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#9c6b4c]">
            Ember
          </p>
          <h1 className="max-w-[12ch] text-4xl font-semibold leading-none tracking-normal text-[#241813] md:text-6xl">
            A quiet place before the agents start.
          </h1>
          <p className="max-w-[56ch] text-base leading-7 text-[#6d5948]">
            Bring a wallet, read what is already there, and choose the portfolio posture
            you want Ember to start from. The app can stay calm until you are ready.
          </p>
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
              ['Home', 'Resting place, no decisions required.'],
              ['Sign up', 'Wallet contents and history are summarized.'],
              ['Onboarding', 'Risk appetite turns analysis into portfolio defaults.'],
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
