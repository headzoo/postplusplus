process.env.FRONTEND_URL = 'https://admin.postiz.example';

import 'reflect-metadata';
import { HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { HttpForbiddenException } from '@gitroom/nestjs-libraries/services/exception.filter';
import { AdminPasskeyService } from '@gitroom/nestjs-libraries/database/prisma/admin-passkeys/admin-passkey.service';
import { ORIGINAL_OPERATOR_REQUEST_KEY } from '@gitroom/nestjs-libraries/user/original.operator.from.request';
import { RequireAdminStepUp } from './admin-step-up.decorator';
import {
  ADMIN_STEP_UP_FRESH_REQUIRED,
  ADMIN_STEP_UP_REQUIRED,
  AdminStepUpGuard,
} from './admin-step-up.guard';
import { ADMIN_AUTH_COOKIE, ADMIN_AUTH_HEADER } from './admin-auth.cookie';

const GENERAL_TTL_MS = 20 * 60 * 1000;
const FRESH_TTL_MS = 5 * 60 * 1000;

@RequireAdminStepUp('general')
class GuardedController {
  read() {
    return 'read';
  }

  @RequireAdminStepUp('fresh')
  mutate() {
    return 'mutate';
  }
}

class UnguardedController {
  open() {
    return 'open';
  }
}

const operator = {
  id: 'operator-1',
  email: 'root@postiz.example',
  isSuperAdmin: true,
  activated: true,
};

const buildContext = (
  target: any,
  method: string,
  request: Record<string, any>
) =>
  ({
    getType: () => 'http',
    getHandler: () => target.prototype[method],
    getClass: () => target,
    switchToHttp: () => ({ getRequest: () => request }),
  } as any);

describe('AdminStepUpGuard', () => {
  const repository = {
    countCredentials: jest.fn(),
    findActiveSession: jest.fn(),
  };
  const service = new AdminPasskeyService(repository as any);
  const guard = new AdminStepUpGuard(new Reflector(), service);

  const activeSession = (authenticatedAgoMs: number) => ({
    id: 'session-1',
    userId: operator.id,
    credentialId: 'credential-1',
    authenticatedAt: new Date(Date.now() - authenticatedAgoMs),
    expiresAt: new Date(Date.now() + GENERAL_TTL_MS - authenticatedAgoMs),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NOT_SECURED;
    repository.countCredentials.mockResolvedValue(1);
    repository.findActiveSession.mockResolvedValue(activeSession(0));
  });

  afterAll(() => {
    delete process.env.NOT_SECURED;
  });

  const verifiedRequest = (extra: Record<string, any> = {}) => ({
    cookies: { [ADMIN_AUTH_COOKIE]: 'raw-token' },
    headers: {},
    [ORIGINAL_OPERATOR_REQUEST_KEY]: operator,
    ...extra,
  });

  it('no-ops on handlers without step-up metadata', async () => {
    await expect(
      guard.canActivate(
        buildContext(UnguardedController, 'open', { cookies: {}, headers: {} })
      )
    ).resolves.toBe(true);
    expect(repository.findActiveSession).not.toHaveBeenCalled();
  });

  it('allows a verified operator through the class-level general policy', async () => {
    await expect(
      guard.canActivate(
        buildContext(GuardedController, 'read', verifiedRequest())
      )
    ).resolves.toBe(true);
    expect(repository.findActiveSession).toHaveBeenCalledWith(
      createHash('sha256').update('raw-token').digest('hex'),
      expect.any(Date)
    );
  });

  it('accepts a general-policy session that is past the fresh window', async () => {
    repository.findActiveSession.mockResolvedValue(
      activeSession(FRESH_TTL_MS + 1000)
    );

    await expect(
      guard.canActivate(
        buildContext(GuardedController, 'read', verifiedRequest())
      )
    ).resolves.toBe(true);
  });

  it('lets a handler policy override the class policy and rejects a stale session', async () => {
    repository.findActiveSession.mockResolvedValue(
      activeSession(FRESH_TTL_MS + 1000)
    );

    const error = await guard
      .canActivate(buildContext(GuardedController, 'mutate', verifiedRequest()))
      .catch((thrown) => thrown);

    expect(error).toBeInstanceOf(HttpException);
    expect(error).not.toBeInstanceOf(HttpForbiddenException);
    expect(error.getStatus()).toBe(428);
    expect(error.getResponse()).toEqual(
      expect.objectContaining({
        code: ADMIN_STEP_UP_FRESH_REQUIRED,
        policy: 'fresh',
        reason: 'stale',
      })
    );
  });

  it('accepts a fresh session on a fresh-policy handler', async () => {
    repository.findActiveSession.mockResolvedValue(activeSession(1000));

    await expect(
      guard.canActivate(
        buildContext(GuardedController, 'mutate', verifiedRequest())
      )
    ).resolves.toBe(true);
  });

  it.each([
    [
      'a missing or expired session',
      () => repository.findActiveSession.mockResolvedValue(null),
      'session',
    ],
    [
      'a revoked session',
      () => repository.findActiveSession.mockResolvedValue(null),
      'session',
    ],
    [
      'no enrolled credential',
      () => repository.countCredentials.mockResolvedValue(0),
      'enrollment',
    ],
  ])(
    'returns a machine-readable 428 for %s',
    async (_label, arrange, reason) => {
      arrange();

      const error = await guard
        .canActivate(buildContext(GuardedController, 'read', verifiedRequest()))
        .catch((thrown) => thrown);

      expect(error).toBeInstanceOf(HttpException);
      expect(error).not.toBeInstanceOf(HttpForbiddenException);
      expect(error.getStatus()).toBe(428);
      expect(error.getResponse()).toEqual(
        expect.objectContaining({
          code: ADMIN_STEP_UP_REQUIRED,
          policy: 'general',
          reason,
        })
      );
    }
  );

  it('rejects a session that belongs to a different operator', async () => {
    repository.findActiveSession.mockResolvedValue({
      ...activeSession(0),
      userId: 'someone-else',
    });

    const error = await guard
      .canActivate(buildContext(GuardedController, 'read', verifiedRequest()))
      .catch((thrown) => thrown);

    expect(error.getStatus()).toBe(428);
  });

  it.each([
    ['a missing original operator', undefined],
    ['a non super-admin operator', { id: 'user-1', isSuperAdmin: false }],
    [
      'a deactivated super-admin',
      { id: 'user-1', isSuperAdmin: true, activated: false },
    ],
  ])(
    'returns 403 without clearing normal auth for %s',
    async (_label, principal) => {
      const error = await guard
        .canActivate(
          buildContext(GuardedController, 'read', {
            cookies: { [ADMIN_AUTH_COOKIE]: 'raw-token' },
            headers: {},
            [ORIGINAL_OPERATOR_REQUEST_KEY]: principal,
          })
        )
        .catch((thrown) => thrown);

      expect(error).toBeInstanceOf(HttpException);
      expect(error).not.toBeInstanceOf(HttpForbiddenException);
      expect(error.getStatus()).toBe(403);
    }
  );

  it('uses the original operator while the request user is an impersonated non-admin', async () => {
    await expect(
      guard.canActivate(
        buildContext(
          GuardedController,
          'read',
          verifiedRequest({
            user: { id: 'impersonated-1', isSuperAdmin: false },
          })
        )
      )
    ).resolves.toBe(true);
    expect(repository.countCredentials).toHaveBeenCalledWith(operator.id);
  });

  it('never accepts a synthetic impersonated isSuperAdmin as the operator', async () => {
    const error = await guard
      .canActivate(
        buildContext(GuardedController, 'read', {
          cookies: { [ADMIN_AUTH_COOKIE]: 'raw-token' },
          headers: {},
          user: { id: 'impersonated-1', isSuperAdmin: true, activated: true },
        })
      )
      .catch((thrown) => thrown);

    expect(error.getStatus()).toBe(403);
    expect(repository.findActiveSession).not.toHaveBeenCalled();
  });

  it('ignores the mirrored admin-auth header in secured deployments', async () => {
    const request = {
      cookies: {},
      headers: { [ADMIN_AUTH_HEADER]: 'raw-token' },
      [ORIGINAL_OPERATOR_REQUEST_KEY]: operator,
    };

    const error = await guard
      .canActivate(buildContext(GuardedController, 'read', request))
      .catch((thrown) => thrown);

    expect(error.getStatus()).toBe(428);
    expect(repository.findActiveSession).not.toHaveBeenCalled();

    process.env.NOT_SECURED = 'true';
    await expect(
      guard.canActivate(buildContext(GuardedController, 'read', request))
    ).resolves.toBe(true);
  });

  it('skips non-http execution contexts', async () => {
    await expect(
      guard.canActivate({
        getType: () => 'ws',
        getHandler: () => GuardedController.prototype.read,
        getClass: () => GuardedController,
      } as any)
    ).resolves.toBe(true);
  });
});
