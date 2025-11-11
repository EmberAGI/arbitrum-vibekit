import { copyAddressToClipboard, shortenAddress } from '@/lib/utils';
import { CopyIcon } from 'lucide-react';

const ShortAddress = ({ web3Address }: { web3Address: string }) => {
  const shortenedAddress = shortenAddress(web3Address);

  const handleCopy = () => {
    copyAddressToClipboard(web3Address);
  };

  return (
    <button
      onClick={() => handleCopy()}
      className="flex gap-2 w-min hover:opacity-80 transition-opacity"
      type="button"
    >
      {shortenedAddress} <CopyIcon size={18} />
    </button>
  );
};

export default ShortAddress;
