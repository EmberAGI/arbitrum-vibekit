const { ethers } = require("hardhat");

// Use WBTC token and a verified whale to ensure the transfer succeeds on the fork.
const USDC_WHALE = "0x585e405a1c6d4f79e33573242fae763ccd871a8a"; // WBTC whale
const USDC = "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f"; // WBTC token
const COMET = "0xc3d688B66703497DAA19211EEdff47f25384cdc3"; // Comet remains same (base asset USDC)

const IERC20_ABI = [
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)"
];

async function main() {
  // Impersonate whale
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [USDC_WHALE],
  });
  const whaleSigner = await ethers.getSigner(USDC_WHALE);

  // Ensure whale has enough ETH for gas
  const [funder] = await ethers.getSigners();
  const ethBalance = await ethers.provider.getBalance(USDC_WHALE);
  if (ethBalance < ethers.parseEther("0.05")) {
    await funder.sendTransaction({ to: USDC_WHALE, value: ethers.parseEther("0.1") });
  }

  // Get USDC contract
  const usdc = await ethers.getContractAt(IERC20_ABI, USDC);

  // Send USDC to your test account
  const [testAccount] = await ethers.getSigners();
  const amount = ethers.parseUnits("0.05", 8); // 0.05 WBTC (8 decimals)

  // Approve and transfer
  await usdc.connect(whaleSigner).transfer(testAccount.address, amount);
  console.log(`Sent 0.05 WBTC to ${testAccount.address}`);

  // Approve Comet to spend USDC
  await usdc.connect(testAccount).approve(COMET, amount);
  console.log("Approved Comet to spend USDC");

  // Now you can call your MCP tool with testAccount.address as the user!
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});