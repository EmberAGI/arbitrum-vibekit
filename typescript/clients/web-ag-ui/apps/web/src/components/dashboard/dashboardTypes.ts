import type { CSSProperties } from 'react';

export type DashboardTopbarMetric = {
  label: string;
  value: string;
  valueClassName?: string;
  positiveAssetsValue?: string;
  liabilitiesValue?: string;
};

export type DashboardTopbarView = {
  benchmarkAssetLabel?: string;
  metrics: DashboardTopbarMetric[];
};

export type DashboardAccountingSegmentView = {
  label: string;
  valueUsd: number;
  meter: string;
  fillClassName: string;
  valueClassName: string;
  detail?: string;
};

export type DashboardAccountingStatView = {
  label: string;
  value: string;
  valueClassName?: string;
};

export type DashboardAccountingView = {
  segments: DashboardAccountingSegmentView[];
  stats: DashboardAccountingStatView[];
};

export type DashboardTreemapItem = {
  id: string;
  value: number;
  label: string;
  subtitle?: string;
  iconSymbol?: string;
  fallbackIconSymbol?: string;
  valueLabel: string;
  shareLabel?: string;
  assetClass?: 'asset' | 'cash' | 'position';
  positionAccent?: 'dark' | 'mint' | 'liability';
  toneStyle?: CSSProperties;
  hoverToneStyle?: CSSProperties;
  hoverChildren?: readonly DashboardTreemapItem[];
};
