import { getPrice } from '../dexClients/dodo.js';
import { ethers } from 'ethers';

if (!process.env.RPC_URL) {
  console.warn('Skipping DODO test: RPC_URL not provided');
  process.exit(0);
}
const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
getPrice(provider)
  .then(console.log)
  .catch(console.error); 