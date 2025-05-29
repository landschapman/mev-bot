import { ethers } from 'ethers';
import { ChainId, Token, WETH, Fetcher, Route } from '@uniswap/sdk';
import IUniswapV2PairABI from '../abi/IUniswapV2Pair.json' with { type: "json" };

const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const UNISWAP_V2_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';

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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyReserves(pairContract: ethers.Contract, debug: boolean) {
  try {
    const [reserve0, reserve1] = (await pairContract.getReserves()).slice(0, 2);
    const token0 = await pairContract.token0();
    const token1 = await pairContract.token1();
    if (debug) {
      console.log('[UniswapV2] token0:', token0, 'token1:', token1);
      console.log('[UniswapV2] reserve0:', reserve0.toString(), 'reserve1:', reserve1.toString());
    }
    if (
      (token0.toLowerCase() !== WETH_ADDRESS.toLowerCase() && token1.toLowerCase() !== WETH_ADDRESS.toLowerCase()) ||
      (token0.toLowerCase() !== DAI_ADDRESS.toLowerCase() && token1.toLowerCase() !== DAI_ADDRESS.toLowerCase())
    ) {
      throw new Error('Reserve token addresses do not match WETH/DAI');
    }
    if (reserve0.eq(0) || reserve1.eq(0)) {
      throw new Error('Reserves are zero');
    }
    // Compute spot price
    let wethReserve, daiReserve;
    if (token0.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
      wethReserve = reserve0;
      daiReserve = reserve1;
    } else {
      wethReserve = reserve1;
      daiReserve = reserve0;
    }
    const spotPrice = Number(daiReserve) / Number(wethReserve);
    if (debug) console.log('[UniswapV2] Spot price:', spotPrice);
    return { wethReserve, daiReserve, spotPrice };
  } catch (err) {
    if (debug) console.error('[UniswapV2] verifyReserves error:', err);
    throw err;
  }
}

async function checkAbi(pairContract: ethers.Contract, debug: boolean) {
  const requiredMethods = ['getReserves', 'token0', 'token1'];
  const fragments = pairContract.interface.fragments.map(f => f.name);
  for (const method of requiredMethods) {
    if (!fragments.includes(method)) {
      if (debug) console.error(`[UniswapV2] ABI mismatch: ${method}`);
      throw new Error(`ABI mismatch: ${method}`);
    }
  }
  if (debug) console.log('[UniswapV2] ABI matches');
}

export async function getPrice(provider: ethers.providers.Provider): Promise<number | null> {
  const debug = process.env.DEX_DEBUG === 'true';
  const chainId = ChainId.MAINNET;
  const weth = WETH[chainId];
  const dai = new Token(chainId, DAI_ADDRESS, 18);
  let pairAddress: string;
  let pairContract: ethers.Contract;
  // Retry logic for external calls
  for (let attempt = 1; attempt <= 3; ++attempt) {
    try {
      // Get pair address
      const factory = new ethers.Contract(UNISWAP_V2_FACTORY, IUniswapV2FactoryABI, provider);
      pairAddress = await factory.getPair(WETH_ADDRESS, DAI_ADDRESS);
      if (debug) console.log('[UniswapV2] Pair address:', pairAddress);
      if (pairAddress === ethers.constants.AddressZero) throw new Error('UniswapV2 WETH/DAI pair not initialized');
      pairContract = new ethers.Contract(pairAddress, IUniswapV2PairABI, provider);
      // ABI check
      await checkAbi(pairContract, debug);
      // Reserve check
      await verifyReserves(pairContract, debug);
      // Use SDK for price (as before)
      const pair = await Fetcher.fetchPairData(weth, dai, provider as any);
      const route = new Route([pair], weth);
      const price = parseFloat(route.midPrice.toSignificant(6));
      if (debug) console.log('[UniswapV2] SDK price:', price);
      return price;
    } catch (err: any) {
      if (debug) console.error(`[UniswapV2] Attempt ${attempt} failed:`, err);
      if (err.code === 'CALL_EXCEPTION' && attempt < 3) await sleep(250);
      else if (attempt === 3) return null;
    }
  }
  return null;
} 