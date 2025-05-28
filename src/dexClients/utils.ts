import { ethers } from 'ethers';

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function checkAbi(contract: ethers.Contract, methods: string[], debug: boolean) {
  const fragments = contract.interface.fragments.map(f => f.name);
  for (const m of methods) {
    if (!fragments.includes(m)) {
      if (debug) console.error(`[DEX] ABI mismatch: ${m}`);
      throw new Error(`ABI mismatch: ${m}`);
    }
  }
  if (debug) console.log('[DEX] ABI matches');
}

export async function verifyReserves(pairContract: ethers.Contract, wethAddress: string, daiAddress: string, debug: boolean) {
  try {
    const [reserve0, reserve1] = (await pairContract.getReserves()).slice(0, 2);
    const token0 = await pairContract.token0();
    const token1 = await pairContract.token1();
    if (debug) {
      console.log('[DEX] token0:', token0, 'token1:', token1);
      console.log('[DEX] reserve0:', reserve0.toString(), 'reserve1:', reserve1.toString());
    }
    if (
      (token0.toLowerCase() !== wethAddress.toLowerCase() && token1.toLowerCase() !== wethAddress.toLowerCase()) ||
      (token0.toLowerCase() !== daiAddress.toLowerCase() && token1.toLowerCase() !== daiAddress.toLowerCase())
    ) {
      throw new Error('Reserve token addresses do not match WETH/DAI');
    }
    if (reserve0.eq(0) || reserve1.eq(0)) {
      throw new Error('Reserves are zero');
    }
    let wethReserve, daiReserve;
    if (token0.toLowerCase() === wethAddress.toLowerCase()) {
      wethReserve = reserve0;
      daiReserve = reserve1;
    } else {
      wethReserve = reserve1;
      daiReserve = reserve0;
    }
    const spotPrice = Number(daiReserve) / Number(wethReserve);
    if (debug) console.log('[DEX] Spot price:', spotPrice);
    return { wethReserve, daiReserve, spotPrice };
  } catch (err) {
    if (debug) console.error('[DEX] verifyReserves error:', err);
    throw err;
  }
} 