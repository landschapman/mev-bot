import { ethers } from 'ethers';
import IUniswapV2PairABI from '../abi/IUniswapV2Pair.json';

const SAKESWAP_FACTORY = '0x75e48C954594d64ef9613AeEF97Ad85370F13807';
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

export async function getSakeSwapPrice(provider: ethers.providers.Provider): Promise<number | null> {
  const factory = new ethers.Contract(SAKESWAP_FACTORY, IUniswapV2FactoryABI, provider);
  const pairAddress = await factory.getPair(WETH_ADDRESS, DAI_ADDRESS);
  if (pairAddress === ethers.constants.AddressZero) {
    console.error('SakeSwap WETH/DAI pair not initialized');
    return null;
  }
  const pairContract = new ethers.Contract(pairAddress, IUniswapV2PairABI, provider);
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
      console.error('SakeSwap WETH/DAI pair has zero liquidity');
      return null;
    }
    return Number(daiReserve) / Number(wethReserve);
  } catch (err) {
    console.error('Failed to fetch SakeSwap reserves:', err);
    return null;
  }
} 