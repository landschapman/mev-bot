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
import { providers as multicallProviders } from '@0xsequence/multicall';
import IUniswapV2Pair from './abi/IUniswapV2Pair.json' with { type: 'json' };
import BalancerVaultABI from './abi/BalancerVault.json' with { type: 'json' };
import BalancerWeightedPoolABI from './abi/BalancerWeightedPool.json' with { type: 'json' };
import { getPrice as getDODOPrice } from './dexClients/dodo.js';
import { getPrice as getCurvePrice } from './dexClients/curve.js';
import { getPrice as getBancorPrice } from './dexClients/bancor.js';
import { getPrice as getLuaSwapPrice } from './dexClients/luaswap.js';
// @ts-ignore
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import CurvePoolABI from './abi/CurvePool.json' with { type: 'json' };
import DODOV2PoolABI from './abi/DODOV2Pool.json' with { type: 'json' };

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

// DEX fee table (default values, can be customized)
const dexFeeTable: Record<string, number> = {
  'Uniswap V2': 0.003,
  'Uniswap V3': 0.003, // can be pool-specific
  'SushiSwap': 0.003,
  'ShibaSwap': 0.003,
  'SakeSwap': 0.003,
  'Balancer': 0.001,
  'Bancor': 0.002,
  'Kyber': 0.002,
  'Curve': 0.001
};

// Use WebSocketProvider for event-driven price checks
const wssUrl = process.env.ETHEREUM_WSS_URL;
if (!wssUrl) {
  throw new Error('ETHEREUM_WSS_URL not set in .env');
}
const wsProvider = new ethers.providers.WebSocketProvider(wssUrl);

// Generate wallet once
const rpcUrl = process.env.RPC_URL;
if (!rpcUrl) {
  throw new Error('RPC_URL not set in .env');
}
const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
const multicallProvider = new multicallProviders.MulticallProvider(provider);
const wallet = ethers.Wallet.createRandom();
console.log('Fake wallet address:', wallet.address);

// Block-level price cache
const priceCache: Record<number, Record<string, number | null>> = {};
let lastBlockNumber = 0;

async function getCachedPrice(
  dex: string,
  getPriceFn: (provider: any) => Promise<number | null>,
  provider: any,
  blockNumber: number
): Promise<number | null> {
  if (!blockNumber) return null; // Guard against undefined blockNumber

  if (priceCache[blockNumber] === undefined) priceCache[blockNumber] = {};
  if (priceCache[blockNumber][dex] !== undefined) return priceCache[blockNumber][dex];

  try {
    const price = await getPriceFn(provider);
    (priceCache[blockNumber] ??= {})[dex] = price; // atomic assignment
    return price;
  } catch (e) {
    (priceCache[blockNumber] ??= {})[dex] = null; // atomic assignment
    return null;
  }
}

// Set up Flashbots provider for atomic execution
let flashbotsProvider: FlashbotsBundleProvider | null = null;
(async () => {
  flashbotsProvider = await FlashbotsBundleProvider.create(
    provider,
    ethers.Wallet.createRandom() // Flashbots relay signing wallet
  );
})();

function safeAddress(addr: string): string {
  try {
    return ethers.utils.getAddress(addr);
  } catch (err: any) {
    if (
      TEST_MODE &&
      err.code === 'INVALID_ARGUMENT' &&
      /bad address checksum/i.test(err.message)
    ) {
      console.warn(`Warning: Address ${addr} has an invalid checksum. Using lowercase for test mode.`);
      return addr.toLowerCase();
    }
    throw err;
  }
}

// Pair addresses for event-driven DEXes
const PAIR_ADDRESSES: Record<string, string> = {
  'Uniswap V2': safeAddress('0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11'),
  'SushiSwap': safeAddress('0x6c6Bc977E13Df9b0de53b251522280BB72383700'),
  'ShibaSwap': safeAddress('0x795065dCc9f64b5614C407a6EFDC400DA6221FB0'),
  // 'SakeSwap': 'REPLACE_WITH_VALID_ADDRESS' // No canonical WETH/DAI pool on mainnet
  // 'LuaSwap': 'REPLACE_WITH_VALID_ADDRESS' // No canonical WETH/DAI pool on mainnet
};

// Debounce map to avoid duplicate triggers within the same block
const lastSwapBlock: Record<string, number> = {};

const UNISWAP_V3_POOL = safeAddress('0xc2e9f25be6257c210d7adf0d4cd6e3e881ba25f8'); // 0.3% fee WETH/DAI pool
const BALANCER_VAULT = safeAddress('0xBA12222222228d8Ba445958a75a0704d566BF2C8');
const BALANCER_WETH_DAI_POOL_ID = '0x0b09dea16768f0799065c475be02919503cb2a3500020000000000000000001a';
const CURVE_POOL = safeAddress('0xa2b47e3d5c44877cca798226b7b8118f9bfb7a56'); // Mainnet 3pool DAI/USDC/USDT
const DODO_V2_POOL = safeAddress('0xa356867fdcea8e71aeaf87805808803806231fdc'); // Mainnet DODO V2 WETH/DAI pool
const BANCOR_NETWORK = safeAddress('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'); // Replace with actual Bancor Network contract address
const KYBER_NETWORK_PROXY = safeAddress('0x818E6FECD516Ecc3849DAf6845e3EC868087B755'); // Mainnet Kyber Network Proxy

async function main(blockNumber: number) {
  // Invalidate old cache
  if (blockNumber !== lastBlockNumber) {
    for (const key in priceCache) {
      if (Number(key) !== blockNumber) delete priceCache[key];
    }
    lastBlockNumber = blockNumber;
  }
  // Batch all price fetches using Promise.all and multicallProvider
  const [
    v2Price,
    v3Price,
    sushiPrice,
    shibaPrice,
    sakePrice,
    balancerPrice,
    kyberPrice,
    dodoPrice,
    curvePrice,
    bancorPrice,
    luaswapPrice
  ] = await Promise.all([
    getCachedPrice('Uniswap V2', getUniswapV2Price, multicallProvider, blockNumber),
    getCachedPrice('Uniswap V3', getUniswapV3Price, multicallProvider, blockNumber),
    getCachedPrice('SushiSwap', getSushiSwapPrice, multicallProvider, blockNumber),
    getCachedPrice('ShibaSwap', getShibaSwapPrice, multicallProvider, blockNumber),
    getCachedPrice('SakeSwap', getSakeSwapPrice, multicallProvider, blockNumber),
    getCachedPrice('Balancer', getBalancerPrice, multicallProvider, blockNumber),
    getCachedPrice('Kyber', getKyberPrice, multicallProvider, blockNumber),
    getCachedPrice('DODO', getDODOPrice, multicallProvider, blockNumber),
    getCachedPrice('Curve', getCurvePrice, multicallProvider, blockNumber),
    getCachedPrice('Bancor', getBancorPrice, multicallProvider, blockNumber),
    getCachedPrice('LuaSwap', getLuaSwapPrice, multicallProvider, blockNumber)
  ]);
  if (v2Price != null) console.log('Uniswap V2 WETH/DAI price:', v2Price);
  if (v3Price != null) console.log('Uniswap V3 WETH/DAI price:', v3Price);
  if (sushiPrice != null) console.log('SushiSwap WETH/DAI price:', sushiPrice);
  if (shibaPrice != null) console.log('ShibaSwap WETH/DAI price:', shibaPrice);
  if (sakePrice != null) console.log('SakeSwap WETH/DAI price:', sakePrice);
  if (balancerPrice != null) console.log('Balancer WETH/DAI price:', balancerPrice);
  if (kyberPrice != null) console.log('Kyber WETH/DAI price:', kyberPrice);
  if (dodoPrice != null) console.log('DODO WETH/DAI price:', dodoPrice);
  if (curvePrice != null) console.log('Curve WETH/DAI price:', curvePrice);
  if (bancorPrice != null) console.log('Bancor WETH/DAI price:', bancorPrice);
  if (luaswapPrice != null) console.log('LuaSwap WETH/DAI price:', luaswapPrice);

  // Build price sources array
  const priceSources: PriceSource[] = [
    { name: 'Uniswap V2', price: v2Price },
    { name: 'Uniswap V3', price: v3Price },
    { name: 'SushiSwap', price: sushiPrice },
    { name: 'ShibaSwap', price: shibaPrice },
    { name: 'SakeSwap', price: sakePrice },
    { name: 'Balancer', price: balancerPrice },
    { name: 'Kyber', price: kyberPrice },
    { name: 'DODO', price: dodoPrice },
    { name: 'Curve', price: curvePrice },
    { name: 'Bancor', price: bancorPrice },
    { name: 'LuaSwap', price: luaswapPrice },
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
    'time,buyDex,buy,sellDex,sell,spreadPct,gasDAI,netProfitDAI,currentBalance,ethAmount,buyFee,sellFee\n',
    { flag: 'w' }
  );
  console.log(chalk.green(`=== Starting 5-minute Test Mode ===`));
  console.log(`Starting balance: ${STARTING_BALANCE_DAI.toFixed(2)} DAI`);
  console.log(`Logging to ${logFilePath}`);
}

// Listen for Swap events on V2-style DEXes
for (const [dex, pairAddress] of Object.entries(PAIR_ADDRESSES)) {
  wsProvider.on({
    address: pairAddress,
    topics: [ethers.utils.id('Swap(address,uint256,uint256,uint256,uint256,address)')]
  }, async (log) => {
    const blockNumber = log.blockNumber;
    if (lastSwapBlock[dex] === blockNumber) return; // debounce
    lastSwapBlock[dex] = blockNumber;
    console.log(chalk.cyan(`\nSwap event on ${dex} (block ${blockNumber})`));
    await main(blockNumber);
  });
}

// Listen for Swap events on Uniswap V3
wsProvider.on({
  address: UNISWAP_V3_POOL,
  topics: [ethers.utils.id('Swap(address,address,int256,int256,uint160,uint128,int24)')]
}, async (log) => {
  const blockNumber = log.blockNumber;
  if (lastSwapBlock['Uniswap V3'] === blockNumber) return; // debounce
  lastSwapBlock['Uniswap V3'] = blockNumber;
  console.log(chalk.cyan(`\nSwap event on Uniswap V3 (block ${blockNumber})`));
  await main(blockNumber);
});

// Listen for Swap events on Balancer Vault (WETH/DAI pool only)
wsProvider.on({
  address: BALANCER_VAULT,
  topics: [
    ethers.utils.id('Swap(bytes32,address,address,uint256,uint256,address)'),
    BALANCER_WETH_DAI_POOL_ID
  ]
}, async (log) => {
  const blockNumber = log.blockNumber;
  if (lastSwapBlock['Balancer'] === blockNumber) return; // debounce
  lastSwapBlock['Balancer'] = blockNumber;
  console.log(chalk.cyan(`\nSwap event on Balancer WETH/DAI (block ${blockNumber})`));
  await main(blockNumber);
});

// Listen for TokenExchange and TokenExchangeUnderlying events on Curve
wsProvider.on({
  address: CURVE_POOL,
  topics: [
    ethers.utils.id('TokenExchange(address,int128,int128,uint256,uint256)')
  ]
}, async (log) => {
  const blockNumber = log.blockNumber;
  if (lastSwapBlock['Curve'] === blockNumber) return; // debounce
  lastSwapBlock['Curve'] = blockNumber;
  console.log(chalk.cyan(`\nTokenExchange event on Curve (block ${blockNumber})`));
  await main(blockNumber);
});
wsProvider.on({
  address: CURVE_POOL,
  topics: [
    ethers.utils.id('TokenExchangeUnderlying(address,int128,int128,uint256,uint256)')
  ]
}, async (log) => {
  const blockNumber = log.blockNumber;
  if (lastSwapBlock['Curve'] === blockNumber) return; // debounce
  lastSwapBlock['Curve'] = blockNumber;
  console.log(chalk.cyan(`\nTokenExchangeUnderlying event on Curve (block ${blockNumber})`));
  await main(blockNumber);
});

// Listen for Swap events on DODO V2
wsProvider.on({
  address: DODO_V2_POOL,
  topics: [ethers.utils.id('Swap(address,uint256,uint256,address)')]
}, async (log) => {
  const blockNumber = log.blockNumber;
  if (lastSwapBlock['DODO'] === blockNumber) return; // debounce
  lastSwapBlock['DODO'] = blockNumber;
  console.log(chalk.cyan(`\nSwap event on DODO V2 (block ${blockNumber})`));
  await main(blockNumber);
});

// Listen for TokensTraded events on Bancor
wsProvider.on({
  address: BANCOR_NETWORK,
  topics: [ethers.utils.id('TokensTraded(address,address,address,uint256,uint256,uint256,uint256)')]
}, async (log) => {
  const blockNumber = log.blockNumber;
  if (lastSwapBlock['Bancor'] === blockNumber) return; // debounce
  lastSwapBlock['Bancor'] = blockNumber;
  console.log(chalk.cyan(`\nTokensTraded event on Bancor (block ${blockNumber})`));
  await main(blockNumber);
});

// Listen for ExecuteTrade events on Kyber
wsProvider.on({
  address: KYBER_NETWORK_PROXY,
  topics: [ethers.utils.id('ExecuteTrade(address,address,address,address,uint256,uint256,address,uint256)')]
}, async (log) => {
  const blockNumber = log.blockNumber;
  if (lastSwapBlock['Kyber'] === blockNumber) return; // debounce
  lastSwapBlock['Kyber'] = blockNumber;
  console.log(chalk.cyan(`\nExecuteTrade event on Kyber (block ${blockNumber})`));
  await main(blockNumber);
});

// Fallback: still listen for new blocks for other DEXes
wsProvider.on('block', async (blockNumber) => {
  if (Object.values(lastSwapBlock).includes(blockNumber)) return; // already handled by swap event
  console.log(chalk.cyan(`\nNew block: ${blockNumber}`));
  try {
    await main(blockNumber);
    if (TEST_MODE) {
      // Find the most profitable trade
      let bestTrade = null;
      let bestNetProfit = -Infinity;
      let bestTradeDetails = null;
      for (const opp of topSpreads) {
        const gasBuy = await getGasCostInDai(opp.buy);
        const gasSell = await getGasCostInDai(opp.sell);
        const gasTotal = gasBuy + gasSell;
        const buySrc = lastPriceSources.find(p => p.name === opp.buy);
        const sellSrc = lastPriceSources.find(p => p.name === opp.sell);
        if (!buySrc || !sellSrc || buySrc.price == null || sellSrc.price == null) continue;
        const buyFee = dexFeeTable[opp.buy] ?? 0.003;
        const sellFee = dexFeeTable[opp.sell] ?? 0.003;
        const buyPriceWithFee = buySrc.price * (1 + buyFee);
        const sellPriceWithFee = sellSrc.price * (1 - sellFee);
        const priceDiffPerEth = sellPriceWithFee - buyPriceWithFee;
        const maxEthPossible = currentBalance / buyPriceWithFee;
        const ethAmount = maxEthPossible * 0.9;
        const daiNeeded = ethAmount * buyPriceWithFee;
        const grossProfitForTrade = ethAmount * priceDiffPerEth;
        const netProfitAfterGas = grossProfitForTrade - gasTotal;
        if (netProfitAfterGas > bestNetProfit) {
          bestNetProfit = netProfitAfterGas;
          bestTrade = opp;
          bestTradeDetails = {
            buySrc, sellSrc, buyFee, sellFee, buyPriceWithFee, sellPriceWithFee, priceDiffPerEth, ethAmount, daiNeeded, grossProfitForTrade, netProfitAfterGas, gasTotal
          };
        }
      }
      if (bestTrade && bestTradeDetails) {
        const { buySrc, sellSrc, buyFee, sellFee, buyPriceWithFee, sellPriceWithFee, priceDiffPerEth, ethAmount, daiNeeded, grossProfitForTrade, netProfitAfterGas, gasTotal } = bestTradeDetails;
        console.log(chalk.blue('\nBest Trade Opportunity This Block:'));
        console.log(`Buy from ${bestTrade.buy} at ${(buySrc.price!).toFixed(2)} DAI (fee: ${(buyFee*100).toFixed(2)}%)`);
        console.log(`Sell to ${bestTrade.sell} at ${(sellSrc.price!).toFixed(2)} DAI (fee: ${(sellFee*100).toFixed(2)}%)`);
        console.log(`Buy price w/ fee: ${buyPriceWithFee.toFixed(4)} DAI, Sell price w/ fee: ${sellPriceWithFee.toFixed(4)} DAI`);
        console.log(`Price difference (after fees): ${priceDiffPerEth.toFixed(4)} DAI`);
        console.log(`Trade amount: ${ethAmount.toFixed(6)} ETH`);
        console.log(`Estimated gas cost: ${gasTotal.toFixed(4)} DAI`);
        console.log(`Potential profit before gas: ${grossProfitForTrade.toFixed(4)} DAI`);
        console.log(`Potential profit after gas: ${netProfitAfterGas.toFixed(4)} DAI`);
        if (netProfitAfterGas <= 0) {
          console.log(chalk.yellow('Best trade is not profitable after gas/fees. Skipping.'));
        } else if (daiNeeded > currentBalance) {
          console.log(chalk.yellow(`Best trade requires more DAI (${daiNeeded.toFixed(2)}) than available balance (${currentBalance.toFixed(2)}). Skipping.`));
        } else {
          console.log(chalk.green('Executing best trade!'));
          if (flashbotsProvider) {
            // Build dummy buy and sell txs (for simulation only)
            const buyTx = {
              to: '0x000000000000000000000000000000000000dead', // dummy address
              value: ethers.utils.parseEther('0.01'), // dummy value
              data: '0x',
              gasLimit: 21000
            };
            const sellTx = {
              to: '0x000000000000000000000000000000000000dead', // dummy address
              value: ethers.utils.parseEther('0.01'), // dummy value
              data: '0x',
              gasLimit: 21000
            };
            const signedBundle = await flashbotsProvider.signBundle([
              {
                signer: wallet,
                transaction: buyTx
              },
              {
                signer: wallet,
                transaction: sellTx
              }
            ]);
            const blockNumber = await provider.getBlockNumber();
            const simResult = await flashbotsProvider.simulate(signedBundle, blockNumber + 1);
            if ('results' in simResult && simResult.results) {
              console.log(chalk.magenta('Flashbots bundle simulation results:'), simResult.results);
            } else if ('error' in simResult) {
              console.log(chalk.red('Flashbots bundle simulation failed:'), simResult.error);
            } else if ('message' in simResult) {
              console.log(chalk.red('Flashbots bundle simulation failed:'), simResult.message);
            } else {
              console.log(chalk.red('Flashbots bundle simulation failed (unknown structure):'), JSON.stringify(simResult));
            }
            console.log('Would send Flashbots bundle for atomic execution.');
          }
          tradeCount += 1;
          grossProfit += grossProfitForTrade;
          totalGas += gasTotal;
          netProfit += netProfitAfterGas;
          currentBalance += netProfitAfterGas;
          if (logFilePath) {
            const line = `${new Date().toISOString()},${bestTrade.buy},${buySrc.price!},${bestTrade.sell},${sellSrc.price!},${bestTrade.profit.toFixed(2)},${gasTotal.toFixed(2)},${netProfitAfterGas.toFixed(4)},${currentBalance.toFixed(2)},${ethAmount.toFixed(6)},${buyFee},${sellFee}\n`;
            fs.appendFileSync(logFilePath, line);
          }
          console.log(chalk.green(`Executed trade: ${ethAmount.toFixed(6)} ETH`));
          console.log(`  Buy from ${bestTrade.buy} at ${(buySrc.price!).toFixed(2)} DAI`);
          console.log(`  Sell to ${bestTrade.sell} at ${(sellSrc.price!).toFixed(2)} DAI`);
          console.log(`  Profit: ${netProfitAfterGas.toFixed(4)} DAI`);
          console.log(`  New balance: ${currentBalance.toFixed(2)} DAI`);
        }
      } else {
        console.log(chalk.yellow('No valid arbitrage opportunities found this block.'));
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
        }
      }
    }
  } catch (error) {
    console.error('Error in main function:', error);
  }
});
