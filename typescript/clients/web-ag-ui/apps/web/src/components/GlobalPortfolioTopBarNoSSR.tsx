'use client';

import dynamic from 'next/dynamic';

const GlobalPortfolioTopBar = dynamic(
  async () => {
    const mod = await import('./GlobalPortfolioTopBar');
    return mod.GlobalPortfolioTopBar;
  },
  {
    ssr: false,
  },
);

export function GlobalPortfolioTopBarNoSSR() {
  return <GlobalPortfolioTopBar />;
}
