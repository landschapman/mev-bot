import { ethers } from 'ethers';
import { Token, CurrencyAmount } from '@uniswap/sdk-core';
import { Pool } from '@uniswap/v3-sdk';
import UniswapV3PoolABI from '../abi/UniswapV3PoolABI.json';

const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const POOL_ADDRESS = '0xc2e9f25be6257c210d7adf0d4cd6e3e881ba25f8'; // 0.3% fee pool

export async function getUniswapV3Price(provider: ethers.providers.Provider): Promise<number> {
  const poolContract = new ethers.Contract(POOL_ADDRESS, UniswapV3PoolABI, provider);
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

  // Always return price of 1 WETH in DAI
  if (pool.token0.address.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
    return parseFloat(pool.token1Price.toSignificant(6));
  } else if (pool.token1.address.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
    // Invert the price if WETH is token1
    return 1 / parseFloat(pool.token0Price.toSignificant(6));
  } else {
    throw new Error('WETH not found in pool');
  }
} 