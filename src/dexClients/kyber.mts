import { ethers } from 'ethers';
import fetch from 'node-fetch';

// KyberSwap Router address on Ethereum mainnet
const KYBER_ROUTER = '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5';
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

// KyberSwap Router ABI (only what we need)
const KyberRouterABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "tokenIn", "type": "address" },
      { "internalType": "address", "name": "tokenOut", "type": "address" },
      { "internalType": "uint256", "name": "amountIn", "type": "uint256" }
    ],
    "name": "getAmountsOut",
    "outputs": [
      { "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// KyberSwap Aggregator API endpoint for Ethereum mainnet
const KYBER_API = 'https://aggregator-api.kyberswap.com/ethereum/api/v1/routes';

export async function getKyberPrice(provider: ethers.providers.Provider): Promise<number | null> {
  try {
    // Query for 1 WETH to DAI
    const amountIn = ethers.utils.parseEther('1').toString();
    const url = `${KYBER_API}?tokenIn=${WETH_ADDRESS}&tokenOut=${DAI_ADDRESS}&amountIn=${amountIn}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
    const data = (await res.json()) as any;
    // The best route is the first in the result
    const amountOut = data.data.routeSummary.amountOut;
    if (!amountOut) throw new Error('No amountOut in Kyber API response');
    // Convert to DAI (18 decimals)
    return Number(ethers.utils.formatUnits(amountOut, 18));
  } catch (err) {
    console.error('Failed to fetch Kyber price from API:', err);
    return null;
  }
} 