import 'dotenv/config';
import { ethers } from 'ethers';
import { getUniswapV2Price } from './dexClients/uniswapV2';
import { getUniswapV3Price } from './dexClients/uniswapV3';
import { getSushiSwapPrice } from './dexClients/sushiswap';
import { getShibaSwapPrice } from './dexClients/shibaswap';
import { getSakeSwapPrice } from './dexClients/sakeswap';
import { getBalancerPrice } from './dexClients/balancer';

async function main() {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) {
    throw new Error('RPC_URL not set in .env');
  }
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const wallet = ethers.Wallet.createRandom();
  console.log('Fake wallet address:', wallet.address);

  try {
    const v2Price = await getUniswapV2Price(provider);
    console.log('Uniswap V2 WETH/DAI price:', v2Price);
  } catch (err) {
    console.error('Failed to fetch Uniswap V2 price:', err);
  }

  try {
    const v3Price = await getUniswapV3Price(provider);
    console.log('Uniswap V3 WETH/DAI price:', v3Price);
  } catch (err) {
    console.error('Failed to fetch Uniswap V3 price:', err);
  }

  try {
    const sushiPrice = await getSushiSwapPrice(provider);
    console.log('SushiSwap WETH/DAI price:', sushiPrice);
  } catch (err) {
    console.error('Failed to fetch SushiSwap price:', err);
  }

  try {
    const shibaPrice = await getShibaSwapPrice(provider);
    console.log('ShibaSwap WETH/DAI price:', shibaPrice);
  } catch (err) {
    console.error('Failed to fetch ShibaSwap price:', err);
  }

  try {
    const sakePrice = await getSakeSwapPrice(provider);
    console.log('SakeSwap WETH/DAI price:', sakePrice);
  } catch (err) {
    console.error('Failed to fetch SakeSwap price:', err);
  }

  try {
    const balancerPrice = await getBalancerPrice(provider);
    console.log('Balancer WETH/DAI price:', balancerPrice);
  } catch (err) {
    console.error('Failed to fetch Balancer price:', err);
  }
}

main(); 