import { ethers } from 'ethers';
import { latestPrices } from '../state.js';

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

export async function getGasCostInDai(dex: string): Promise<number> {
  const gasUsed = gasUsageTable[dex] ?? 150_000; // default estimate
  const prov = getProvider();
  const feeData = await prov.getFeeData();
  const effective = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (!effective) return 0;
  const effectiveEth = Number(ethers.utils.formatUnits(effective, 'ether'));
  // ETH price in DAI from latest prices
  let ethPriceInDai: number | undefined;
  const v2 = latestPrices.find(p => p.dex === 'Uniswap V2');
  const v3 = latestPrices.find(p => p.dex === 'Uniswap V3');
  ethPriceInDai = v2?.price ?? v3?.price;
  if (!ethPriceInDai) {
    // fallback to 2500 if nothing available
    ethPriceInDai = 2500;
  }
  const gasCostDai = (gasUsed * effectiveEth) * ethPriceInDai; // gasUsed * price (ETH) * ETH/DAI
  return gasCostDai;
} 