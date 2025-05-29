import { ethers } from 'ethers';
import IUniswapV2PairABI from '../abi/IUniswapV2Pair.json' with { type: "json" };
import { ChainId, Token, WETH, Fetcher, Route } from '@uniswap/sdk';
import { checkAbi, verifyReserves, sleep } from './utils.js';

// ShibaSwap factory address (mainnet): 0x115934131916C8b277DD010Ee02de363c09d037c
const SHIBASWAP_FACTORY = '0x115934131916C8b277DD010Ee02de363c09d037c';
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

export async function getPrice(provider: ethers.providers.Provider): Promise<number | null> {
  const debug = process.env.DEX_DEBUG === 'true';
  const chainId = ChainId.MAINNET;
  const weth = WETH[chainId];
  const dai = new Token(chainId, DAI_ADDRESS, 18);
  let pairAddress: string;
  let pairContract: ethers.Contract;
  for (let attempt = 1; attempt <= 3; ++attempt) {
    try {
      const factory = new ethers.Contract(SHIBASWAP_FACTORY, IUniswapV2FactoryABI, provider);
      pairAddress = await factory.getPair(WETH_ADDRESS, DAI_ADDRESS);
      if (debug) console.log('[ShibaSwap] Pair address:', pairAddress);
      if (pairAddress === ethers.constants.AddressZero) throw new Error('ShibaSwap WETH/DAI pair not initialized');
      pairContract = new ethers.Contract(pairAddress, IUniswapV2PairABI, provider);
      await checkAbi(pairContract, ['getReserves', 'token0', 'token1'], debug);
      await verifyReserves(pairContract, WETH_ADDRESS, DAI_ADDRESS, debug);
      const pair = await Fetcher.fetchPairData(weth, dai, provider as any);
      const route = new Route([pair], weth);
      const price = parseFloat(route.midPrice.toSignificant(6));
      if (debug) console.log('[ShibaSwap] SDK price:', price);
      return price;
    } catch (err: any) {
      if (debug) console.error(`[ShibaSwap] Attempt ${attempt} failed:`, err);
      if (err.code === 'CALL_EXCEPTION' && attempt < 3) await sleep(250);
      else if (attempt === 3) return null;
    }
  }
  return null;
}

export async function getShibaSwapPrice(provider: ethers.providers.Provider): Promise<number | null> {
  const factory = new ethers.Contract(SHIBASWAP_FACTORY, IUniswapV2FactoryABI, provider);
  const pairAddress = await factory.getPair(WETH_ADDRESS, DAI_ADDRESS);
  if (pairAddress === ethers.constants.AddressZero) {
    console.error('ShibaSwap WETH/DAI pair not initialized');
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
      console.error('ShibaSwap WETH/DAI pair has zero liquidity');
      return null;
    }
    return Number(daiReserve) / Number(wethReserve);
  } catch (err) {
    console.error('Failed to fetch ShibaSwap reserves:', err);
    return null;
  }
} 