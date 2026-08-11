/**
 * One-off verification: credits the REAL confirmed Robinhood Chain
 * Testnet deposit from this session's proven /verify -> /settle flow,
 * then proves idempotency by crediting the same tx hash again.
 *
 * Fill in PRIVY_DID before running — the Privy DID (user.id) that owns
 * 0xc2413696576176d1e31D55a2DEdA609906a15596 (check the Privy dashboard
 * or your User table).
 */
import { creditDeposit, getTableBalanceMicroUsd } from '../services/ledger';

const PRIVY_DID = 'did:privy:cmsn52rxu02ye0cl11k3aqoy0';
const CONFIRMED_TX =
  '0x0244a82add3e8e809dc409e3a5858d6c409389437698e9c68d6d5320f9563187';

async function main() {

  const first = await creditDeposit({
    userId: PRIVY_DID,
    amountMicroUsd: BigInt(1_011_000),
    asset: 'USDG',
    chainId: 46630,
    txHash: CONFIRMED_TX,
  });
  console.log('first call:', first);
  if (first.status !== 'credited') {
    throw new Error(`expected a fresh credit, got ${first.status} — was this run before?`);
  }

  const balanceAfterFirst = await getTableBalanceMicroUsd(PRIVY_DID);
  console.log('balance after first credit (micro-USD):', balanceAfterFirst.toString());
  if (balanceAfterFirst !== BigInt(1_011_000)) {
    throw new Error(`expected 1011000, got ${balanceAfterFirst}`);
  }

  const second = await creditDeposit({
    userId: PRIVY_DID,
    amountMicroUsd: BigInt(1_011_000),
    asset: 'USDG',
    chainId: 46630,
    txHash: CONFIRMED_TX,
  });
  console.log('second call (retry):', second);
  if (second.status !== 'already-credited') {
    throw new Error(`expected already-credited, got ${second.status}`);
  }

  const balanceAfterSecond = await getTableBalanceMicroUsd(PRIVY_DID);
  console.log('balance after retry (micro-USD):', balanceAfterSecond.toString());
  if (balanceAfterSecond !== BigInt(1_011_000)) {
    throw new Error(
      `DOUBLE CREDIT BUG: balance is ${balanceAfterSecond}, expected 1011000`
    );
  }

  console.log('OK — single credit, retry correctly ignored, balance = 1.011 USDG');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
