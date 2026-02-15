/* eslint-disable @next/next/no-img-element */

import { Check } from 'lucide-react';

type CreatorIdentityProps = {
  name: string;
  verified?: boolean;
  size?: 'sm' | 'md';
  nameClassName?: string;
};

function isEmberTeam(name: string): boolean {
  return name.trim().toLowerCase() === 'ember ai team';
}

export function CreatorIdentity({
  name,
  verified = false,
  size = 'sm',
  nameClassName,
}: CreatorIdentityProps) {
  const emberTeam = isEmberTeam(name);

  const iconSizeClass = size === 'md' ? 'h-5 w-5' : 'h-4 w-4';
  const logoSizeClass = size === 'md' ? 'h-4 w-4' : 'h-3 w-3';
  const overlayCheckWrapClass = size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3';
  const overlayCheckIconClass = size === 'md' ? 'h-2.5 w-2.5' : 'h-2 w-2';
  const inlineCheckWrapClass = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  const inlineCheckIconClass = size === 'md' ? 'h-2.5 w-2.5' : 'h-2.5 w-2.5';

  return (
    <span className="inline-flex items-center gap-1.5">
      {emberTeam ? (
        <span className="relative inline-flex" aria-hidden="true">
          <span
            className={[
              'inline-flex items-center justify-center rounded-full ring-1 ring-white/10',
              iconSizeClass,
              'bg-[#fd6731]',
            ].join(' ')}
          >
            <img src="/ember-logo.svg" alt="" className={logoSizeClass} />
          </span>

          {verified ? (
            <span
              className={[
                'absolute -right-1 -top-1 inline-flex items-center justify-center rounded-full',
                'bg-[#3b82f6] ring-2 ring-[#121212]',
                overlayCheckWrapClass,
              ].join(' ')}
            >
              <Check
                className={[overlayCheckIconClass, 'text-white'].join(' ')}
                strokeWidth={3}
              />
            </span>
          ) : null}
        </span>
      ) : null}

      <span className={nameClassName ?? 'text-white'}>{name}</span>

      {verified && !emberTeam ? (
        <span
          className={[
            'inline-flex items-center justify-center rounded-full bg-[#3b82f6] ring-1 ring-white/10',
            inlineCheckWrapClass,
          ].join(' ')}
          aria-hidden="true"
        >
          <Check className={[inlineCheckIconClass, 'text-white'].join(' ')} strokeWidth={3} />
        </span>
      ) : null}
    </span>
  );
}
