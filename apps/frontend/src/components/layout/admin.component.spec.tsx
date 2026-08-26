/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminGuard } from './admin.component';

const mockReplace = jest.fn();
const mockUseAdminAuthStatus = jest.fn();

jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ admin: true }),
}));
jest.mock('@gitroom/frontend/components/admin/use.admin-auth', () => ({
  useAdminAuthStatus: () => mockUseAdminAuthStatus(),
}));
jest.mock('next/navigation', () => ({
  usePathname: () => '/admin/users',
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  useSearchParams: () => new URLSearchParams('filter=active'),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/frontend/components/admin/admin-general.component', () => ({
  AdminGeneralComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/admin/admin-users.component', () => ({
  AdminUsersComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/admin/admin-errors.component', () => ({
  AdminErrorsComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/admin/admin-stats.component', () => ({
  AdminStatsComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/admin/admin-schedule.component', () => ({
  AdminScheduleComponent: () => null,
}));

describe('AdminGuard', () => {
  beforeEach(() => {
    mockReplace.mockReset();
  });

  it('renders admin content only after passkey verification', () => {
    mockUseAdminAuthStatus.mockReturnValue({
      data: { enrolled: true, verified: true, fresh: true },
    });

    render(
      <AdminGuard>
        <div>Protected admin content</div>
      </AdminGuard>
    );

    expect(screen.getByText('Protected admin content')).toBeTruthy();
  });

  it('keeps stale-but-verified sessions on admin until step-up is required', () => {
    mockUseAdminAuthStatus.mockReturnValue({
      data: { enrolled: true, verified: true, fresh: false },
    });

    render(
      <AdminGuard>
        <div>Protected admin content</div>
      </AdminGuard>
    );

    expect(screen.getByText('Protected admin content')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('routes unenrolled users to setup without rendering admin content', async () => {
    mockUseAdminAuthStatus.mockReturnValue({
      data: { enrolled: false, verified: false },
    });

    render(
      <AdminGuard>
        <div>Protected admin content</div>
      </AdminGuard>
    );

    expect(screen.queryByText('Protected admin content')).toBeNull();
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        '/admin/passkey/setup?returnTo=%2Fadmin%2Fusers%3Ffilter%3Dactive'
      );
    });
  });
});
