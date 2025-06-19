const { ethers, network } = require("hardhat");

// Minimal ERC-20 ABI with only the functions we need
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

// Supported tokens on Arbitrum One (symbol → address)
const TOKEN_ADDRESSES = {
  wbtc: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
  weth: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  usdc: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
};

// Default whale addresses (address or symbol key → whale address)
const DEFAULT_WHALES = {
  // WETH
  [TOKEN_ADDRESSES.weth]: "0x960ea3e3c7fb317332d990873d354e18d7645590",
  weth: "0x960ea3e3c7fb317332d990873d354e18d7645590",
  // WBTC
  [TOKEN_ADDRESSES.wbtc]: "0x585e405a1c6d4f79e33573242fae763ccd871a8a",
  wbtc: "0x585e405a1c6d4f79e33573242fae763ccd871a8a",
};

// Helper function to handle both ethers v5 and v6 parseUnits/parseEther
const parseAmount = (amount, decimals = 18) => {
  return ethers.utils && ethers.utils.parseUnits 
    ? ethers.utils.parseUnits(amount.toString(), decimals)
    : ethers.parseUnits(amount.toString(), decimals);
};

async function main() {
  // Resolve TOKEN env (symbol or address)
  let tokenInput = (process.env.TOKEN || 'wbtc').toLowerCase();
  if (!tokenInput.startsWith('0x')) {
    tokenInput = TOKEN_ADDRESSES[tokenInput] || '';
  }
  const TOKEN = tokenInput;

  const WHALE = process.env.WHALE || DEFAULT_WHALES[(process.env.TOKEN || '').toLowerCase()] || DEFAULT_WHALES[TOKEN] || "";

  if (!WHALE) {
    console.error(`❌ No default whale known for token ${TOKEN}. Please set the WHALE environment variable explicitly.`);
    process.exit(1);
  }

  const [firstSigner] = await ethers.getSigners();
  const RECIPIENT = firstSigner.address;
  // Default to 0.1 units (e.g. 0.1 WETH) for safer testing
  const AMOUNT_RAW = process.env.AMOUNT || "0.5"; // human units

  if (TOKEN === "0x82af49447d8a07e3bd95bd0d56f35241523fbab1") {
    // WETH can be minted by wrapping ETH – no need for whale impersonation
    const wethAbi = [
      "function deposit() payable",
      "function balanceOf(address) view returns (uint256)",
      "function decimals() view returns (uint8)",
    ];

    const token = new ethers.Contract(TOKEN, wethAbi, firstSigner);
    const decimals = await token.decimals();
    const amount = parseAmount(AMOUNT_RAW, decimals);

    console.log(`Wrapping ${AMOUNT_RAW} ETH into WETH for ${RECIPIENT}`);
    const tx = await token.deposit({ value: amount });
    await tx.wait();
    // If recipient isn't the signer, transfer
    if (RECIPIENT.toLowerCase() !== firstSigner.address.toLowerCase()) {
      await token.transfer(RECIPIENT, amount);
    }
    console.log(`✅ WETH minted. Tx hash: ${tx.hash}`);
  } else {
    // Impersonate whale for ERC-20 transfer
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [WHALE] });
    const whaleSigner = await ethers.getSigner(WHALE);

    // Ensure whale has enough ETH for gas
    const MIN_ETH = parseAmount("0.05"); // 0.05 ETH buffer
    const whaleEth = await ethers.provider.getBalance(WHALE);
    // Determine if whale balance is below the minimum, handling both BigNumber (ethers v5) and BigInt (ethers v6)
    const needsFunding = typeof whaleEth.lt === 'function'
      ? whaleEth.lt(MIN_ETH)
      : whaleEth < MIN_ETH;
    if (needsFunding) {
      console.log(`Funding whale with 0.1 ETH for gas...`);
      const txFund = await firstSigner.sendTransaction({
        to: WHALE,
        value: parseAmount("0.1")
      });
      await txFund.wait();
    }

    const token = new ethers.Contract(TOKEN, ERC20_ABI, whaleSigner);
    const decimals = await token.decimals();
    const amount = parseAmount(AMOUNT_RAW, decimals);

    const balBefore = await token.balanceOf(RECIPIENT);
    console.log(`Recipient balance before: ${balBefore.toString()}`);

    console.log(`Transferring ${AMOUNT_RAW} tokens (decimals ${decimals}) from whale ${WHALE} to ${RECIPIENT}`);
    const tx = await token.transfer(RECIPIENT, amount);
    await tx.wait();

    const balAfter = await token.balanceOf(RECIPIENT);
    console.log(`✅ Transfer complete. Tx hash: ${tx.hash}`);
    console.log(`Recipient balance after : ${balAfter.toString()}`);

    await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [WHALE] });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}); 