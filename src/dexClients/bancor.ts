import { ethers } from 'ethers';
import fetch from 'node-fetch';

// Bancor V3 Network Info contract (Ethereum mainnet)
const BANCOR_NETWORK_INFO = '0xC6e7E708f46A23Ee9590b503F03BA3e2C67CaC13';
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const BNT_ADDRESS = '0x1F573D6Fb3F13d689FF844B4cE37794d79a7FF1C';

// Minimal ABI for tradeOutputBySourceAmount
const BancorNetworkInfoABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "sourceToken", "type": "address" },
      { "internalType": "address", "name": "targetToken", "type": "address" },
      { "internalType": "uint256", "name": "sourceAmount", "type": "uint256" }
    ],
    "name": "tradeOutputBySourceAmount",
    "outputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

const BancorNetworkABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "sourceToken", "type": "address" },
      { "internalType": "address", "name": "targetToken", "type": "address" },
      { "internalType": "uint256", "name": "sourceAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "minReturnAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "deadline", "type": "uint256" },
      { "internalType": "address", "name": "beneficiary", "type": "address" }
    ],
    "name": "tradeBySourceAmount",
    "outputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Attempts to fetch the DAI output for 1 WETH via Bancor V3, routed through BNT if needed.
 * Returns the DAI amount or null if not supported.
 */
export async function getBancorWethDaiPriceOnChain(provider: ethers.providers.Provider): Promise<number | null> {
  try {
    const contract = new ethers.Contract(BANCOR_NETWORK_INFO, BancorNetworkInfoABI, provider);
    const amountIn = ethers.utils.parseEther('1');
    // Try direct WETH -> DAI
    try {
      const direct = await contract.tradeOutputBySourceAmount(WETH_ADDRESS, DAI_ADDRESS, amountIn);
      if (direct && direct.gt(0)) {
        return Number(ethers.utils.formatUnits(direct, 18));
      }
    } catch {}
    // Try routed WETH -> BNT -> DAI
    try {
      const toBnt = await contract.tradeOutputBySourceAmount(WETH_ADDRESS, BNT_ADDRESS, amountIn);
      if (!toBnt || toBnt.eq(0)) throw new Error('No WETH->BNT liquidity');
      const toDai = await contract.tradeOutputBySourceAmount(BNT_ADDRESS, DAI_ADDRESS, toBnt);
      if (toDai && toDai.gt(0)) {
        return Number(ethers.utils.formatUnits(toDai, 18));
      }
    } catch {}
    // If both fail, document unsupported
    console.warn('Bancor V3 does not support on-chain quoting for WETH/DAI, even with BNT routing.');
    return null;
  } catch (err) {
    console.error('Failed to fetch Bancor WETH/DAI price on-chain:', err);
    return null;
  }
}

export async function getBancorPriceOnChainOrApi(provider: ethers.providers.Provider): Promise<number | null> {
  const debug = process.argv.includes('--bancor-debug');
  const contract = new ethers.Contract(BANCOR_NETWORK_INFO, BancorNetworkABI, provider);
  const amountIn = ethers.utils.parseEther('1');
  const minReturn = 0;
  const deadline = Math.floor(Date.now() / 1000) + 600; // 10 min from now
  const beneficiary = ethers.constants.AddressZero;
  let onChainError: any = null;

  // Try on-chain direct WETH->DAI, then WETH->BNT->DAI, with retries
  for (let attempt = 1; attempt <= 2; ++attempt) {
    try {
      if (debug) console.log(`[Bancor] On-chain attempt ${attempt}: direct WETH->DAI`);
      // Static call: direct WETH->DAI
      const direct = await contract.callStatic.tradeBySourceAmount(
        WETH_ADDRESS, DAI_ADDRESS, amountIn, minReturn, deadline, beneficiary
      );
      if (debug) console.log(`[Bancor] On-chain direct result:`, direct.toString());
      if (direct && direct.gt(0)) {
        if (debug) console.log('[Bancor] Used on-chain direct path');
        return Number(ethers.utils.formatUnits(direct, 18));
      }
    } catch (err) {
      onChainError = err;
      if (debug) console.log(`[Bancor] On-chain direct failed:`, err);
    }
    try {
      if (debug) console.log(`[Bancor] On-chain attempt ${attempt}: routed WETH->BNT->DAI`);
      // Static call: WETH->BNT
      const toBnt = await contract.callStatic.tradeBySourceAmount(
        WETH_ADDRESS, BNT_ADDRESS, amountIn, minReturn, deadline, beneficiary
      );
      if (debug) console.log(`[Bancor] On-chain WETH->BNT result:`, toBnt.toString());
      if (!toBnt || toBnt.eq(0)) throw new Error('No WETH->BNT liquidity');
      // Static call: BNT->DAI
      const toDai = await contract.callStatic.tradeBySourceAmount(
        BNT_ADDRESS, DAI_ADDRESS, toBnt, minReturn, deadline, beneficiary
      );
      if (debug) console.log(`[Bancor] On-chain BNT->DAI result:`, toDai.toString());
      if (toDai && toDai.gt(0)) {
        if (debug) console.log('[Bancor] Used on-chain routed path');
        return Number(ethers.utils.formatUnits(toDai, 18));
      }
    } catch (err) {
      onChainError = err;
      if (debug) console.log(`[Bancor] On-chain routed failed:`, err);
    }
    if (attempt < 2) await sleep(500);
  }

  // Try API fallback
  try {
    if (debug) console.log('[Bancor] Falling back to API');
    const url = 'https://api.bancor.network/v3/pricing?tokenIn=ETH&tokenOut=DAI&amount=1';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
    const data = await res.json() as any;
    if (debug) console.log('[Bancor] API response:', data);
    const output = data?.data?.outputAmount;
    if (output) {
      if (debug) console.log('[Bancor] Used API fallback');
      return Number(output);
    }
  } catch (apiErr) {
    if (debug) console.log('[Bancor] API fallback failed:', apiErr);
  }

  if (debug) console.log('[Bancor] Unsupported for WETH/DAI');
  return null;
}

export async function checkAbi(contract: ethers.Contract, methods: string[], debug: boolean) {
  const fragments = contract.interface.fragments.map(f => f.name);
  for (const m of methods) {
    if (!fragments.includes(m)) {
      if (debug) console.error(`[Bancor] ABI mismatch: ${m}`);
      throw new Error(`ABI mismatch: ${m}`);
    }
  }
  if (debug) console.log('[Bancor] ABI matches');
}

export async function verifyOnChainQuote(contract: ethers.Contract, debug: boolean): Promise<boolean> {
  try {
    const amountIn = ethers.utils.parseEther('0.1');
    const quote = await contract.callStatic.tradeOutputBySourceAmount(WETH_ADDRESS, DAI_ADDRESS, amountIn);
    if (debug) console.log('[Bancor] verifyOnChainQuote result:', quote.toString());
    return quote && quote.gt(0);
  } catch (err) {
    if (debug) console.error('[Bancor] verifyOnChainQuote error:', err);
    return false;
  }
}

export async function getPrice(provider: ethers.providers.Provider): Promise<number | null> {
  const debug = process.env.DEX_DEBUG === 'true';
  const infoContract = new ethers.Contract(BANCOR_NETWORK_INFO, BancorNetworkInfoABI, provider);
  try {
    await checkAbi(infoContract, ['tradeOutputBySourceAmount'], debug);
    const ok = await verifyOnChainQuote(infoContract, debug);
    if (!ok) {
      if (debug) console.log('[Bancor] On-chain quote verification failed');
    }
  } catch (err) {
    if (debug) console.error('[Bancor] ABI/reserve check failed:', err);
  }

  // Reuse existing robust function
  for (let attempt = 1; attempt <= 3; ++attempt) {
    try {
      const price = await getBancorPriceOnChainOrApi(provider);
      if (price !== null) return price;
    } catch {}
    await sleep(250);
  }
  return null;
} 