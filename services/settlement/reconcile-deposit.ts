import type { AfterSettleHook, HTTPTransportContext } from '@x402/core/server';
import { creditDeposit } from '../ledger';
import { resolveLedgerAsset } from './asset-map';
import { resolveAuthenticatedDid } from './verify-session';

/**
 * The ONLY call site that wires a confirmed x402 settlement into
 * services/ledger (architecture.md invariant 1; x402-payment-architecture.md
 * "Ledger Interaction"). Registered as `resourceServer.onAfterSettle(...)`
 * in the deposit route.
 *
 * IMPORTANT, verified against the compiled @x402/core@2.21.0 source (not
 * assumed): every afterSettle hook runs inside the SDK's own try/catch,
 * which only logs a warning on failure -- it does NOT fail the settlement
 * or change the response the client already received. A thrown error here
 * is therefore INVISIBLE to the player: the client already saw a successful
 * deposit response, because the on-chain settlement genuinely did succeed.
 * Every failure path below logs loudly (console.error) rather than relying
 * on the SDK to surface it, but this is still a manual-reconciliation gap,
 * not an automatic retry -- see progress-tracker.md.
 */
export const reconcileSettledDeposit: AfterSettleHook = async (context) => {
  const { result, requirements, transportContext } = context;

  if (!result.success) {
    // A real settlement failure already produces a failure response to the
    // client via processSettlement -- nothing to credit here.
    return;
  }

  try {
    const httpRequest = (transportContext as HTTPTransportContext | undefined)?.request;
    const authHeader = httpRequest?.adapter.getHeader('authorization');
    const userId = await resolveAuthenticatedDid(authHeader);

    const { asset, chainId } = resolveLedgerAsset(result.network, requirements.asset);

    // `exact` deposits settle for the full authorized amount; `result.amount`
    // is only populated for `upto`-style partial settlement.
    const amountMicroUsd = BigInt(result.amount ?? requirements.amount);

    const credit = await creditDeposit({
      userId,
      amountMicroUsd,
      asset,
      chainId,
      txHash: result.transaction,
    });

    console.log(
      `[settlement] deposit ${credit.status} -- tx ${result.transaction}, ` +
        `user ${userId}, entry ${credit.entryId}`,
    );
  } catch (error) {
    console.error(
      `[settlement] FAILED to credit a settled deposit -- tx ` +
        `${result.transaction}, network ${result.network}. On-chain funds ` +
        `moved but the ledger was NOT credited. Needs manual reconciliation.`,
      error,
    );
  }
};
