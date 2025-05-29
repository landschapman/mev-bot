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
import { getGasCostInDai } from './gas/gasEstimator.js';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { latestPrices, topSpreads, warnings } from './state.js';

// keep latest priceSources for TEST_MODE calculations
let lastPriceSources: PriceSource[] = [];

// Test mode configuration
const TEST_MODE = process.env.TEST_MODE === 'true';
const TEST_DURATION_MIN = 5; // Fixed 5 minute test
const STARTING_BALANCE_DAI = 1000; // Starting with $1000 in DAI
let currentBalance = STARTING_BALANCE_DAI;
let testStart = Date.now();
let grossProfit = 0;
let totalGas = 0;
let netProfit = 0;
let tradeCount = 0;
let logFilePath: string | null = null;

// Fixed interval of 30 seconds
const intervalSec = 30;
const intervalMs = intervalSec * 1000;
const intervalSource = 'fixed (30s)';

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
  const { top, warn } = await checkArb(priceSources, threshold, true);
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

  lastPriceSources = priceSources;
}

if (TEST_MODE) {
  const logsDir = path.join(process.cwd(), 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  logFilePath = path.join(logsDir, `sim_${Date.now()}.csv`);
  fs.writeFileSync(
    logFilePath,
    'time,buyDex,buy,sellDex,sell,spreadPct,gasDAI,netProfitDAI,currentBalance,ethAmount\n',
    { flag: 'w' }
  );
  console.log(chalk.green(`=== Starting 5-minute Test Mode ===`));
  console.log(`Starting balance: ${STARTING_BALANCE_DAI.toFixed(2)} DAI`);
  console.log(`Logging to ${logFilePath}`);
}

async function runLoop() {
  while (true) {
    try {
      await main();

      if (TEST_MODE) {
        // Evaluate opportunities again for simulation (reuse latest topSpreads array)
        for (const opp of topSpreads) {
          const gasBuy = await getGasCostInDai(opp.buy);
          const gasSell = await getGasCostInDai(opp.sell);
          const gasTotal = gasBuy + gasSell;
          
          // We need absolute values; compute from priceSources array
          const buySrc = lastPriceSources.find(p => p.name === opp.buy);
          const sellSrc = lastPriceSources.find(p => p.name === opp.sell);
          if (!buySrc || !sellSrc || buySrc.price == null || sellSrc.price == null) continue;
          
          // Calculate the price difference per ETH
          const priceDiffPerEth = sellSrc.price - buySrc.price;
          
          // Calculate maximum ETH we can buy with our current balance
          const maxEthPossible = currentBalance / buySrc.price;
          
          // Use 90% of possible amount to leave room for price movements and fees
          const ethAmount = maxEthPossible * 0.9;
          
          // Calculate actual DAI needed for this trade
          const daiNeeded = ethAmount * buySrc.price;
          
          // Calculate potential profit for this trade size
          const grossProfitForTrade = ethAmount * priceDiffPerEth;
          const netProfitAfterGas = grossProfitForTrade - gasTotal;

          // Log potential opportunity details
          console.log(chalk.blue('\nPotential Trade Opportunity:'));
          console.log(`Buy from ${opp.buy} at ${buySrc.price.toFixed(2)} DAI`);
          console.log(`Sell to ${opp.sell} at ${sellSrc.price.toFixed(2)} DAI`);
          console.log(`Price difference: ${priceDiffPerEth.toFixed(4)} DAI`);
          console.log(`Trade amount: ${ethAmount.toFixed(6)} ETH`);
          console.log(`Estimated gas cost: ${gasTotal.toFixed(4)} DAI`);
          console.log(`Potential profit before gas: ${grossProfitForTrade.toFixed(4)} DAI`);
          console.log(`Potential profit after gas: ${netProfitAfterGas.toFixed(4)} DAI`);

          // Only execute trade if profitable
          if (netProfitAfterGas <= 0) {
            console.log(chalk.yellow(`Skipping trade - Not profitable after gas costs\n`));
            continue;
          }

          // Check if we have enough balance
          if (daiNeeded > currentBalance) {
            console.log(chalk.yellow(`Skipping trade - Insufficient balance (${currentBalance.toFixed(2)} DAI) for trade requiring ${daiNeeded.toFixed(2)} DAI\n`));
            continue;
          }

          console.log(chalk.green(`Executing trade!\n`));

          tradeCount += 1;
          grossProfit += grossProfitForTrade;
          totalGas += gasTotal;
          netProfit += netProfitAfterGas;
          currentBalance += netProfitAfterGas;

          if (logFilePath) {
            const line = `${new Date().toISOString()},${opp.buy},${buySrc.price},${opp.sell},${sellSrc.price},${opp.profit.toFixed(2)},${gasTotal.toFixed(2)},${netProfitAfterGas.toFixed(4)},${currentBalance.toFixed(2)},${ethAmount.toFixed(6)}\n`;
            fs.appendFileSync(logFilePath, line);
          }

          console.log(chalk.green(`Executed trade: ${ethAmount.toFixed(6)} ETH`));
          console.log(`  Buy from ${opp.buy} at ${buySrc.price.toFixed(2)} DAI`);
          console.log(`  Sell to ${opp.sell} at ${sellSrc.price.toFixed(2)} DAI`);
          console.log(`  Profit: ${netProfitAfterGas.toFixed(4)} DAI`);
          console.log(`  New balance: ${currentBalance.toFixed(2)} DAI`);
        }

        // Check duration
        if (Date.now() - testStart >= TEST_DURATION_MIN * 60 * 1000) {
          // Write final summary to log file
          if (logFilePath) {
            fs.appendFileSync(logFilePath, '\n=== FINAL SUMMARY ===\n');
            fs.appendFileSync(logFilePath, `Test Duration: ${((Date.now() - testStart) / 60000).toFixed(1)} minutes\n`);
            fs.appendFileSync(logFilePath, `Starting Balance: ${STARTING_BALANCE_DAI.toFixed(2)} DAI\n`);
            fs.appendFileSync(logFilePath, `Final Balance: ${currentBalance.toFixed(2)} DAI\n`);
            fs.appendFileSync(logFilePath, `Total Return: ${((currentBalance - STARTING_BALANCE_DAI) / STARTING_BALANCE_DAI * 100).toFixed(2)}%\n`);
            fs.appendFileSync(logFilePath, `Trades Executed: ${tradeCount}\n`);
            fs.appendFileSync(logFilePath, `Gross Profit: ${grossProfit.toFixed(4)} DAI\n`);
            fs.appendFileSync(logFilePath, `Total Gas Cost: ${totalGas.toFixed(4)} DAI\n`);
            fs.appendFileSync(logFilePath, `Net Profit: ${netProfit.toFixed(4)} DAI\n`);
          }

          console.log('\n===== TEST MODE SUMMARY =====');
          console.log(chalk.blue(`Test completed in ${((Date.now() - testStart) / 60000).toFixed(1)} minutes`));
          console.log(`Starting Balance: ${STARTING_BALANCE_DAI.toFixed(2)} DAI`);
          console.log(chalk.green(`Final Balance: ${currentBalance.toFixed(2)} DAI`));
          console.log(chalk.green(`Total Return: ${((currentBalance - STARTING_BALANCE_DAI) / STARTING_BALANCE_DAI * 100).toFixed(2)}%`));
          console.log(`Trades Executed: ${tradeCount}`);
          console.log(`Average Trade Size: ${tradeCount > 0 ? (netProfit / tradeCount).toFixed(4) : '0.0000'} DAI`);
          console.log(`Gross Profit: ${grossProfit.toFixed(4)} DAI`);
          console.log(`Total Gas Cost: ${totalGas.toFixed(4)} DAI`);
          console.log(chalk.green(`Net Profit: ${netProfit.toFixed(4)} DAI`));
          console.log('==============================');
          process.exit(0);
        }
      }
    } catch (err) {
      console.error('Error in main():', err);
    }
    console.log(`Waiting ${intervalSec} seconds before next price check... (source: ${intervalSource})`);
    await new Promise(res => setTimeout(res, intervalMs));
  }
}

runLoop(); 