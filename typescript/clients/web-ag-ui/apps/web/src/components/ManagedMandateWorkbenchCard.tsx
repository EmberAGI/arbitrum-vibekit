import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { ManagedMandateInput } from '../types/agent';
import {
  buildManagedLendingPolicy,
  DEFAULT_MANAGED_LENDING_COLLATERAL_ASSET,
  DEFAULT_MANAGED_LENDING_MAX_ALLOCATION_PCT,
  DEFAULT_MANAGED_LENDING_MAX_LTV_BPS,
  DEFAULT_MANAGED_LENDING_MIN_HEALTH_FACTOR,
  DEFAULT_MANAGED_MANDATE_TOKEN_CHOICES,
  normalizeManagedMandateAssetSymbol,
  parseManagedMandateAssetList,
  readManagedLendingBorrowAssets,
  readManagedLendingCollateralPolicies,
  readManagedLendingRiskPolicy,
} from '../utils/managedMandate';
import {
  iconMonogram,
  proxyIconUri,
  resolveTokenIconUri,
} from '../utils/iconResolution';

export type ManagedMandateWorkbenchView = {
  ownerAgentId: string;
  targetAgentId: string;
  targetAgentRouteId: string;
  mandateRef: string | null;
  managedMandate: Record<string, unknown> | null;
};

export type ManagedMandateWorkbenchSubmitInput = {
  ownerAgentId: string;
  targetAgentId: string;
  targetAgentRouteId: string;
  managedMandate: ManagedMandateInput;
};

function buildUpdatedManagedMandate(params: {
  existingManagedMandate: Record<string, unknown> | null;
  collateralPolicies: ManagedMandateInput['lending_policy']['collateral_policy']['assets'];
  allowedBorrowAssets: string[];
  maxLtvBps?: number;
  minHealthFactor?: string;
}): ManagedMandateInput {
  return {
    lending_policy: buildManagedLendingPolicy({
      existingManagedMandate: params.existingManagedMandate,
      collateralPolicies: params.collateralPolicies,
      allowedBorrowAssets: params.allowedBorrowAssets,
      maxLtvBps: params.maxLtvBps,
      minHealthFactor: params.minHealthFactor,
    }),
  };
}

function readCommaSeparatedSegments(value: string): string[] {
  return value
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function buildManagedLendingCollateralPoliciesFromSeparatedInputs(params: {
  assetsInput: string;
  maxAllocationPctsInput: string;
  fallbackMaxAllocationPct: number;
}): ManagedMandateInput['lending_policy']['collateral_policy']['assets'] {
  const assets = parseManagedMandateAssetList(params.assetsInput);
  const maxAllocationPcts = readCommaSeparatedSegments(params.maxAllocationPctsInput);

  return assets.map((asset, index) => {
    const parsedMaxAllocationPct = Number(maxAllocationPcts[index] ?? '');

    return {
      asset,
      max_allocation_pct: Number.isFinite(parsedMaxAllocationPct)
        ? parsedMaxAllocationPct
        : params.fallbackMaxAllocationPct,
    };
  });
}

function formatManagedMandatePercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatManagedMandateHealthFactor(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function formatLtvPctFromBps(value: number): string {
  const normalizedPercent = value / 100;
  return Number.isInteger(normalizedPercent)
    ? String(normalizedPercent)
    : normalizedPercent.toFixed(2).replace(/\.?0+$/, '');
}

function parseLtvPctToBps(value: string): number | null {
  const parsedPercent = Number(value.trim());
  if (!Number.isFinite(parsedPercent)) {
    return null;
  }

  return Math.round(parsedPercent * 100);
}

function ManagedMandateTokenIcon(props: {
  symbol: string;
  tokenIconBySymbol: Record<string, string>;
  sizeClassName?: string;
}) {
  const iconUri = resolveTokenIconUri({
    symbol: props.symbol,
    tokenIconBySymbol: props.tokenIconBySymbol,
  });

  if (iconUri) {
    return (
      <img
        src={proxyIconUri(iconUri)}
        alt=""
        loading="lazy"
        decoding="async"
        className={`${props.sizeClassName ?? 'h-5 w-5'} rounded-full bg-[#f1e4d3] ring-1 ring-[#eadac7] object-contain`}
      />
    );
  }

  return (
    <span
      className={`${props.sizeClassName ?? 'h-5 w-5'} inline-flex items-center justify-center rounded-full bg-[#fff7ef] ring-1 ring-[#eadac7] text-[8px] font-semibold text-[#7c6757]`}
      aria-hidden="true"
    >
      {iconMonogram(props.symbol)}
    </span>
  );
}

function ManagedMandateInlineFieldButton(props: {
  ariaLabel: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.ariaLabel}
      aria-pressed={props.active}
      aria-expanded={props.active}
      aria-haspopup="dialog"
      onClick={props.onClick}
      className={`inline-flex items-center gap-1.5 rounded-[14px] border px-2.5 py-0.5 align-middle text-left text-[0.88rem] font-medium transition ${
        props.active
          ? 'border-[#fd6731]/40 bg-[#fff0e6] text-[#2f2118] shadow-[0_0_0_1px_rgba(253,103,49,0.10)]'
          : 'border-[#eadac7] bg-[#fffdf8] text-[#503826] hover:border-[#fd6731]/30 hover:bg-[#fff7ed]'
      }`}
    >
      {props.children}
    </button>
  );
}

function ManagedMandateInlinePopoverField(props: {
  ariaLabel: string;
  active: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: ReactNode;
  popover: ReactNode;
  align?: 'start' | 'end';
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!props.active) {
      setPopoverStyle(null);
      return;
    }

    const updatePosition = () => {
      if (!rootRef.current || !popoverRef.current) {
        return;
      }

      const viewportPadding = 16;
      const anchorGap = 10;
      const anchorRect = rootRef.current.getBoundingClientRect();
      const popoverRect = popoverRef.current.getBoundingClientRect();
      const desiredLeft =
        props.align === 'end' ? anchorRect.right - popoverRect.width : anchorRect.left;
      const maxLeft = Math.max(
        viewportPadding,
        window.innerWidth - viewportPadding - popoverRect.width,
      );
      const clampedLeft = Math.min(
        Math.max(desiredLeft, viewportPadding),
        maxLeft,
      );
      const belowTop = anchorRect.bottom + anchorGap;
      const aboveTop = anchorRect.top - anchorGap - popoverRect.height;
      const preferredTop =
        belowTop + popoverRect.height <= window.innerHeight - viewportPadding || aboveTop < viewportPadding
          ? belowTop
          : aboveTop;
      const maxTop = Math.max(
        viewportPadding,
        window.innerHeight - viewportPadding - popoverRect.height,
      );
      const clampedTop = Math.min(
        Math.max(preferredTop, viewportPadding),
        maxTop,
      );

      setPopoverStyle({
        top: clampedTop,
        left: clampedLeft,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [props.active, props.align]);

  useEffect(() => {
    if (!props.active) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      props.onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        props.onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [props.active, props.onClose]);

  return (
    <div ref={rootRef} className="relative mx-0.5 inline-flex align-middle">
      <ManagedMandateInlineFieldButton
        ariaLabel={props.ariaLabel}
        active={props.active}
        onClick={props.onToggle}
      >
        {props.children}
      </ManagedMandateInlineFieldButton>
      {props.active ? (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={props.ariaLabel}
          style={
            popoverStyle
              ? {
                  top: popoverStyle.top,
                  left: popoverStyle.left,
                }
              : undefined
          }
          className="fixed z-30 w-[min(22rem,calc(100vw-1.5rem))] rounded-[20px] border border-[#eadac7] bg-[#fffdf8]/98 p-3 shadow-[0_18px_44px_rgba(115,78,48,0.16)] backdrop-blur-sm"
        >
          {props.popover}
        </div>
      ) : null}
    </div>
  );
}

function ManagedMandateTokenStackValue(props: {
  tokens: string[];
  tokenIconBySymbol: Record<string, string>;
  maxVisible?: number;
}) {
  const visibleTokens = props.tokens.slice(0, props.maxVisible ?? 4);
  const hiddenTokenCount = Math.max(props.tokens.length - visibleTokens.length, 0);

  return (
    <span className="inline-flex items-center">
      {visibleTokens.map((symbol, index) => (
        <span
          key={`${symbol}-${index}`}
          className={index === 0 ? 'inline-flex' : '-ml-2 inline-flex'}
        >
          <ManagedMandateTokenIcon
            symbol={symbol}
            tokenIconBySymbol={props.tokenIconBySymbol}
            sizeClassName="h-5 w-5"
          />
        </span>
      ))}
      {hiddenTokenCount > 0 ? (
        <span className="-ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#fff7ef] px-1.5 text-[9px] font-semibold text-[#7c6757] ring-1 ring-[#eadac7]">
          +{hiddenTokenCount}
        </span>
      ) : null}
    </span>
  );
}

function ManagedMandateTokenListValue(props: {
  tokens: string[];
  tokenIconBySymbol: Record<string, string>;
  emptyLabel: string;
}) {
  if (props.tokens.length === 0) {
    return <span className="text-[#9b826f]">{props.emptyLabel}</span>;
  }

  if (props.tokens.length > 1) {
    return (
      <ManagedMandateTokenStackValue
        tokens={props.tokens}
        tokenIconBySymbol={props.tokenIconBySymbol}
      />
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {props.tokens.map((symbol) => (
        <span key={symbol} className="inline-flex items-center gap-1.5 text-[#261a12]">
          <ManagedMandateTokenIcon symbol={symbol} tokenIconBySymbol={props.tokenIconBySymbol} />
          <span>{symbol}</span>
        </span>
      ))}
    </span>
  );
}

function ManagedMandateInlineTextValue(props: {
  value: string;
  emptyLabel?: string;
}) {
  return (
    <span className={props.value.trim().length > 0 ? 'text-[#261a12]' : 'text-[#9b826f]'}>
      {props.value.trim().length > 0 ? props.value : props.emptyLabel ?? 'unset'}
    </span>
  );
}

function ManagedMandateCollateralPolicyValue(props: {
  assets: string[];
  allocationPcts: number[];
  tokenIconBySymbol: Record<string, string>;
  emptyLabel: string;
}) {
  if (props.assets.length === 0) {
    return <span className="text-[#9b826f]">{props.emptyLabel}</span>;
  }

  if (props.assets.length > 1) {
    return (
      <ManagedMandateTokenStackValue
        tokens={props.assets}
        tokenIconBySymbol={props.tokenIconBySymbol}
      />
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {props.assets.map((asset, index) => (
        <span key={asset} className="inline-flex items-center gap-1.5 text-[#261a12]">
          <ManagedMandateTokenIcon symbol={asset} tokenIconBySymbol={props.tokenIconBySymbol} />
          <span>
            {asset} {formatManagedMandatePercent(
              props.allocationPcts[index] ?? DEFAULT_MANAGED_LENDING_MAX_ALLOCATION_PCT,
            )}
          </span>
        </span>
      ))}
    </span>
  );
}

function ManagedMandateTokenToggleButton(props: {
  symbol: string;
  selected: boolean;
  onToggle: () => void;
  tokenIconBySymbol: Record<string, string>;
}) {
  return (
    <button
      type="button"
      aria-label={`Toggle token ${props.symbol}`}
      aria-pressed={props.selected}
      onClick={props.onToggle}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-medium transition ${
        props.selected
          ? 'border-[#fd6731]/40 bg-[#fff0e6] text-[#2f2118]'
          : 'border-[#eadac7] bg-[#fffdf8] text-[#503826] hover:border-[#fd6731]/30 hover:bg-[#fff7ed]'
      }`}
    >
      <ManagedMandateTokenIcon symbol={props.symbol} tokenIconBySymbol={props.tokenIconBySymbol} />
      <span>{props.symbol}</span>
    </button>
  );
}

function ManagedMandateSliderControl(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueLabel: string;
  onChange: (nextValue: number) => void;
  tokenSymbol?: string;
  tokenIconBySymbol?: Record<string, string>;
  inputName: string;
}) {
  return (
    <label className="block rounded-[16px] border border-[#eadac7] bg-[#fffaf2] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-[13px] font-medium text-[#503826]">
          {props.tokenSymbol && props.tokenIconBySymbol ? (
            <ManagedMandateTokenIcon
              symbol={props.tokenSymbol}
              tokenIconBySymbol={props.tokenIconBySymbol}
            />
          ) : null}
          <span>{props.label}</span>
        </div>
        <span className="rounded-full bg-[#fff0e6] px-2 py-0.5 text-[13px] text-[#b84f2c] ring-1 ring-[#f3d5c5]">
          {props.valueLabel}
        </span>
      </div>
      <input
        name={props.inputName}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
        className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-[#eadac7] accent-[#fd6731]"
      />
    </label>
  );
}

export function ManagedMandateWorkbenchCard(props: {
  view: ManagedMandateWorkbenchView;
  availableTokenSymbols?: string[];
  tokenIconBySymbolOverride?: Record<string, string>;
  onSave?: (input: ManagedMandateWorkbenchSubmitInput) => Promise<void> | void;
  submitLabel?: string;
  chrome?: 'card' | 'plain';
}) {
  const initialCollateralPolicies = readManagedLendingCollateralPolicies(props.view.managedMandate);
  const normalizedInitialCollateralPolicies =
    initialCollateralPolicies.length > 0
      ? initialCollateralPolicies
      : [
          {
            asset: DEFAULT_MANAGED_LENDING_COLLATERAL_ASSET,
            max_allocation_pct: DEFAULT_MANAGED_LENDING_MAX_ALLOCATION_PCT,
          },
        ];
  const initialCollateralAssetsValue = normalizedInitialCollateralPolicies
    .map((policy) => policy.asset)
    .join(', ');
  const initialCollateralAllocationPctsValue = normalizedInitialCollateralPolicies
    .map((policy) => String(policy.max_allocation_pct))
    .join(', ');
  const initialAllowedBorrowAssets = readManagedLendingBorrowAssets(props.view.managedMandate);
  const initialAllowedBorrowAssetsValue = initialAllowedBorrowAssets.join(', ');
  const initialRiskPolicy = readManagedLendingRiskPolicy(props.view.managedMandate);
  const [collateralAssetsInput, setCollateralAssetsInput] = useState(
    initialCollateralAssetsValue,
  );
  const [collateralAllocationPctsInput, setCollateralAllocationPctsInput] = useState(
    initialCollateralAllocationPctsValue,
  );
  const [allowedBorrowAssetsInput, setAllowedBorrowAssetsInput] = useState(
    initialAllowedBorrowAssetsValue,
  );
  const [maxLtvPctInput, setMaxLtvPctInput] = useState(
    formatLtvPctFromBps(initialRiskPolicy.maxLtvBps ?? DEFAULT_MANAGED_LENDING_MAX_LTV_BPS),
  );
  const [minHealthFactorInput, setMinHealthFactorInput] = useState(
    initialRiskPolicy.minHealthFactor ?? DEFAULT_MANAGED_LENDING_MIN_HEALTH_FACTOR,
  );
  const [activeEditor, setActiveEditor] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCollateralAssetsInput(initialCollateralAssetsValue);
    setCollateralAllocationPctsInput(initialCollateralAllocationPctsValue);
    setAllowedBorrowAssetsInput(initialAllowedBorrowAssetsValue);
    setMaxLtvPctInput(
      formatLtvPctFromBps(initialRiskPolicy.maxLtvBps ?? DEFAULT_MANAGED_LENDING_MAX_LTV_BPS),
    );
    setMinHealthFactorInput(
      initialRiskPolicy.minHealthFactor ?? DEFAULT_MANAGED_LENDING_MIN_HEALTH_FACTOR,
    );
    setActiveEditor(null);
    setSubmitError(null);
  }, [
    initialAllowedBorrowAssetsValue,
    initialCollateralAllocationPctsValue,
    initialCollateralAssetsValue,
    initialRiskPolicy.maxLtvBps,
    initialRiskPolicy.minHealthFactor,
    props.view.mandateRef,
  ]);

  const collateralAssets = useMemo(
    () => parseManagedMandateAssetList(collateralAssetsInput),
    [collateralAssetsInput],
  );
  const collateralAllocationPctSegments = useMemo(
    () => readCommaSeparatedSegments(collateralAllocationPctsInput),
    [collateralAllocationPctsInput],
  );
  const collateralAllocationPcts = useMemo(
    () =>
      collateralAssets.map((_, index) => {
        const parsed = Number(collateralAllocationPctSegments[index] ?? '');
        return Number.isFinite(parsed)
          ? parsed
          : DEFAULT_MANAGED_LENDING_MAX_ALLOCATION_PCT;
      }),
    [collateralAllocationPctSegments, collateralAssets],
  );
  const allowedBorrowAssets = useMemo(
    () => parseManagedMandateAssetList(allowedBorrowAssetsInput),
    [allowedBorrowAssetsInput],
  );
  const hasBorrowAssets = allowedBorrowAssets.length > 0;
  const maxLtvPctValue = useMemo(() => {
    const parsed = Number(maxLtvPctInput.trim());
    return Number.isFinite(parsed)
      ? parsed
      : Number(formatLtvPctFromBps(DEFAULT_MANAGED_LENDING_MAX_LTV_BPS));
  }, [maxLtvPctInput]);
  const minHealthFactorValue = useMemo(() => {
    const parsed = Number(minHealthFactorInput.trim());
    return Number.isFinite(parsed)
      ? parsed
      : Number(DEFAULT_MANAGED_LENDING_MIN_HEALTH_FACTOR);
  }, [minHealthFactorInput]);
  const availableTokenSymbols = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (symbol: string) => {
      const normalized = normalizeManagedMandateAssetSymbol(symbol);
      if (normalized.length === 0 || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      out.push(normalized);
    };

    for (const symbol of DEFAULT_MANAGED_MANDATE_TOKEN_CHOICES) {
      push(symbol);
    }
    for (const symbol of props.availableTokenSymbols ?? []) {
      push(symbol);
    }
    for (const symbol of collateralAssets) {
      push(symbol);
    }
    for (const symbol of allowedBorrowAssets) {
      push(symbol);
    }

    return out;
  }, [allowedBorrowAssets, collateralAssets, props.availableTokenSymbols]);
  const tokenIconBySymbol = props.tokenIconBySymbolOverride ?? {};

  const setCollateralSelection = (nextAssets: string[]) => {
    const currentCapsByAsset = new Map<string, number>();
    collateralAssets.forEach((asset, index) => {
      currentCapsByAsset.set(
        asset,
        collateralAllocationPcts[index] ?? DEFAULT_MANAGED_LENDING_MAX_ALLOCATION_PCT,
      );
    });

    setCollateralAssetsInput(nextAssets.join(', '));
    setCollateralAllocationPctsInput(
      nextAssets
        .map((asset) =>
          String(
            currentCapsByAsset.get(asset) ?? DEFAULT_MANAGED_LENDING_MAX_ALLOCATION_PCT,
          ),
        )
        .join(', '),
    );
  };

  const toggleCollateralAsset = (symbol: string) => {
    const normalized = normalizeManagedMandateAssetSymbol(symbol);
    setCollateralSelection(
      collateralAssets.includes(normalized)
        ? collateralAssets.filter((asset) => asset !== normalized)
        : [...collateralAssets, normalized],
    );
  };

  const setCollateralCapAtIndex = (index: number, nextValue: number) => {
    setCollateralAllocationPctsInput(
      collateralAssets
        .map((_, currentIndex) =>
          String(
            currentIndex === index
              ? nextValue
              : collateralAllocationPcts[currentIndex] ?? DEFAULT_MANAGED_LENDING_MAX_ALLOCATION_PCT,
          ),
        )
        .join(', '),
    );
  };

  const toggleBorrowAsset = (symbol: string) => {
    const normalized = normalizeManagedMandateAssetSymbol(symbol);
    const nextAssets = allowedBorrowAssets.includes(normalized) ? [] : [normalized];
    setAllowedBorrowAssetsInput(nextAssets.join(', '));
  };

  const handleSave = async () => {
    if (!props.onSave) {
      return;
    }

    const collateralPolicies = buildManagedLendingCollateralPoliciesFromSeparatedInputs({
      assetsInput: collateralAssetsInput,
      maxAllocationPctsInput: collateralAllocationPctsInput,
      fallbackMaxAllocationPct: DEFAULT_MANAGED_LENDING_MAX_ALLOCATION_PCT,
    });
    if (collateralPolicies.length === 0) {
      setSubmitError('At least one collateral policy is required.');
      return;
    }

    const normalizedCollateralAssets = parseManagedMandateAssetList(collateralAssetsInput);
    const normalizedCollateralAllocationPcts = readCommaSeparatedSegments(
      collateralAllocationPctsInput,
    );
    const hasInvalidCollateralCaps = normalizedCollateralAssets.some((_, index) => {
      const rawValue = normalizedCollateralAllocationPcts[index];
      return rawValue === undefined || !Number.isFinite(Number(rawValue));
    });
    if (hasInvalidCollateralCaps) {
      setSubmitError('Each collateral asset needs a numeric allocation cap.');
      return;
    }

    const normalizedAllowedBorrowAssets = parseManagedMandateAssetList(allowedBorrowAssetsInput);
    const maxLtvBps = parseLtvPctToBps(maxLtvPctInput);
    if (maxLtvBps === null) {
      setSubmitError('Max LTV must be a valid percent.');
      return;
    }
    const normalizedMinHealthFactor = minHealthFactorInput.trim();
    if (normalizedMinHealthFactor.length === 0) {
      setSubmitError('Minimum health factor is required.');
      return;
    }

    setIsSaving(true);
    setSubmitError(null);
    try {
      await props.onSave({
        ownerAgentId: props.view.ownerAgentId,
        targetAgentId: props.view.targetAgentId,
        targetAgentRouteId: props.view.targetAgentRouteId,
        managedMandate: buildUpdatedManagedMandate({
          existingManagedMandate: props.view.managedMandate,
          collateralPolicies,
          allowedBorrowAssets: normalizedAllowedBorrowAssets,
          maxLtvBps,
          minHealthFactor: normalizedMinHealthFactor,
        }),
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Managed mandate update failed.');
    } finally {
      setIsSaving(false);
    }
  };

  const rootClassName =
    props.chrome === 'plain'
      ? 'py-1'
      : 'rounded-[22px] border border-[#eadac7] bg-white/80 px-3.5 py-3 shadow-[0_14px_28px_rgba(148,111,79,0.09)]';

  return (
    <div className={rootClassName}>
      <div className="text-[0.95rem] leading-7 text-[#503826]">
        Deposit
        <ManagedMandateInlinePopoverField
          ariaLabel="Edit collateral policy"
          active={activeEditor === 'collateral-policy'}
          onToggle={() =>
            setActiveEditor((current) =>
              current === 'collateral-policy' ? null : 'collateral-policy',
            )
          }
          onClose={() =>
            setActiveEditor((current) => (current === 'collateral-policy' ? null : current))
          }
          popover={
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {availableTokenSymbols.map((symbol) => (
                  <ManagedMandateTokenToggleButton
                    key={symbol}
                    symbol={symbol}
                    selected={collateralAssets.includes(symbol)}
                    onToggle={() => toggleCollateralAsset(symbol)}
                    tokenIconBySymbol={tokenIconBySymbol}
                  />
                ))}
              </div>
              {collateralAssets.length > 0 ? (
                <div className="space-y-2">
                  {collateralAssets.map((asset, index) => (
                    <ManagedMandateSliderControl
                      key={asset}
                      label={asset}
                      tokenSymbol={asset}
                      tokenIconBySymbol={tokenIconBySymbol}
                      value={
                        collateralAllocationPcts[index] ??
                        DEFAULT_MANAGED_LENDING_MAX_ALLOCATION_PCT
                      }
                      min={0}
                      max={100}
                      step={1}
                      valueLabel={formatManagedMandatePercent(
                        collateralAllocationPcts[index] ??
                          DEFAULT_MANAGED_LENDING_MAX_ALLOCATION_PCT,
                      )}
                      onChange={(nextValue) => setCollateralCapAtIndex(index, nextValue)}
                      inputName={`managed-mandate-collateral-cap-${asset}`}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-[16px] border border-dashed border-[#d8c3ad] bg-[#fffaf2] px-3 py-3 text-[13px] text-[#7c6757]">
                  Select at least one collateral asset.
                </div>
              )}
            </div>
          }
        >
          <ManagedMandateCollateralPolicyValue
            assets={collateralAssets}
            allocationPcts={collateralAllocationPcts}
            tokenIconBySymbol={tokenIconBySymbol}
            emptyLabel="choose collateral"
          />
        </ManagedMandateInlinePopoverField>
        as collateral. Borrow
        <ManagedMandateInlinePopoverField
          ariaLabel="Edit allowed borrow assets"
          active={activeEditor === 'borrow-assets'}
          onToggle={() =>
            setActiveEditor((current) =>
              current === 'borrow-assets' ? null : 'borrow-assets',
            )
          }
          onClose={() =>
            setActiveEditor((current) => (current === 'borrow-assets' ? null : current))
          }
          popover={
            <div className="flex flex-wrap gap-2">
              {availableTokenSymbols.map((symbol) => (
                <ManagedMandateTokenToggleButton
                  key={symbol}
                  symbol={symbol}
                  selected={allowedBorrowAssets.includes(symbol)}
                  onToggle={() => toggleBorrowAsset(symbol)}
                  tokenIconBySymbol={tokenIconBySymbol}
                />
              ))}
            </div>
          }
        >
          <ManagedMandateTokenListValue
            tokens={allowedBorrowAssets}
            tokenIconBySymbol={tokenIconBySymbol}
            emptyLabel="no assets"
          />
        </ManagedMandateInlinePopoverField>
        {hasBorrowAssets ? (
          <>
            {' '}with max LTV below{' '}
            <ManagedMandateInlinePopoverField
              ariaLabel="Edit maximum LTV"
              active={activeEditor === 'max-ltv'}
              onToggle={() =>
                setActiveEditor((current) => (current === 'max-ltv' ? null : 'max-ltv'))
              }
              onClose={() =>
                setActiveEditor((current) => (current === 'max-ltv' ? null : current))
              }
              align="end"
              popover={
                <ManagedMandateSliderControl
                  label="Maximum LTV"
                  value={maxLtvPctValue}
                  min={0}
                  max={95}
                  step={1}
                  valueLabel={formatManagedMandatePercent(maxLtvPctValue)}
                  onChange={(nextValue) => setMaxLtvPctInput(String(nextValue))}
                  inputName="managed-mandate-max-ltv-pct"
                />
              }
            >
              <ManagedMandateInlineTextValue
                value={formatManagedMandatePercent(maxLtvPctValue)}
              />
            </ManagedMandateInlinePopoverField>{' '}
            and health factor above{' '}
            <ManagedMandateInlinePopoverField
              ariaLabel="Edit minimum health factor"
              active={activeEditor === 'health-factor'}
              onToggle={() =>
                setActiveEditor((current) =>
                  current === 'health-factor' ? null : 'health-factor',
                )
              }
              onClose={() =>
                setActiveEditor((current) =>
                  current === 'health-factor' ? null : current,
                )
              }
              align="end"
              popover={
                <ManagedMandateSliderControl
                  label="Minimum health factor"
                  value={minHealthFactorValue}
                  min={1}
                  max={3}
                  step={0.05}
                  valueLabel={`${formatManagedMandateHealthFactor(minHealthFactorValue)}x`}
                  onChange={(nextValue) =>
                    setMinHealthFactorInput(formatManagedMandateHealthFactor(nextValue))
                  }
                  inputName="managed-mandate-min-health-factor-slider"
                />
              }
            >
              <ManagedMandateInlineTextValue
                value={`${formatManagedMandateHealthFactor(minHealthFactorValue)}x`}
              />
            </ManagedMandateInlinePopoverField>
          </>
        ) : null}
        .
      </div>

      {submitError ? (
        <div className="mt-3 rounded-xl border border-red-500/20 bg-[#fff0eb] px-3 py-2.5 text-[13px] text-[#b84f2c]">
          {submitError}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-end">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!props.onSave || isSaving}
          className="shrink-0 rounded-full bg-[#fd6731] px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#e55a28] disabled:opacity-60"
        >
          {isSaving ? 'Saving...' : props.submitLabel ?? 'Save managed mandate'}
        </button>
      </div>
    </div>
  );
}
