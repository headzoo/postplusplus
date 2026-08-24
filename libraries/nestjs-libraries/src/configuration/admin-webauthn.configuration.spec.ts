import {
  ACCOUNT_PASSKEY_SESSION_TTL_MS,
  ADMIN_VERIFICATION_SESSION_TTL_MS,
  ADMIN_WEBAUTHN_CHALLENGE_TTL_MS,
  ADMIN_WEBAUTHN_FRESH_ACTION_TTL_MS,
  parseAdminWebAuthnConfiguration,
} from './admin-webauthn.configuration';

describe('admin WebAuthn configuration', () => {
  it('derives the WebAuthn origin and relying-party ID from FRONTEND_URL', () => {
    expect(
      parseAdminWebAuthnConfiguration({
        FRONTEND_URL: 'https://admin.postiz.example',
      })
    ).toEqual({
      rpName: 'Postiz',
      rpId: 'admin.postiz.example',
      expectedOrigin: 'https://admin.postiz.example',
      challengeTtlMs: ADMIN_WEBAUTHN_CHALLENGE_TTL_MS,
      verificationSessionTtlMs: ADMIN_VERIFICATION_SESSION_TTL_MS,
      freshActionTtlMs: ADMIN_WEBAUTHN_FRESH_ACTION_TTL_MS,
      accountSessionTtlMs: ACCOUNT_PASSKEY_SESSION_TTL_MS,
    });
  });

  it('accepts a parent RP ID and explicit origin override', () => {
    expect(
      parseAdminWebAuthnConfiguration({
        FRONTEND_URL: 'https://unused.postiz.example',
        ADMIN_WEBAUTHN_ORIGIN: 'https://admin.postiz.example',
        ADMIN_WEBAUTHN_RP_ID: 'postiz.example',
        ADMIN_WEBAUTHN_RP_NAME: 'Postiz Admin',
      })
    ).toMatchObject({
      expectedOrigin: 'https://admin.postiz.example',
      rpId: 'postiz.example',
      rpName: 'Postiz Admin',
    });
  });

  it('rejects non-origin URLs and RP IDs outside the configured origin', () => {
    expect(() =>
      parseAdminWebAuthnConfiguration({
        FRONTEND_URL: 'https://postiz.example/admin',
      })
    ).toThrow('FRONTEND_URL must be a valid HTTP(S) origin');
    expect(() =>
      parseAdminWebAuthnConfiguration({
        FRONTEND_URL: 'https://postiz.example',
        ADMIN_WEBAUTHN_RP_ID: 'another.example',
      })
    ).toThrow('ADMIN_WEBAUTHN_RP_ID must match');
  });
});
