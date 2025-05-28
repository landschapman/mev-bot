import { ethers } from 'ethers';
import IUniswapV2PairABI from '../abi/IUniswapV2Pair.json' with { type: "json" };
import { ChainId, Token, WETH, Fetcher, Route } from '@uniswap/sdk';
import { checkAbi, verifyReserves, sleep } from './utils.js';

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

export async function getPrice(provider: ethers.providers.Provider): Promise<number | null> {
  const debug = process.env.DEX_DEBUG === 'true';
  const chainId = ChainId.MAINNET;
  const weth = WETH[chainId];
  const dai = new Token(chainId, DAI_ADDRESS, 18);
  let pairAddress: string;
  let pairContract: ethers.Contract;
  for (let attempt = 1; attempt <= 3; ++attempt) {
    try {
      const factory = new ethers.Contract(SAKESWAP_FACTORY, IUniswapV2FactoryABI, provider);
      pairAddress = await factory.getPair(WETH_ADDRESS, DAI_ADDRESS);
      if (pairAddress === ethers.constants.AddressZero) throw new Error('SakeSwap WETH/DAI pair not initialized');
      pairContract = new ethers.Contract(pairAddress, IUniswapV2PairABI, provider);
      await checkAbi(pairContract, ['getReserves', 'token0', 'token1'], debug);
      await verifyReserves(pairContract, WETH_ADDRESS, DAI_ADDRESS, debug);
      const pair = await Fetcher.fetchPairData(weth, dai, provider as any);
      const route = new Route([pair], weth);
      const price = parseFloat(route.midPrice.toSignificant(6));
      if (debug) console.log('[SakeSwap] SDK price:', price);
      return price;
    } catch (err: any) {
      if (debug) console.error(`[SakeSwap] Attempt ${attempt} failed:`, err);
      if (err.code === 'CALL_EXCEPTION' && attempt < 3) await sleep(250);
      else if (attempt === 3) return null;
    }
  }
  return null;
} 