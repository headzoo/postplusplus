import { AUTH_COOKIE_TTL_MS } from '@gitroom/helpers/auth/auth.constants';

export const ADMIN_WEBAUTHN_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const ADMIN_VERIFICATION_SESSION_TTL_MS = 20 * 60 * 1000;
export const ADMIN_WEBAUTHN_FRESH_ACTION_TTL_MS = 5 * 60 * 1000;
/** Account passkey session matches the normal login `auth` cookie lifetime. */
export const ACCOUNT_PASSKEY_SESSION_TTL_MS = AUTH_COOKIE_TTL_MS;

export type AdminWebAuthnConfiguration = {
  rpName: string;
  rpId: string;
  expectedOrigin: string;
  challengeTtlMs: number;
  verificationSessionTtlMs: number;
  freshActionTtlMs: number;
  accountSessionTtlMs: number;
};

function parseOrigin(value: string | undefined, variableName: string) {
  if (!value?.trim()) {
    throw new Error(`${variableName} must be configured`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid HTTP(S) origin`);
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${variableName} must be a valid HTTP(S) origin`);
  }

  return url.origin;
}

function parseRpId(value: string, expectedOrigin: string) {
  const rpId = value.trim().toLowerCase();
  let hostname: string;
  try {
    const rpUrl = new URL(`https://${rpId}`);
    if (
      rpUrl.hostname !== rpId ||
      rpUrl.port ||
      rpUrl.username ||
      rpUrl.password ||
      rpUrl.pathname !== '/'
    ) {
      throw new Error();
    }
    hostname = rpUrl.hostname;
  } catch {
    throw new Error('ADMIN_WEBAUTHN_RP_ID must be a valid domain name');
  }

  const originHostname = new URL(expectedOrigin).hostname.toLowerCase();
  if (originHostname !== hostname && !originHostname.endsWith(`.${hostname}`)) {
    throw new Error(
      'ADMIN_WEBAUTHN_RP_ID must match the configured WebAuthn origin or its parent domain'
    );
  }

  return rpId;
}

export function parseAdminWebAuthnConfiguration(
  environment: NodeJS.ProcessEnv
): AdminWebAuthnConfiguration {
  const expectedOrigin = parseOrigin(
    environment.ADMIN_WEBAUTHN_ORIGIN ?? environment.FRONTEND_URL,
    environment.ADMIN_WEBAUTHN_ORIGIN ? 'ADMIN_WEBAUTHN_ORIGIN' : 'FRONTEND_URL'
  );
  const rpId = parseRpId(
    environment.ADMIN_WEBAUTHN_RP_ID ?? new URL(expectedOrigin).hostname,
    expectedOrigin
  );
  const rpName = environment.ADMIN_WEBAUTHN_RP_NAME?.trim() || 'Postiz';

  return {
    rpName,
    rpId,
    expectedOrigin,
    challengeTtlMs: ADMIN_WEBAUTHN_CHALLENGE_TTL_MS,
    verificationSessionTtlMs: ADMIN_VERIFICATION_SESSION_TTL_MS,
    freshActionTtlMs: ADMIN_WEBAUTHN_FRESH_ACTION_TTL_MS,
    accountSessionTtlMs: ACCOUNT_PASSKEY_SESSION_TTL_MS,
  };
}

let configuredAdminWebAuthn: AdminWebAuthnConfiguration | undefined;

export function getAdminWebAuthnConfiguration() {
  configuredAdminWebAuthn ??= parseAdminWebAuthnConfiguration(process.env);
  return configuredAdminWebAuthn;
}
