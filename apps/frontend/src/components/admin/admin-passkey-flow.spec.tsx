/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminPasskeySetupComponent } from './admin-passkey-setup.component';
import { AdminPasskeyVerifyComponent } from './admin-passkey-verify.component';

const mockFetch = jest.fn();
const mockReplace = jest.fn();
const mockMutate = jest.fn();
const mockToaster = { show: jest.fn() };
const mockUseAdminAuthStatus = jest.fn();

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ admin: true }),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => mockToaster,
}));
jest.mock('./use.admin-auth', () => ({
  useAdminAuthStatus: () => mockUseAdminAuthStatus(),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams('returnTo=/admin/users'),
}));

class FakePublicKeyCredential {
  id = 'credential-id';
  rawId = new Uint8Array([1]).buffer;
  type = 'public-key';
  authenticatorAttachment = 'platform';
  response = {
    clientDataJSON: new Uint8Array([1]).buffer,
    attestationObject: new Uint8Array([2]).buffer,
    getTransports: () => ['internal'],
    authenticatorData: new Uint8Array([3]).buffer,
    signature: new Uint8Array([4]).buffer,
    userHandle: null,
  };

  getClientExtensionResults() {
    return {};
  }
}

describe('admin passkey flows', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockReplace.mockReset();
    mockMutate.mockReset().mockResolvedValue(undefined);
    mockToaster.show.mockReset();
    Object.defineProperty(globalThis, 'PublicKeyCredential', {
      configurable: true,
      value: FakePublicKeyCredential,
    });
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: {
        create: jest.fn().mockResolvedValue(new FakePublicKeyCredential()),
        get: jest.fn().mockResolvedValue(new FakePublicKeyCredential()),
      },
    });
  });

  it('enrolls a passkey and returns to a safe admin path', async () => {
    mockUseAdminAuthStatus.mockReturnValue({
      data: { enrolled: false, verified: false },
      mutate: mockMutate,
    });
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          challenge: 'AQ',
          rp: { name: 'Post++', id: 'example.test' },
          user: { id: 'AQ', name: 'admin@example.test', displayName: 'Admin' },
        }),
      })
      .mockResolvedValueOnce({ ok: true });

    render(<AdminPasskeySetupComponent />);
    fireEvent.click(screen.getByRole('button', { name: 'Set up passkey' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        '/admin-auth/register-verify',
        expect.objectContaining({ method: 'POST' })
      );
      expect(mockReplace).toHaveBeenCalledWith('/admin/users');
    });
  });

  it('verifies an enrolled passkey before returning', async () => {
    mockUseAdminAuthStatus.mockReturnValue({
      data: { enrolled: true, verified: false, fresh: false },
      mutate: mockMutate,
    });
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          challenge: 'AQ',
          rpId: 'example.test',
          allowCredentials: [{ id: 'AQ', type: 'public-key' }],
        }),
      })
      .mockResolvedValueOnce({ ok: true });

    render(<AdminPasskeyVerifyComponent />);
    fireEvent.click(screen.getByRole('button', { name: 'Verify passkey' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        '/admin-auth/verify',
        expect.objectContaining({ method: 'POST' })
      );
      expect(mockReplace).toHaveBeenCalledWith('/admin/users');
    });
  });

  it('shows verification ceremony after a stale-session 428 redirect', async () => {
    mockUseAdminAuthStatus.mockReturnValue({
      data: { enrolled: true, verified: true, fresh: false },
      mutate: mockMutate,
    });

    render(<AdminPasskeyVerifyComponent />);

    expect(screen.getByRole('button', { name: 'Verify passkey' })).toBeTruthy();
    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it('redirects away when the admin session is verified and fresh', async () => {
    mockUseAdminAuthStatus.mockReturnValue({
      data: { enrolled: true, verified: true, fresh: true },
      mutate: mockMutate,
    });

    render(<AdminPasskeyVerifyComponent />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/admin/users');
    });
    expect(screen.queryByRole('button', { name: 'Verify passkey' })).toBeNull();
  });
});
