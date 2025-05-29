import 'dotenv/config';
import { ethers } from 'ethers';
import { getPrice as getUniswapV2Price } from './dexClients/uniswapV2.js';
import { getPrice as getUniswapV3Price } from './dexClients/uniswapV3.js';
import { getPrice as getSushiSwapPrice } from './dexClients/sushiswap.js';
import { getPrice as getShibaSwapPrice } from './dexClients/shibaswap.js';
import { getPrice as getSakeSwapPrice } from './dexClients/sakeswap.js';
import { getPrice as getBalancerPrice } from './dexClients/balancer.js';
import { getPrice as getKyberPrice } from './dexClients/kyber.mjs';
import { checkArb, PriceSource } from './arbitrage/checkArb.js';
import chalk from 'chalk';
import { latestPrices, topSpreads, warnings } from './state.js';

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
  let kyberPrice: number | null = null;

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

  try {
    kyberPrice = await getKyberPrice(provider);
    console.log('Kyber WETH/DAI price:', kyberPrice);
  } catch (err) {
    console.error('Failed to fetch Kyber price:', err);
  }

  // Build price sources array
  const priceSources: PriceSource[] = [
    { name: 'Uniswap V2', price: v2Price },
    { name: 'Uniswap V3', price: v3Price },
    { name: 'SushiSwap', price: sushiPrice },
    { name: 'ShibaSwap', price: shibaPrice },
    { name: 'SakeSwap', price: sakePrice },
    { name: 'Balancer', price: balancerPrice },
    { name: 'Kyber', price: kyberPrice },
  ];

  // Update dashboard state: latestPrices
  latestPrices.length = 0;
  for (const src of priceSources) {
    if (src.price != null && !isNaN(src.price)) {
      latestPrices.push({ dex: src.name, price: src.price });
    }
  }

  // CLI flag for threshold
  const thresholdArg = process.argv.find(arg => arg.startsWith('--arb-threshold='));
  let threshold = 0;
  if (thresholdArg) {
    const val = parseFloat(thresholdArg.split('=')[1]);
    if (!isNaN(val)) threshold = val;
    else console.log(chalk.yellow('Invalid --arb-threshold value, using default 0%'));
  }

  // Run arbitrage check and update dashboard state: topSpreads
  const { top, warn } = checkArb(priceSources, threshold, true);
  topSpreads.length = 0;
  for (const opp of top) {
    topSpreads.push({ buy: opp.buyDex, sell: opp.sellDex, profit: opp.profitPct });
  }
  warnings.length = 0;
  for (const w of warn) warnings.push(w);

  if (process.env.DASH_ENABLE === 'true') {
    // Start dashboard server in the same process so state arrays are shared
    await import('./dashboard/server.js');
  }
}

// Determine interval from CLI flag, env var, or default
const intervalArg = process.argv.find(arg => arg.startsWith('--interval='));
let intervalSec: number | undefined = undefined;
let intervalSource = 'default (45)';
if (intervalArg) {
  const val = parseInt(intervalArg.split('=')[1], 10);
  if (!isNaN(val) && val > 0) {
    intervalSec = val;
    intervalSource = 'CLI flag';
  }
}
if (intervalSec === undefined && process.env.PRICE_CHECK_INTERVAL_SECONDS) {
  const val = parseInt(process.env.PRICE_CHECK_INTERVAL_SECONDS, 10);
  if (!isNaN(val) && val > 0) {
    intervalSec = val;
    intervalSource = 'env var';
  }
}
if (intervalSec === undefined) intervalSec = 45;
const intervalMs = intervalSec * 1000;

async function runLoop() {
  while (true) {
    try {
      await main();
    } catch (err) {
      console.error('Error in main():', err);
    }
    console.log(`Waiting ${intervalSec} seconds before next price check... (source: ${intervalSource})`);
    await new Promise(res => setTimeout(res, intervalMs));
  }
}

runLoop(); 