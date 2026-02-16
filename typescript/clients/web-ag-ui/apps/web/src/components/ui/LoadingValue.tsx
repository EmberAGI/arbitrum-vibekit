import React from 'react';

import { Skeleton } from './Skeleton';

type LoadingValueProps = {
  isLoaded: boolean;
  value: React.ReactNode | null;
  skeletonClassName: string;
  loadedClassName?: string;
  missingClassName?: string;
  missingValue?: React.ReactNode;
};

export function LoadingValue({
  isLoaded,
  value,
  skeletonClassName,
  loadedClassName,
  missingClassName = 'text-gray-500',
  missingValue = '-',
}: LoadingValueProps) {
  if (!isLoaded) {
    return <Skeleton className={skeletonClassName} />;
  }

  if (value === null) {
    return <span className={missingClassName}>{missingValue}</span>;
  }

  return <span className={loadedClassName}>{value}</span>;
}

