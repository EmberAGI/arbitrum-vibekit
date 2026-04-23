'use client';

import { useEffect } from 'react';

import { navigateToHref } from '@/utils/hardNavigation';

export default function HomePage() {
  useEffect(() => {
    navigateToHref('/hire-agents', { replace: true });
  }, []);

  return null;
}
