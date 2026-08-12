import {
  ROBINHOOD_TESTNET_NETWORK,
  BSC_TESTNET_NETWORK,
  getUsdgAddress,
  getUsdtBscAddress,
} from '../../src/lib/x402-assets';

export type LedgerAsset = 'USDG' | 'USDT';
export type LedgerChainId = 46630 | 97;

/**
 * Maps a settled x402 (network, assetAddress) pair back to the ledger's
 * (asset, chainId) pair. Deliberately compares against the SAME
 * getUsdgAddress()/getUsdtBscAddress() the deposit route already prices
 * deposits against, rather than re-hardcoding either address here -- if
 * either ever changes, there's exactly one place to update.
 */
export function resolveLedgerAsset(
  network: string,
  assetAddress: string,
): { asset: LedgerAsset; chainId: LedgerChainId } {
  const normalizedAsset = assetAddress.toLowerCase();

  if (network === ROBINHOOD_TESTNET_NETWORK) {
    if (normalizedAsset !== getUsdgAddress().toLowerCase()) {
      throw new Error(
        `Settled asset ${assetAddress} on ${network} doesn't match the known USDG address`,
      );
    }
    return { asset: 'USDG', chainId: 46630 };
  }

  if (network === BSC_TESTNET_NETWORK) {
    if (normalizedAsset !== getUsdtBscAddress().toLowerCase()) {
      throw new Error(
        `Settled asset ${assetAddress} on ${network} doesn't match the known USDT address`,
      );
    }
    return { asset: 'USDT', chainId: 97 };
  }

  throw new Error(`Unrecognized settlement network: ${network}`);
}
