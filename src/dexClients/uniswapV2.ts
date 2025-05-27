import { ethers } from 'ethers';
import { ChainId, Token, WETH, Fetcher, Route } from '@uniswap/sdk';

export async function getUniswapV2Price(provider: ethers.providers.Provider): Promise<number> {
  const chainId = ChainId.MAINNET;
  const weth = WETH[chainId];
  const dai = new Token(chainId, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18);

  // Use provider as any to bypass type check for Uniswap SDK compatibility
  const pair = await Fetcher.fetchPairData(weth, dai, provider as any);
  const route = new Route([pair], weth);
  // Price of 1 WETH in DAI
  return parseFloat(route.midPrice.toSignificant(6));
} 