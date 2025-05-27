import { ethers } from 'ethers';
import BalancerVaultABI from '../abi/BalancerVault.json';
import BalancerWeightedPoolABI from '../abi/BalancerWeightedPool.json';

const BALANCER_VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8';
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
// Pool ID for WETH/DAI pool (Balancer V2 mainnet):
const WETH_DAI_POOL_ID = '0x0b09dea16768f0799065c475be02919503cb2a3500020000000000000000001a';
const WETH_DAI_POOL_ADDRESS = '0x0b09dea16768f0799065c475be02919503cb2a35';

export async function getBalancerPrice(provider: ethers.providers.Provider): Promise<number | null> {
  const vault = new ethers.Contract(BALANCER_VAULT, BalancerVaultABI, provider);
  try {
    const { tokens, balances } = await vault.getPoolTokens(WETH_DAI_POOL_ID);
    // Fetch dynamic weights from the pool contract
    const poolContract = new ethers.Contract(WETH_DAI_POOL_ADDRESS, BalancerWeightedPoolABI, provider);
    const weightsRaw = await poolContract.getNormalizedWeights();
    let wethIndex = tokens.findIndex((addr: string) => addr.toLowerCase() === WETH_ADDRESS.toLowerCase());
    let daiIndex = tokens.findIndex((addr: string) => addr.toLowerCase() === DAI_ADDRESS.toLowerCase());
    if (wethIndex === -1 || daiIndex === -1) {
      console.error('Balancer pool does not contain WETH and DAI');
      return null;
    }
    // Convert weights to decimals (normalized to 1.0)
    const wethWeight = Number(weightsRaw[wethIndex].toString()) / 1e18;
    const daiWeight = Number(weightsRaw[daiIndex].toString()) / 1e18;
    const wethBalance = Number(ethers.utils.formatUnits(balances[wethIndex], 18));
    const daiBalance = Number(ethers.utils.formatUnits(balances[daiIndex], 18));
    if (wethBalance === 0) {
      console.error('Balancer WETH/DAI pool has zero liquidity');
      return null;
    }
    // Spot price formula for weighted pool
    // Weights are normalized to 1.0 (1e18), so no further normalization needed
    const price = (daiBalance / wethBalance) * (wethWeight / daiWeight);
    return price;
  } catch (err) {
    console.error('Failed to fetch Balancer pool price:', err);
    return null;
  }
} 