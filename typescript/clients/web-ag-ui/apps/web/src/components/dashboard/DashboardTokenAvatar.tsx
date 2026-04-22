import { COINGECKO_TOKEN_ICON_BY_SYMBOL } from '@/constants/coingeckoTokenIcons';
import { iconMonogram, proxyIconUri, resolveTokenIconUri } from '@/utils/iconResolution';

type DashboardTokenAvatarProps = {
  symbol?: string;
  fallbackSymbol?: string;
  small?: boolean;
};

export function DashboardTokenAvatar(props: DashboardTokenAvatarProps): React.JSX.Element {
  const sizeClassName = props.small ? 'h-4 w-4' : 'h-6 w-6';
  const ringClassName = props.small ? 'ring-1 ring-[#E4D5C7]' : 'ring-1 ring-[#DCCAB8]';
  const iconUri = props.symbol
    ? resolveTokenIconUri({
        symbol: props.symbol,
        tokenIconBySymbol: COINGECKO_TOKEN_ICON_BY_SYMBOL,
      })
    : null;

  if (iconUri) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={proxyIconUri(iconUri)}
        alt=""
        className={`${sizeClassName} ${ringClassName} rounded-full bg-[#FFF7EE] object-contain`}
      />
    );
  }

  return (
    <span
      className={`${sizeClassName} ${ringClassName} inline-flex items-center justify-center rounded-full bg-[#F5EBE0] font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[#6D5B4C]`}
      aria-hidden="true"
    >
      {iconMonogram(props.fallbackSymbol ?? props.symbol ?? '?')}
    </span>
  );
}
