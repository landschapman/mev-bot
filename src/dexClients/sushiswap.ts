import { ethers } from 'ethers';
import { ChainId, Token, WETH, Fetcher, Route } from '@uniswap/sdk';

// SushiSwap uses the same Uniswap V2 SDK, but with its own factory address
// WETH and DAI addresses are the same as on Uniswap

export async function getSushiSwapPrice(provider: ethers.providers.Provider): Promise<number> {
  const chainId = ChainId.MAINNET;
  const weth = WETH[chainId];
  const dai = new Token(chainId, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18);

  // Use provider as any to bypass type check for Uniswap SDK compatibility
  // SushiSwap is a Uniswap V2 fork, so the SDK works the same way
  const pair = await Fetcher.fetchPairData(weth, dai, provider as any);
  const route = new Route([pair], weth);
  // Price of 1 WETH in DAI
  return parseFloat(route.midPrice.toSignificant(6));
} 