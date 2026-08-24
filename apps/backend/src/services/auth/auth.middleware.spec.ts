process.env.FRONTEND_URL = 'https://admin.postiz.example';

import 'reflect-metadata';

jest.mock('@gitroom/helpers/auth/auth.service', () => ({
  AuthService: { verifyJWT: jest.fn() },
}));

jest.mock('@gitroom/nestjs-libraries/sentry/initialize.sentry', () => ({
  setSentryUserContext: jest.fn(),
}));

import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { HttpForbiddenException } from '@gitroom/nestjs-libraries/services/exception.filter';
import { ORIGINAL_OPERATOR_REQUEST_KEY } from '@gitroom/nestjs-libraries/user/original.operator.from.request';
import { AuthMiddleware, removeAuth } from './auth.middleware';
import { ADMIN_AUTH_COOKIE } from './admin-auth.cookie';
import { PASSKEY_AUTH_COOKIE } from './passkey-auth.cookie';

const verifyJWT = AuthService.verifyJWT as jest.Mock;

const superAdmin = {
  id: 'operator-1',
  email: 'root@postiz.example',
  isSuperAdmin: true,
  activated: true,
  password: 'hashed',
};

const impersonatedUser = {
  id: 'target-1',
  email: 'customer@postiz.example',
  isSuperAdmin: false,
  activated: true,
  password: 'hashed',
};

describe('AuthMiddleware original operator context', () => {
  const organizationService = {
    getUserOrg: jest.fn(),
    getOrgsByUserId: jest.fn(),
    updateApiKey: jest.fn(),
  };
  const userService = { getUserById: jest.fn() };
  const adminPasskeyService = {
    hasEnrolledPasskey: jest.fn().mockResolvedValue(false),
    hasValidAccountSession: jest.fn().mockResolvedValue(false),
  };
  const middleware = new AuthMiddleware(
    organizationService as any,
    userService as any,
    adminPasskeyService as any
  );

  const buildRequest = (cookies: Record<string, string> = {}) =>
    ({ headers: {}, cookies: { auth: 'signed-token', ...cookies } } as any);

  beforeEach(() => {
    jest.clearAllMocks();
    verifyJWT.mockReturnValue({ id: superAdmin.id, isSuperAdmin: false });
    userService.getUserById.mockResolvedValue({ ...superAdmin });
    organizationService.getOrgsByUserId.mockResolvedValue([
      { id: 'org-1', apiKey: 'key', users: [{ disabled: false }] },
    ]);
  });

  it('stores the database-loaded principal as the original operator', async () => {
    const request = buildRequest();

    await middleware.use(request, {} as any, jest.fn());

    expect(userService.getUserById).toHaveBeenCalledWith(superAdmin.id);
    expect(request[ORIGINAL_OPERATOR_REQUEST_KEY]).toEqual(
      expect.objectContaining({ id: superAdmin.id, isSuperAdmin: true })
    );
    expect(request[ORIGINAL_OPERATOR_REQUEST_KEY].password).toBeUndefined();
    expect(request.user.id).toBe(superAdmin.id);
  });

  it('keeps the original operator while impersonation replaces the request user', async () => {
    organizationService.getUserOrg.mockResolvedValue({
      user: { ...impersonatedUser },
      organization: { id: 'org-2', paymentId: null, users: [{ userId: impersonatedUser.id }] },
    });
    const request = buildRequest({ impersonate: impersonatedUser.id });

    await middleware.use(request, {} as any, jest.fn());

    expect(request.user.id).toBe(impersonatedUser.id);
    expect(request.user.isSuperAdmin).toBe(true);
    expect(request[ORIGINAL_OPERATOR_REQUEST_KEY].id).toBe(superAdmin.id);
  });

  it('never trusts a super-admin claim from the token body', async () => {
    verifyJWT.mockReturnValue({ id: superAdmin.id, isSuperAdmin: true });
    userService.getUserById.mockResolvedValue({
      ...superAdmin,
      isSuperAdmin: false,
    });
    const request = buildRequest();

    await middleware.use(request, {} as any, jest.fn());

    expect(request[ORIGINAL_OPERATOR_REQUEST_KEY].isSuperAdmin).toBe(false);
  });

  it.each([
    ['a deactivated user', { ...superAdmin, activated: false }],
    ['a deleted user', null],
  ])('leaves no original operator for %s', async (_label, loaded) => {
    userService.getUserById.mockResolvedValue(loaded);
    const request = buildRequest();

    await expect(
      middleware.use(request, {} as any, jest.fn())
    ).rejects.toBeInstanceOf(HttpForbiddenException);
    expect(request[ORIGINAL_OPERATOR_REQUEST_KEY]).toBeUndefined();
  });

  it('leaves no original operator when the request is unauthenticated', async () => {
    const request = { headers: {}, cookies: {} } as any;

    await expect(
      middleware.use(request, {} as any, jest.fn())
    ).rejects.toBeInstanceOf(HttpForbiddenException);
    expect(request[ORIGINAL_OPERATOR_REQUEST_KEY]).toBeUndefined();
  });
});

describe('removeAuth', () => {
  it('clears admin and account passkey cookies alongside normal auth', () => {
    const response = { cookie: jest.fn(), header: jest.fn() } as any;

    removeAuth(response);

    expect(response.cookie).toHaveBeenCalledWith(
      'auth',
      '',
      expect.objectContaining({ maxAge: -1 })
    );
    expect(response.cookie).toHaveBeenCalledWith(
      ADMIN_AUTH_COOKIE,
      '',
      expect.objectContaining({ maxAge: -1, expires: new Date(0) })
    );
    expect(response.cookie).toHaveBeenCalledWith(
      PASSKEY_AUTH_COOKIE,
      '',
      expect.objectContaining({ maxAge: -1, expires: new Date(0) })
    );
    expect(response.header).toHaveBeenCalledWith('logout', 'true');
  });
});
