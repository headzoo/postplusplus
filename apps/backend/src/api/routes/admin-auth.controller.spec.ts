process.env.FRONTEND_URL = 'https://admin.postiz.example';

import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  AdminPasskeyAssertionDto,
  AdminPasskeyRegistrationDto,
} from '@gitroom/nestjs-libraries/dtos/admin/admin-passkey.dto';
import { AdminAuthController } from './admin-auth.controller';
import {
  ADMIN_AUTH_COOKIE,
  ADMIN_AUTH_HEADER,
  clearAdminAuthCookie,
  readAdminAuthToken,
} from '@gitroom/backend/services/auth/admin-auth.cookie';

const operator = {
  id: 'operator-1',
  email: 'root@postiz.example',
  isSuperAdmin: true,
  activated: true,
};

const buildResponse = () => ({
  cookie: jest.fn(),
  header: jest.fn(),
});

const registrationBody = {
  id: 'credential-id',
  rawId: 'credential-id',
  type: 'public-key',
  clientExtensionResults: {},
  response: {
    clientDataJSON: 'client-data',
    attestationObject: 'attestation',
  },
};

const assertionBody = {
  id: 'credential-id',
  rawId: 'credential-id',
  type: 'public-key',
  clientExtensionResults: {},
  response: {
    clientDataJSON: 'client-data',
    authenticatorData: 'authenticator-data',
    signature: 'signature',
  },
};

describe('AdminAuthController', () => {
  const service = {
    getStatus: jest.fn(),
    createRegistrationOptions: jest.fn(),
    verifyRegistration: jest.fn(),
    createAssertionOptions: jest.fn(),
    verifyAssertion: jest.fn(),
  };
  const controller = new AdminAuthController(service as any);

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NOT_SECURED;
  });

  afterAll(() => {
    delete process.env.NOT_SECURED;
  });

  it('reports status for the original operator using the admin cookie', async () => {
    service.getStatus.mockResolvedValue({ enrolled: true, verified: false });

    await expect(
      controller.status(
        operator as any,
        {
          cookies: { [ADMIN_AUTH_COOKIE]: 'cookie-token' },
          headers: {},
        } as any
      )
    ).resolves.toEqual({ enrolled: true, verified: false });
    expect(service.getStatus).toHaveBeenCalledWith(operator, 'cookie-token');
  });

  it('passes an absent operator through so the service denies the request', async () => {
    service.createRegistrationOptions.mockResolvedValue({});

    await controller.registerOptions(undefined as any);

    expect(service.createRegistrationOptions).toHaveBeenCalledWith(undefined);
  });

  it.each([
    ['registerVerify', registrationBody],
    ['verify', assertionBody],
  ])(
    'sets a secure HttpOnly admin cookie after %s and never returns the token',
    async (method, body) => {
      const expiresAt = new Date(Date.now() + 20 * 60 * 1000);
      const freshUntil = new Date(Date.now() + 5 * 60 * 1000);
      const issued = { token: 'raw-session-token', expiresAt, freshUntil };
      service.verifyRegistration.mockResolvedValue(issued);
      service.verifyAssertion.mockResolvedValue(issued);
      const response = buildResponse();

      const result = await (controller as any)[method](
        operator,
        body,
        response
      );

      expect(result).toEqual({
        enrolled: true,
        verified: true,
        fresh: true,
        expiresAt: expiresAt.toISOString(),
        freshUntil: freshUntil.toISOString(),
      });
      expect(JSON.stringify(result)).not.toContain('raw-session-token');
      expect(response.cookie).toHaveBeenCalledWith(
        ADMIN_AUTH_COOKIE,
        'raw-session-token',
        expect.objectContaining({
          domain: '.postiz.example',
          path: '/',
          secure: true,
          httpOnly: true,
          sameSite: 'none',
          expires: expiresAt,
        })
      );
      expect(response.header).not.toHaveBeenCalled();
    }
  );

  it('mirrors the token through the admin-auth header only in local NOT_SECURED mode', async () => {
    process.env.NOT_SECURED = 'true';
    const expiresAt = new Date(Date.now() + 20 * 60 * 1000);
    service.verifyAssertion.mockResolvedValue({
      token: 'raw-session-token',
      expiresAt,
      freshUntil: expiresAt,
    });
    const response = buildResponse();

    await controller.verify(
      operator as any,
      assertionBody as any,
      response as any
    );

    expect(response.header).toHaveBeenCalledWith(
      ADMIN_AUTH_HEADER,
      'raw-session-token'
    );
    expect(response.cookie).toHaveBeenCalledWith(
      ADMIN_AUTH_COOKIE,
      'raw-session-token',
      expect.not.objectContaining({ httpOnly: true })
    );
  });

  describe('admin token transport', () => {
    it('ignores the mirrored header in secured deployments', () => {
      const request = {
        cookies: {},
        headers: { [ADMIN_AUTH_HEADER]: 'header-token' },
      } as any;

      expect(readAdminAuthToken(request)).toBeUndefined();

      process.env.NOT_SECURED = 'true';
      expect(readAdminAuthToken(request)).toBe('header-token');
    });

    it('prefers the cookie over the header', () => {
      process.env.NOT_SECURED = 'true';

      expect(
        readAdminAuthToken({
          cookies: { [ADMIN_AUTH_COOKIE]: 'cookie-token' },
          headers: { [ADMIN_AUTH_HEADER]: 'header-token' },
        } as any)
      ).toBe('cookie-token');
    });

    it('expires the cookie when cleared', () => {
      const response = buildResponse();

      clearAdminAuthCookie(response as any);

      expect(response.cookie).toHaveBeenCalledWith(
        ADMIN_AUTH_COOKIE,
        '',
        expect.objectContaining({
          expires: new Date(0),
          maxAge: -1,
          httpOnly: true,
          secure: true,
        })
      );
    });
  });

  describe('ceremony payload validation', () => {
    it('accepts well formed registration and assertion payloads', async () => {
      await expect(
        validate(plainToInstance(AdminPasskeyRegistrationDto, registrationBody))
      ).resolves.toHaveLength(0);
      await expect(
        validate(plainToInstance(AdminPasskeyAssertionDto, assertionBody))
      ).resolves.toHaveLength(0);
    });

    it('rejects payloads missing ceremony material or with the wrong type', async () => {
      await expect(
        validate(
          plainToInstance(AdminPasskeyRegistrationDto, {
            ...registrationBody,
            type: 'password',
          })
        )
      ).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ property: 'type' })])
      );
      await expect(
        validate(
          plainToInstance(AdminPasskeyRegistrationDto, {
            ...registrationBody,
            response: { clientDataJSON: 'client-data' },
          })
        )
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: 'response' }),
        ])
      );
      await expect(
        validate(
          plainToInstance(AdminPasskeyAssertionDto, {
            ...assertionBody,
            response: {
              clientDataJSON: 'client-data',
              authenticatorData: 'authenticator-data',
            },
          })
        )
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: 'response' }),
        ])
      );
      await expect(
        validate(plainToInstance(AdminPasskeyAssertionDto, { id: '' }))
      ).resolves.not.toHaveLength(0);
    });
  });
});
