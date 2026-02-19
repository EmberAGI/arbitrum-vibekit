import React from 'react';

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded bg-[#2a2a2a] ${className ?? ''}`}
      aria-hidden="true"
    />
  );
}

