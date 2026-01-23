'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';

const Providers = dynamic(async () => (await import('./Providers')).Providers, { ssr: false });

export function ProvidersNoSSR({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}
