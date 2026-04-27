'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, SlidersHorizontal } from 'lucide-react';
import {
  analyzeMockWallet,
  PRE_APP_PROTOTYPE_BACKEND_RULE,
  recommendMockPortfolioShapes,
  type RiskAppetite,
} from '@/prototypes/preAppMockBackend';

const RISK_OPTIONS: Array<{ id: RiskAppetite; label: string; copy: string }> = [
  { id: 'resting', label: 'Resting', copy: 'Protect cash and avoid noisy rotation.' },
  { id: 'balanced', label: 'Balanced', copy: 'Earn yield while keeping room for conviction.' },
  { id: 'bullish', label: 'Bullish', copy: 'Lean into upside with tighter supervision.' },
];

export function PreAppOnboardingPrototype(props: { walletAddress: string }) {
  const [riskAppetite, setRiskAppetite] = useState<RiskAppetite>('balanced');
  const analysis = useMemo(() => analyzeMockWallet(props.walletAddress), [props.walletAddress]);
  const shapes = useMemo(
    () => recommendMockPortfolioShapes(analysis, riskAppetite),
    [analysis, riskAppetite],
  );
  const [selectedShapeId, setSelectedShapeId] = useState(shapes[0]?.id ?? 'steady-carry');
  const selectedShape = shapes.find((shape) => shape.id === selectedShapeId) ?? shapes[0];

  return (
    <section className="mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-7xl flex-col px-5 py-8 md:px-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#9c6b4c]">
            Onboarding prototype
          </p>
          <h1 className="mt-3 max-w-[13ch] text-4xl font-semibold leading-none tracking-normal text-[#241813] md:text-6xl">
            Pick the default posture.
          </h1>
        </div>
        <Link
          href="/sign-up"
          className="rounded-lg border border-[#d8c3ad] bg-[#fffaf4] px-4 py-2 text-sm font-medium text-[#4d392d] transition hover:border-[#fd6731]"
        >
          Change wallet
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.76fr_1.24fr]">
        <aside className="space-y-4 rounded-[1.25rem] border border-[#dfc9b4] bg-[#fffaf4] p-5">
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="h-5 w-5 text-[#fd6731]" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-[#241813]">Risk appetite</p>
              <p className="text-xs text-[#7a6655]">This combines with the wallet read.</p>
            </div>
          </div>
          <div className="space-y-2">
            {RISK_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setRiskAppetite(option.id)}
                className={`w-full rounded-lg border p-3 text-left transition active:translate-y-px ${
                  riskAppetite === option.id
                    ? 'border-[#fd6731] bg-[#fff2e9]'
                    : 'border-[#ead8c5] bg-white/70 hover:border-[#d8c3ad]'
                }`}
              >
                <span className="block text-sm font-semibold text-[#241813]">{option.label}</span>
                <span className="mt-1 block text-xs leading-5 text-[#6d5948]">{option.copy}</span>
              </button>
            ))}
          </div>
          <div className="rounded-lg border border-[#ead8c5] bg-white/70 p-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#8b745f]">
              Wallet signal
            </p>
            <p className="mt-2 text-sm leading-6 text-[#4d392d]">
              {analysis.stableShare}% stable, {analysis.volatileShare}% volatile,{' '}
              {analysis.activityLevel} activity.
            </p>
          </div>
        </aside>

        <div className="grid gap-4 md:grid-cols-2">
          {shapes.map((shape) => (
            <button
              key={shape.id}
              type="button"
              onClick={() => setSelectedShapeId(shape.id)}
              className={`rounded-[1.25rem] border bg-[#fffaf4] p-5 text-left transition hover:-translate-y-0.5 ${
                selectedShape?.id === shape.id ? 'border-[#fd6731]' : 'border-[#dfc9b4]'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xl font-semibold text-[#241813]">{shape.title}</p>
                  <p className="mt-2 text-sm leading-6 text-[#6d5948]">{shape.posture}</p>
                </div>
                {selectedShape?.id === shape.id ? (
                  <Check className="h-5 w-5 text-[#fd6731]" aria-hidden="true" />
                ) : null}
              </div>
              <div className="mt-5 space-y-3">
                {shape.allocation.map((item) => (
                  <div key={item.label}>
                    <div className="mb-1 flex justify-between text-xs font-medium text-[#5c4334]">
                      <span>{item.label}</span>
                      <span>{item.percent}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#ead8c5]">
                      <div
                        className="h-full rounded-full bg-[#fd6731]"
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm leading-6 text-[#4d392d]">{shape.defaultMandate}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[1.25rem] border border-[#dfc9b4] bg-[#241813] p-5 text-white">
        <div>
          <p className="text-sm text-white/70">Selected default</p>
          <p className="mt-1 text-lg font-semibold">{selectedShape?.title}</p>
          <p className="mt-1 max-w-[68ch] text-xs leading-5 text-white/55">
            {PRE_APP_PROTOTYPE_BACKEND_RULE}
          </p>
        </div>
        <Link
          href="/hire-agents/agent-portfolio-manager?__uiState=onboarding&__fixture=managed&tab=chat"
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#fd6731] px-4 text-sm font-semibold text-white transition hover:bg-[#ee5d28] active:translate-y-px"
        >
          Use this default
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
