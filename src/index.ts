import 'dotenv/config';
import { ethers } from 'ethers';
import { getUniswapV2Price } from './dexClients/uniswapV2';
import { getUniswapV3Price } from './dexClients/uniswapV3';
import { getSushiSwapPrice } from './dexClients/sushiswap';
import { getShibaSwapPrice } from './dexClients/shibaswap';
import { getSakeSwapPrice } from './dexClients/sakeswap';
import { getBalancerPrice } from './dexClients/balancer';
import { checkArb, PriceSource } from './arbitrage/checkArb';
import chalk from 'chalk';

async function main() {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) {
    throw new Error('RPC_URL not set in .env');
  }
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const wallet = ethers.Wallet.createRandom();
  console.log('Fake wallet address:', wallet.address);

  // Declare price variables at the top
  let v2Price: number | null = null;
  let v3Price: number | null = null;
  let sushiPrice: number | null = null;
  let shibaPrice: number | null = null;
  let sakePrice: number | null = null;
  let balancerPrice: number | null = null;

  try {
    v2Price = await getUniswapV2Price(provider);
    console.log('Uniswap V2 WETH/DAI price:', v2Price);
  } catch (err) {
    console.error('Failed to fetch Uniswap V2 price:', err);
  }

  try {
    v3Price = await getUniswapV3Price(provider);
    console.log('Uniswap V3 WETH/DAI price:', v3Price);
  } catch (err) {
    console.error('Failed to fetch Uniswap V3 price:', err);
  }

  try {
    sushiPrice = await getSushiSwapPrice(provider);
    console.log('SushiSwap WETH/DAI price:', sushiPrice);
  } catch (err) {
    console.error('Failed to fetch SushiSwap price:', err);
  }

  try {
    shibaPrice = await getShibaSwapPrice(provider);
    console.log('ShibaSwap WETH/DAI price:', shibaPrice);
  } catch (err) {
    console.error('Failed to fetch ShibaSwap price:', err);
  }

  try {
    sakePrice = await getSakeSwapPrice(provider);
    console.log('SakeSwap WETH/DAI price:', sakePrice);
  } catch (err) {
    console.error('Failed to fetch SakeSwap price:', err);
  }

  try {
    balancerPrice = await getBalancerPrice(provider);
    console.log('Balancer WETH/DAI price:', balancerPrice);
  } catch (err) {
    console.error('Failed to fetch Balancer price:', err);
  }

  // Build price sources array
  const priceSources: PriceSource[] = [
    { name: 'Uniswap V2', price: v2Price },
    { name: 'Uniswap V3', price: v3Price },
    { name: 'SushiSwap', price: sushiPrice },
    { name: 'ShibaSwap', price: shibaPrice },
    { name: 'SakeSwap', price: sakePrice },
    { name: 'Balancer', price: balancerPrice },
  ];

  // CLI flag for threshold
  const thresholdArg = process.argv.find(arg => arg.startsWith('--arb-threshold='));
  let threshold = 0.3;
  if (thresholdArg) {
    const val = parseFloat(thresholdArg.split('=')[1]);
    if (!isNaN(val)) threshold = val;
    else console.log(chalk.yellow('Invalid --arb-threshold value, using default 0.3%'));
  }

  // Run arbitrage check
  checkArb(priceSources, threshold);
}

main(); 