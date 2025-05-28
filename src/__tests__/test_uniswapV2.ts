import { getPrice } from '../dexClients/uniswapV2.js';
import { ethers } from 'ethers';

if (!process.env.RPC_URL) throw new Error('RPC_URL not set');
const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
getPrice(provider)
  .then(console.log)
  .catch(console.error); 