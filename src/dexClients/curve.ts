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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyReserves(chainlinkOracle: ethers.Contract, debug: boolean) {
  try {
    const [, answer] = await chainlinkOracle.latestRoundData();
    if (debug) {
      console.log('[Curve] Chainlink ETH/USD answer:', answer.toString());
    }
    if (!answer || answer.lte(0)) {
      throw new Error('Invalid ETH price from Chainlink');
    }
    return answer;
  } catch (err) {
    if (debug) console.error('[Curve] verifyReserves error:', err);
    throw err;
  }
}

async function checkAbi(chainlinkOracle: ethers.Contract, debug: boolean) {
  const requiredMethods = ['latestRoundData'];
  const fragments = chainlinkOracle.interface.fragments.map(f => f.name);
  for (const method of requiredMethods) {
    if (!fragments.includes(method)) {
      if (debug) console.error(`[Curve] ABI mismatch: ${method}`);
      throw new Error(`ABI mismatch: ${method}`);
    }
  }
  if (debug) console.log('[Curve] ABI matches');
}

export async function getPrice(provider: ethers.providers.Provider): Promise<number | null> {
  const debug = process.env.DEX_DEBUG === 'true';
  let chainlinkOracle: ethers.Contract;
  for (let attempt = 1; attempt <= 3; ++attempt) {
    try {
      chainlinkOracle = new ethers.Contract(CHAINLINK_ETH_USD, CHAINLINK_ABI, provider);
      await checkAbi(chainlinkOracle, debug);
      const answer = await verifyReserves(chainlinkOracle, debug);
      const ethPrice = parseFloat(ethers.utils.formatUnits(answer, 8)); // Chainlink uses 8 decimals
      if (debug) console.log('[Curve] ETH/USD price:', ethPrice);
      return ethPrice; // Return the ETH/USD price as DAI (since DAI is pegged to USD)
    } catch (err: any) {
      if (debug) console.error(`[Curve] Attempt ${attempt} failed:`, err);
      if (err.code === 'CALL_EXCEPTION' && attempt < 3) await sleep(250);
      else if (attempt === 3) return null;
    }
  }
  return null;
} 