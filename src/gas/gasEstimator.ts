import { ethers } from 'ethers';
import { latestPrices } from '../state.js';
import fetch from 'node-fetch';

const gasUsageTable: Record<string, number> = {
  'Uniswap V2': 65_000,
  'Uniswap V3': 85_000,
  'SushiSwap': 65_000,
  'ShibaSwap': 65_000,
  'SakeSwap': 65_000,
  'Curve': 95_000,
  'Balancer': 90_000,
  'Bancor': 120_000,
  'Kyber': 75_000
};

let provider: ethers.providers.Provider | null = null;
function getProvider(): ethers.providers.Provider {
  if (!provider) {
    const rpcUrl = process.env.RPC_URL || '';
    provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  }
  return provider;
}

async function getGasPriceFromOracle(): Promise<ethers.BigNumber | null> {
  try {
    const apiKey = process.env.ETHERSCAN_API_KEY || 'YourApiKeyToken';
    // Etherscan V2 gas tracker endpoint
    const res = await fetch(`https://api.etherscan.io/v2/gas-tracker?apikey=${apiKey}`);
    const data = await res.json();
    // V2: Expecting data.result.proposeGasPrice (in Gwei)
    if (
      typeof data === 'object' && data !== null &&
      'result' in data && typeof (data as any).result === 'object' && (data as any).result !== null &&
      'proposeGasPrice' in (data as any).result && typeof (data as any).result.proposeGasPrice === 'string'
    ) {
      return ethers.utils.parseUnits((data as any).result.proposeGasPrice, 'gwei');
    }
  } catch {}
  return null;
}

export async function getGasCostInDai(dex: string): Promise<number> {
  const gasUsed = gasUsageTable[dex] ?? 85_000;
  const prov = getProvider();
  let gasPrice: ethers.BigNumber | null = null;
  const feeData = await prov.getFeeData();
  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    gasPrice = feeData.maxFeePerGas.add(feeData.maxPriorityFeePerGas);
  } else if (feeData.gasPrice) {
    gasPrice = feeData.gasPrice;
  } else {
    gasPrice = await getGasPriceFromOracle();
  }
  if (!gasPrice) return 0;
  const effectiveEth = Number(ethers.utils.formatUnits(gasPrice, 'ether'));
  // ETH price in DAI from latest prices
  let ethPriceInDai: number | undefined;
  const v2 = latestPrices.find(p => p.dex === 'Uniswap V2');
  const v3 = latestPrices.find(p => p.dex === 'Uniswap V3');
  ethPriceInDai = v2?.price ?? v3?.price;
  if (!ethPriceInDai) ethPriceInDai = 2500;
  const gasCostDai = (gasUsed * effectiveEth) * ethPriceInDai;
  return gasCostDai;
} 