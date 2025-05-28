import 'dotenv/config';
import { ethers } from 'ethers';
import { getUniswapV2Price } from './dexClients/uniswapV2.js';
import { getUniswapV3Price } from './dexClients/uniswapV3.js';
import { getSushiSwapPrice } from './dexClients/sushiswap.js';
import { getShibaSwapPrice } from './dexClients/shibaswap.js';
import { getSakeSwapPrice } from './dexClients/sakeswap.js';
import { getBalancerPrice } from './dexClients/balancer.js';
import { getKyberPrice } from './dexClients/kyber.mjs';
import { getCurvePrice } from './dexClients/curve.js';
// import { getBancorPriceOnChainOrApi } from './dexClients/bancor.js';
import { checkArb, PriceSource } from './arbitrage/checkArb.js';
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
  let kyberPrice: number | null = null;
  let curvePrice: number | null = null;
  // let bancorPrice: number | null = null;

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

  try {
    curvePrice = await getCurvePrice(provider);
    console.log('Curve WETH/DAI price:', curvePrice);
  } catch (err) {
    console.error('Failed to fetch Curve price:', err);
  }

  // try {
  //   bancorPrice = await getBancorPriceOnChainOrApi(provider);
  //   console.log('Bancor WETH/DAI price:', bancorPrice);
  // } catch (err) {
  //   console.error('Failed to fetch Bancor price:', err);
  // }

  // Build price sources array
  const priceSources: PriceSource[] = [
    { name: 'Uniswap V2', price: v2Price },
    { name: 'Uniswap V3', price: v3Price },
    { name: 'SushiSwap', price: sushiPrice },
    { name: 'ShibaSwap', price: shibaPrice },
    { name: 'SakeSwap', price: sakePrice },
    { name: 'Balancer', price: balancerPrice },
    { name: 'Kyber', price: kyberPrice },
    { name: 'Curve', price: curvePrice },
    // To re-enable Bancor, uncomment the lines above and below:
    // { name: 'Bancor', price: bancorPrice },
  ];

  // Print summary table of all DEX prices
  console.log('\n=== DEX Prices (WETH/DAI) ===');
  for (const { name, price } of priceSources) {
    console.log(`${name}: ${price}`);
  }
  console.log('==============================\n');

  // CLI flag for threshold
  const thresholdArg = process.argv.find(arg => arg.startsWith('--arb-threshold='));
  let threshold = 0;
  if (thresholdArg) {
    const val = parseFloat(thresholdArg.split('=')[1]);
    if (!isNaN(val)) threshold = val;
    else console.log(chalk.yellow('Invalid --arb-threshold value, using default 0%'));
  }

  // Run arbitrage check
  checkArb(priceSources, threshold);
}

main(); 