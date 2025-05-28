import { ethers } from 'ethers';
import IUniswapV2PairABI from '../abi/IUniswapV2Pair.json' with { type: "json" };

// Known LuaSwap WETH/DAI pair address (if available, update if needed)
const LUASWAP_WETH_DAI_PAIR = '0xD1C3f94DE7e5B6B3B2e6eB1eA2e2e2e2e2e2e2e2'; // <-- Replace with actual if known
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

const IUniswapV2FactoryABI = [
  {
    "constant": true,
    "inputs": [
      { "internalType": "address", "name": "tokenA", "type": "address" },
      { "internalType": "address", "name": "tokenB", "type": "address" }
    ],
    "name": "getPair",
    "outputs": [
      { "internalType": "address", "name": "pair", "type": "address" }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
];

export async function getLuaSwapPrice(provider: ethers.providers.Provider): Promise<number | null> {
  if (!LUASWAP_WETH_DAI_PAIR || LUASWAP_WETH_DAI_PAIR.length !== 42) {
    console.error('LuaSwap WETH/DAI pair address not set or not available. DEX not compatible with UniswapV2 getPair().');
    return null;
  }
  const pairContract = new ethers.Contract(LUASWAP_WETH_DAI_PAIR, IUniswapV2PairABI, provider);
  try {
    const [reserve0, reserve1] = (await pairContract.getReserves()).slice(0, 2);
    const token0 = await pairContract.token0();
    let wethReserve, daiReserve;
    if (token0.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
      wethReserve = reserve0;
      daiReserve = reserve1;
    } else {
      wethReserve = reserve1;
      daiReserve = reserve0;
    }
    if (Number(wethReserve) === 0) {
      console.error('LuaSwap WETH/DAI pair has zero liquidity');
      return null;
    }
    const price = Number(daiReserve) / Number(wethReserve);
    console.log('LuaSwap simulated WETH->DAI price:', price);
    return price;
  } catch (err) {
    console.error('LuaSwap not compatible with UniswapV2 getPair() or pair contract call failed:', err);
    return null;
  }
} 