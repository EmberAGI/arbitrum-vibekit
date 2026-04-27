'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowRight, WalletCards } from 'lucide-react';
import { analyzeMockWallet, normalizePrototypeWallet } from '@/prototypes/preAppMockBackend';

export function PreAppSignupPrototype() {
  const [walletAddress, setWalletAddress] = useState('');
  const analysis = useMemo(() => analyzeMockWallet(normalizePrototypeWallet(walletAddress)), [walletAddress]);
  const onboardingHref = `/onboarding?wallet=${encodeURIComponent(analysis.walletAddress)}`;

  return (
    <section className="mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-6xl flex-col px-5 py-10 md:px-10">
      <div className="grid flex-1 items-center gap-8 lg:grid-cols-[0.88fr_1.12fr]">
        <div className="space-y-8">
          <Link
            href="/"
            className="inline-flex text-sm font-medium text-[#6d5948] transition hover:text-[#2d1b13]"
          >
            Back to home
          </Link>
          <div className="space-y-5">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#9c6b4c]">
              Wallet sign up prototype
            </p>
            <h1 className="max-w-[11ch] text-4xl font-semibold leading-none tracking-normal text-[#241813] md:text-6xl">
              Start with what is already in the wallet.
            </h1>
            <p className="max-w-[58ch] text-base leading-7 text-[#6d5948]">
              Connect or paste a wallet, let Ember read the visible balances and recent
              history, then choose how assertive the first portfolio default should be.
            </p>
          </div>
          <label className="block max-w-xl space-y-2">
            <span className="text-sm font-medium text-[#3f2a20]">Wallet address</span>
            <input
              value={walletAddress}
              onChange={(event) => setWalletAddress(event.target.value)}
              placeholder="0x..."
              className="h-12 w-full rounded-lg border border-[#d8c3ad] bg-[#fffaf4] px-4 font-mono text-sm text-[#241813] outline-none transition focus:border-[#fd6731]"
            />
            <span className="block text-xs text-[#7a6655]">
              Prototype mode uses a deterministic sample when this field is empty.
            </span>
          </label>
        </div>

        <div className="rounded-[1.25rem] border border-[#dfc9b4] bg-[#fffaf4] p-5 shadow-[0_18px_45px_-30px_rgba(75,45,24,0.45)] md:p-7">
          <div className="mb-7 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[#7a6655]">Wallet read</p>
              <p className="mt-1 font-mono text-sm text-[#241813]">{analysis.walletAddress}</p>
            </div>
            <WalletCards className="h-6 w-6 text-[#fd6731]" aria-hidden="true" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Stable" value={`${analysis.stableShare}%`} />
            <Metric label="Volatile" value={`${analysis.volatileShare}%`} />
            <Metric label="Activity" value={analysis.activityLevel} />
          </div>
          <div className="mt-7 space-y-3">
            {analysis.notes.map((note) => (
              <div key={note} className="flex gap-3 rounded-lg border border-[#ead8c5] bg-white/70 p-3">
                <Activity className="mt-0.5 h-4 w-4 shrink-0 text-[#fd6731]" aria-hidden="true" />
                <p className="text-sm leading-6 text-[#4d392d]">{note}</p>
              </div>
            ))}
          </div>
          <div className="mt-7 flex flex-wrap gap-2">
            {analysis.detectedProtocols.map((protocol) => (
              <span
                key={protocol}
                className="rounded-md border border-[#e5d0bc] bg-[#f8efe6] px-3 py-1 text-xs font-medium text-[#5c4334]"
              >
                {protocol}
              </span>
            ))}
          </div>
          <Link
            href={onboardingHref}
            className="mt-8 inline-flex h-11 items-center gap-2 rounded-lg bg-[#241813] px-4 text-sm font-semibold text-white transition hover:bg-[#3a2519] active:translate-y-px"
          >
            Continue
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#ead8c5] bg-white/70 p-3">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#8b745f]">
        {props.label}
      </p>
      <p className="mt-2 text-xl font-semibold text-[#241813]">{props.value}</p>
    </div>
  );
}
