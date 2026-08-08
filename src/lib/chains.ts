import { defineChain } from "viem";
import { bscTestnet as bscTestnetBuiltin } from "viem/chains";

/**
 * Robinhood Chain is an Arbitrum Orbit L2 (mainnet since July 1, 2026) and
 * isn't in viem's built-in chain list yet, so it's defined by hand here.
 * Values verified against docs.robinhood.com/chain/connecting.
 *
 * Note: the native gas currency is ETH, not USDG — USDG is just an asset
 * on the chain. Doesn't affect this app since x402/Permit2 means players
 * never touch gas directly, but worth knowing when testing manually.
 */
export const robinhoodChainTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Chain Explorer",
      url: "https://explorer.testnet.chain.robinhood.com",
    },
  },
  testnet: true,
});

export const robinhoodChainMainnet = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Chain Explorer",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
});

// BSC testnet ships in viem/chains already — re-exported here so every
// chain the app uses is imported from this one file.
export const bscTestnet = bscTestnetBuiltin;
