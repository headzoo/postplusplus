/**
 * @jest-environment ./jest.jsdom.environment.js
 */

jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: jest.fn(),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  FetchWrapperComponent: ({ children }: { children: React.ReactNode }) =>
    children,
}));
jest.mock('@gitroom/frontend/app/(app)/auth/return.url.component', () => ({
  useReturnUrl: () => ({ getAndClear: () => null }),
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({}),
}));

import {
  mirrorAdminAuthHeaderToCookie,
  mirrorPasskeyAuthHeaderToCookie,
  setCookie,
} from './layout.context';

const readCookie = (name: string) => {
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return cookie ? cookie.slice(prefix.length) : null;
};

const clearCookie = (name: string) => {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
};

const responseWithHeader = (headers: Record<string, string>) =>
  ({
    headers: {
      get: (name: string) =>
        headers[name] ??
        headers[
          Object.keys(headers).find(
            (key) => key.toLowerCase() === name.toLowerCase()
          ) ?? ''
        ] ??
        null,
    },
  } as Pick<Response, 'headers'>);

describe('mirrorAdminAuthHeaderToCookie', () => {
  beforeEach(() => {
    clearCookie('admin_auth');
  });

  it('persists the admin-auth response header to admin_auth in NOT_SECURED mode', () => {
    mirrorAdminAuthHeaderToCookie(
      responseWithHeader({ 'admin-auth': 'step-up-token' }),
      false
    );

    expect(readCookie('admin_auth')).toBe('step-up-token');
  });

  it('accepts the Admin-Auth response header casing', () => {
    mirrorAdminAuthHeaderToCookie(
      responseWithHeader({ 'Admin-Auth': 'step-up-token-cased' }),
      false
    );

    expect(readCookie('admin_auth')).toBe('step-up-token-cased');
  });

  it('does not persist the admin-auth header when secured mode is enabled', () => {
    mirrorAdminAuthHeaderToCookie(
      responseWithHeader({ 'admin-auth': 'step-up-token' }),
      true
    );

    expect(readCookie('admin_auth')).toBeNull();
  });
});

describe('mirrorPasskeyAuthHeaderToCookie', () => {
  beforeEach(() => {
    clearCookie('passkey_auth');
  });

  it('persists the passkey-auth response header to passkey_auth in NOT_SECURED mode', () => {
    mirrorPasskeyAuthHeaderToCookie(
      responseWithHeader({ 'passkey-auth': 'account-passkey-token' }),
      false
    );

    expect(readCookie('passkey_auth')).toBe('account-passkey-token');
  });

  it('accepts the Passkey-Auth response header casing', () => {
    mirrorPasskeyAuthHeaderToCookie(
      responseWithHeader({ 'Passkey-Auth': 'account-passkey-token-cased' }),
      false
    );

    expect(readCookie('passkey_auth')).toBe('account-passkey-token-cased');
  });

  it('does not persist the passkey-auth header when secured mode is enabled', () => {
    mirrorPasskeyAuthHeaderToCookie(
      responseWithHeader({ 'passkey-auth': 'account-passkey-token' }),
      true
    );

    expect(readCookie('passkey_auth')).toBeNull();
  });
});

describe('setCookie', () => {
  beforeEach(() => {
    clearCookie('admin_auth');
  });

  it('writes cookies that can be read back in jsdom', () => {
    setCookie('admin_auth', 'mirrored-token', 365);

    expect(readCookie('admin_auth')).toBe('mirrored-token');
  });
});
