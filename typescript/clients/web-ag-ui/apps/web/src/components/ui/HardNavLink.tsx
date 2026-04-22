'use client';

import type { AnchorHTMLAttributes, ReactNode } from 'react';

import { handleHardNavigationClick } from '@/utils/hardNavigation';

type HardNavLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
  replace?: boolean;
  children: ReactNode;
};

export function HardNavLink({ href, replace, onClick, children, ...rest }: HardNavLinkProps) {
  return (
    <a
      {...rest}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        handleHardNavigationClick(event, href, { replace });
      }}
    >
      {children}
    </a>
  );
}
