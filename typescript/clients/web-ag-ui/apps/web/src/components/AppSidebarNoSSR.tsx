'use client';

import dynamic from 'next/dynamic';

const AppSidebar = dynamic(
  async () => {
    const mod = await import('./AppSidebar');
    return mod.AppSidebar;
  },
  { ssr: false },
);

export function AppSidebarNoSSR() {
  return <AppSidebar />;
}
