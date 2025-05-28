import { ethers } from 'ethers';
import { Token } from '@uniswap/sdk-core';
import { Pool } from '@uniswap/v3-sdk';
import UniswapV3PoolABI from '../abi/UniswapV3PoolABI.json' with { type: "json" };

const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const POOL_ADDRESS = '0xc2e9f25be6257c210d7adf0d4cd6e3e881ba25f8'; // 0.3% fee pool

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyReserves(poolContract: ethers.Contract, debug: boolean) {
  try {
    const slot0 = await poolContract.slot0();
    const liquidity = await poolContract.liquidity();
    const token0 = await poolContract.token0();
    const token1 = await poolContract.token1();
    if (debug) {
      console.log('[UniswapV3] token0:', token0, 'token1:', token1);
      console.log('[UniswapV3] liquidity:', liquidity.toString());
      console.log('[UniswapV3] slot0.sqrtPriceX96:', slot0.sqrtPriceX96.toString());
    }
    if (
      (token0.toLowerCase() !== WETH_ADDRESS.toLowerCase() && token1.toLowerCase() !== WETH_ADDRESS.toLowerCase()) ||
      (token0.toLowerCase() !== DAI_ADDRESS.toLowerCase() && token1.toLowerCase() !== DAI_ADDRESS.toLowerCase())
    ) {
      throw new Error('Pool token addresses do not match WETH/DAI');
    }
    if (liquidity.eq(0)) {
      throw new Error('Pool has zero liquidity');
    }
    // Spot price calculation (approximate)
    const sqrtPriceX96 = slot0.sqrtPriceX96;
    const price = (Number(sqrtPriceX96.toString()) ** 2) / 2 ** 192;
    if (debug) console.log('[UniswapV3] Spot price (approx):', price);
    return { token0, token1, liquidity, sqrtPriceX96, price };
  } catch (err) {
    if (debug) console.error('[UniswapV3] verifyReserves error:', err);
    throw err;
  }
}

async function checkAbi(poolContract: ethers.Contract, debug: boolean) {
  const requiredMethods = ['slot0', 'liquidity', 'token0', 'token1', 'fee'];
  const fragments = poolContract.interface.fragments.map(f => f.name);
  for (const method of requiredMethods) {
    if (!fragments.includes(method)) {
      if (debug) console.error(`[UniswapV3] ABI mismatch: ${method}`);
      throw new Error(`ABI mismatch: ${method}`);
    }
  }
  if (debug) console.log('[UniswapV3] ABI matches');
}

export async function getPrice(provider: ethers.providers.Provider): Promise<number | null> {
  const debug = process.env.DEX_DEBUG === 'true';
  let poolContract: ethers.Contract;
  for (let attempt = 1; attempt <= 3; ++attempt) {
    try {
      poolContract = new ethers.Contract(POOL_ADDRESS, UniswapV3PoolABI, provider);
      await checkAbi(poolContract, debug);
      await verifyReserves(poolContract, debug);
      // Use SDK for price
      const [slot0, liquidity, token0, token1, fee] = await Promise.all([
        poolContract.slot0(),
        poolContract.liquidity(),
        poolContract.token0(),
        poolContract.token1(),
        poolContract.fee()
      ]);
      const weth = new Token(1, WETH_ADDRESS, 18, 'WETH', 'Wrapped Ether');
      const dai = new Token(1, DAI_ADDRESS, 18, 'DAI', 'Dai Stablecoin');
      const pool = new Pool(
        token0.toLowerCase() === WETH_ADDRESS.toLowerCase() ? weth : dai,
        token1.toLowerCase() === DAI_ADDRESS.toLowerCase() ? dai : weth,
        fee,
        slot0.sqrtPriceX96.toString(),
        liquidity.toString(),
        slot0.tick
      );
      let price: number;
      if (pool.token0.address.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
        price = parseFloat(pool.token1Price.toSignificant(6));
      } else if (pool.token1.address.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
        price = 1 / parseFloat(pool.token0Price.toSignificant(6));
      } else {
        throw new Error('WETH not found in pool');
      }
      if (debug) console.log('[UniswapV3] SDK price:', price);
      return price;
    } catch (err: any) {
      if (debug) console.error(`[UniswapV3] Attempt ${attempt} failed:`, err);
      if (err.code === 'CALL_EXCEPTION' && attempt < 3) await sleep(250);
      else if (attempt === 3) return null;
    }
  }
  return null;
} 