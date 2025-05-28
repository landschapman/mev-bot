import { ethers } from 'ethers';
import { checkAbi, sleep } from './utils.js';

const DODO_WETH_DAI_POOL = '0x8f8ef111b67c04eb1641f5ff19ee54cda062f163'; // Correct Ethereum mainnet pool
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

const DODOV2PoolABI = [
  {
    "constant": true,
    "inputs": [
      { "internalType": "address", "name": "token", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "querySellBase",
    "outputs": [
      { "internalType": "uint256", "name": "receiveQuoteAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "mtFee", "type": "uint256" }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
];

export async function getPrice(provider: ethers.providers.Provider): Promise<number | null> {
  const debug = process.env.DEX_DEBUG === 'true';
  for (let attempt = 1; attempt <= 3; ++attempt) {
    try {
      const pool = new ethers.Contract(DODO_WETH_DAI_POOL, DODOV2PoolABI, provider);
      await checkAbi(pool, ['querySellBase'], debug);
      // Simulate selling 1 WETH (1e18 wei)
      const amountIn = ethers.utils.parseEther('1');
      const [daiOut] = await pool.querySellBase(WETH_ADDRESS, amountIn);
      const price = Number(ethers.utils.formatUnits(daiOut, 18));
      if (debug) console.log('DODO simulated WETH->DAI price:', price);
      return price;
    } catch (err: any) {
      if (debug) console.error(`[DODO] Attempt ${attempt} failed:`, err);
      if (err.code === 'CALL_EXCEPTION' && attempt < 3) await sleep(250);
      else if (attempt === 3) return null;
    }
  }
  return null;
} 