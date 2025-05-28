import { ethers } from 'ethers';

// Curve 3pool (DAI/USDC/USDT)
const CURVE_3POOL = '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7';
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

// We'll use Chainlink for WETH/USD price to convert to DAI
const CHAINLINK_ETH_USD = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';

const CHAINLINK_ABI = [
  {
    "name": "latestRoundData",
    "outputs": [
      { "type": "uint80", "name": "roundId" },
      { "type": "int256", "name": "answer" },
      { "type": "uint256", "name": "startedAt" },
      { "type": "uint256", "name": "updatedAt" },
      { "type": "uint80", "name": "answeredInRound" }
    ],
    "inputs": [],
    "stateMutability": "view",
    "type": "function"
  }
];

export async function getCurvePrice(provider: ethers.providers.Provider): Promise<number | null> {
  try {
    // Get ETH/USD price from Chainlink
    const chainlinkOracle = new ethers.Contract(CHAINLINK_ETH_USD, CHAINLINK_ABI, provider);
    const [, answer] = await chainlinkOracle.latestRoundData();
    const ethPrice = parseFloat(ethers.utils.formatUnits(answer, 8)); // Chainlink uses 8 decimals

    if (!ethPrice || ethPrice <= 0) {
      console.error('Invalid ETH price from Chainlink');
      return null;
    }

    return ethPrice; // Return the ETH/USD price as DAI (since DAI is pegged to USD)

  } catch (err) {
    console.error('Failed to fetch Curve/Chainlink price:', err);
    return null;
  }
} 