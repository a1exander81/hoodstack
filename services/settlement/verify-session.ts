import { verifyAccessToken } from '@privy-io/node';

// Privy app IDs aren't secret -- this one's already shipped to the browser
// via PrivyProvider's appId prop, so reusing NEXT_PUBLIC_PRIVY_APP_ID here
// instead of adding a server-only duplicate is fine. PRIVY_VERIFICATION_KEY
// below is the actual secret-adjacent value -- never NEXT_PUBLIC_.
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const PRIVY_VERIFICATION_KEY = process.env.PRIVY_VERIFICATION_KEY;

if (!PRIVY_APP_ID) {
  throw new Error('NEXT_PUBLIC_PRIVY_APP_ID is not set.');
}
if (!PRIVY_VERIFICATION_KEY) {
  throw new Error(
    'PRIVY_VERIFICATION_KEY is not set -- copy the verification key (NOT ' +
      'the app secret) from the Privy Dashboard under Settings -> API.',
  );
}

/**
 * Verifies a Privy access token from an `Authorization: Bearer <token>`
 * header and returns the caller's DID (`user.id`) -- the table-balance
 * ownership key per architecture.md's Auth and Access Model.
 *
 * Fully local JWT verification against the app's static verification key
 * -- no network call to Privy on every deposit settlement.
 *
 * Throws if the header is missing/malformed or the token is invalid or
 * expired.
 */
export async function resolveAuthenticatedDid(
  authorizationHeader: string | null | undefined,
): Promise<string> {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or malformed Authorization header');
  }
  const accessToken = authorizationHeader.slice('Bearer '.length).trim();
  if (!accessToken) {
    throw new Error('Empty bearer token');
  }

  const { user_id: userId } = await verifyAccessToken({
    access_token: accessToken,
    app_id: PRIVY_APP_ID as string,
    verification_key: PRIVY_VERIFICATION_KEY as string,
  });

  return userId;
}
