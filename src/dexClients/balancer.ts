import { ethers } from 'ethers';
import BalancerVaultABI from '../abi/BalancerVault.json' with { type: "json" };
import BalancerWeightedPoolABI from '../abi/BalancerWeightedPool.json' with { type: "json" };
import { checkAbi, sleep } from './utils.js';

const BALANCER_VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8';
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
// Pool ID for WETH/DAI pool (Balancer V2 mainnet):
const WETH_DAI_POOL_ID = '0x0b09dea16768f0799065c475be02919503cb2a3500020000000000000000001a';
const WETH_DAI_POOL_ADDRESS = '0x0b09dea16768f0799065c475be02919503cb2a35';

export async function getPrice(provider: ethers.providers.Provider): Promise<number | null> {
  const debug = process.env.DEX_DEBUG === 'true';
  for (let attempt = 1; attempt <= 3; ++attempt) {
    try {
      const vault = new ethers.Contract(BALANCER_VAULT, BalancerVaultABI, provider);
      await checkAbi(vault, ['getPoolTokens'], debug);
      const { tokens, balances } = await vault.getPoolTokens(WETH_DAI_POOL_ID);
      // Fetch dynamic weights from the pool contract
      const poolContract = new ethers.Contract(WETH_DAI_POOL_ADDRESS, BalancerWeightedPoolABI, provider);
      await checkAbi(poolContract, ['getNormalizedWeights'], debug);
      const weightsRaw = await poolContract.getNormalizedWeights();
      let wethIndex = tokens.findIndex((addr: string) => addr.toLowerCase() === WETH_ADDRESS.toLowerCase());
      let daiIndex = tokens.findIndex((addr: string) => addr.toLowerCase() === DAI_ADDRESS.toLowerCase());
      if (wethIndex === -1 || daiIndex === -1) {
        if (debug) console.error('Balancer pool does not contain WETH and DAI');
        return null;
      }
      // Convert weights to decimals (normalized to 1.0)
      const wethWeight = Number(weightsRaw[wethIndex].toString()) / 1e18;
      const daiWeight = Number(weightsRaw[daiIndex].toString()) / 1e18;
      const wethBalance = Number(ethers.utils.formatUnits(balances[wethIndex], 18));
      const daiBalance = Number(ethers.utils.formatUnits(balances[daiIndex], 18));
      if (wethBalance === 0) {
        if (debug) console.error('Balancer WETH/DAI pool has zero liquidity');
        return null;
      }
      // Spot price formula for weighted pool
      const price = (daiBalance / wethBalance) * (wethWeight / daiWeight);
      if (debug) {
        console.log('[Balancer] tokens:', tokens);
        console.log('[Balancer] balances:', (balances as any[]).map((b: any) => b.toString()));
        console.log('[Balancer] weights:', (weightsRaw as any[]).map((w: any) => w.toString()));
        console.log('[Balancer] spot price:', price);
      }
      return price;
    } catch (err: any) {
      if (debug) console.error(`[Balancer] Attempt ${attempt} failed:`, err);
      if (err.code === 'CALL_EXCEPTION' && attempt < 3) await sleep(250);
      else if (attempt === 3) return null;
    }
  }
  return null;
} 