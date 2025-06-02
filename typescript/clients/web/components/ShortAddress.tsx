import { copyAddressToClipboard, shortenAddress } from "@/lib/utils";
import { CopyIcon } from "lucide-react";

const ShortAddress = ({ web3Address }: { web3Address: string }) => {
  const shortenedAddress = shortenAddress(web3Address);

  const handleCopy = () => {
    copyAddressToClipboard(web3Address);
  };

  return (
    <span onClick={() => handleCopy()} className="flex gap-2 w-min">
      {shortenedAddress} <CopyIcon size={18} />
    </span>
  );
};

export default ShortAddress;
