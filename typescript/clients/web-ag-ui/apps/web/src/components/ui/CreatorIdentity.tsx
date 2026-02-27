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

  const logoSizeClass = size === 'md' ? 'h-3.5 w-auto object-contain' : 'h-3 w-auto object-contain';
  const inlineCheckWrapClass = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  const inlineCheckIconClass = size === 'md' ? 'h-2.5 w-2.5' : 'h-2.5 w-2.5';
  const emberWrapClass = size === 'md' ? 'h-5 w-5' : 'h-4 w-4';

  return (
    <span className="inline-flex items-center gap-1.5">
      {emberTeam ? (
        <span
          className={[
            'inline-flex items-center justify-center rounded-full ring-1 ring-black/10 bg-white',
            emberWrapClass,
          ].join(' ')}
          aria-hidden="true"
        >
          <img src="/ember-by-tag-logo.png" alt="" className={logoSizeClass} />
        </span>
      ) : null}

      <span className={nameClassName ?? 'text-white'}>{name}</span>

      {verified ? (
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
