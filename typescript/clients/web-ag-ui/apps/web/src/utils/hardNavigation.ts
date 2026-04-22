import type { MouseEvent } from 'react';

type HardNavigationOptions = {
  replace?: boolean;
};

export function navigateToHref(href: string, options?: HardNavigationOptions): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (options?.replace) {
    window.location.replace(href);
    return;
  }

  window.location.assign(href);
}

export function handleHardNavigationClick(
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
  options?: HardNavigationOptions,
): void {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  const target = event.currentTarget.target;
  if (target && target !== '_self') {
    return;
  }

  if (event.currentTarget.hasAttribute('download')) {
    return;
  }

  event.preventDefault();
  navigateToHref(href, options);
}
