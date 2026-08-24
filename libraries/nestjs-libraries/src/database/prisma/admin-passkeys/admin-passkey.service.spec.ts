process.env.FRONTEND_URL = 'https://admin.postiz.example';

jest.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: jest.fn(),
  verifyRegistrationResponse: jest.fn(),
  generateAuthenticationOptions: jest.fn(),
  verifyAuthenticationResponse: jest.fn(),
}));

import { createHash } from 'crypto';
import { HttpException } from '@nestjs/common';
import { AdminWebAuthnChallengeKind } from '@prisma/client';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import {
  ACCOUNT_PASSKEY_SESSION_TTL_MS,
  ADMIN_VERIFICATION_SESSION_TTL_MS,
  ADMIN_WEBAUTHN_CHALLENGE_TTL_MS,
  ADMIN_WEBAUTHN_FRESH_ACTION_TTL_MS,
} from '@gitroom/nestjs-libraries/configuration/admin-webauthn.configuration';
import { AdminPasskeyRepository } from './admin-passkey.repository';
import {
  AdminPasskeyService,
  hashAdminSessionToken,
} from './admin-passkey.service';

const generateRegistrationOptionsMock =
  generateRegistrationOptions as jest.MockedFunction<
    typeof generateRegistrationOptions
  >;
const verifyRegistrationResponseMock =
  verifyRegistrationResponse as jest.MockedFunction<
    typeof verifyRegistrationResponse
  >;
const generateAuthenticationOptionsMock =
  generateAuthenticationOptions as jest.MockedFunction<
    typeof generateAuthenticationOptions
  >;
const verifyAuthenticationResponseMock =
  verifyAuthenticationResponse as jest.MockedFunction<
    typeof verifyAuthenticationResponse
  >;

const operator = {
  id: 'operator-1',
  email: 'root@postiz.example',
  isSuperAdmin: true,
  activated: true,
};

const storedCredential = {
  id: 'credential-row-1',
  credentialId: 'stored-credential-id',
  publicKey: Uint8Array.from([1, 2, 3]),
  counter: 4n,
  transports: ['internal'],
  deviceType: 'multiDevice',
  backedUp: true,
};

const registrationResponse = {
  id: 'new-credential-id',
  rawId: 'new-credential-id',
  type: 'public-key' as const,
  clientExtensionResults: {},
  response: { clientDataJSON: 'client-data', attestationObject: 'attestation' },
};

const assertionResponse = {
  id: 'stored-credential-id',
  rawId: 'stored-credential-id',
  type: 'public-key' as const,
  clientExtensionResults: {},
  response: {
    clientDataJSON: 'client-data',
    authenticatorData: 'authenticator-data',
    signature: 'signature',
  },
};

const buildRepository = () => ({
  countCredentials: jest.fn().mockResolvedValue(0),
  listCredentials: jest.fn().mockResolvedValue([]),
  findCredential: jest.fn().mockResolvedValue(null),
  createChallenge: jest.fn().mockResolvedValue({ id: 'challenge-1' }),
  hasPendingChallenge: jest.fn().mockResolvedValue(true),
  completeRegistration: jest.fn(),
  completeAssertion: jest.fn(),
  findActiveSession: jest.fn().mockResolvedValue(null),
  revokeSession: jest.fn().mockResolvedValue(1),
  revokeSessionsForUser: jest.fn().mockResolvedValue(1),
});

const expectStatus = async (promise: Promise<unknown>, status: number) => {
  await expect(promise).rejects.toBeInstanceOf(HttpException);
  await promise.catch((error: HttpException) => {
    expect(error.getStatus()).toBe(status);
  });
};

describe('AdminPasskeyService', () => {
  let repository: ReturnType<typeof buildRepository>;
  let service: AdminPasskeyService;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = buildRepository();
    service = new AdminPasskeyService(repository as any);
  });

  describe('operator authorization', () => {
    it.each([
      ['a missing operator', undefined],
      ['a non super-admin operator', { id: 'user-1', isSuperAdmin: false }],
      [
        'a deactivated super-admin',
        { id: 'user-1', isSuperAdmin: true, activated: false },
      ],
    ])('rejects %s on every ceremony with a plain 403', async (_label, principal) => {
      await expectStatus(service.getStatus(principal as any, 'token'), 403);
      await expectStatus(
        service.createRegistrationOptions(principal as any),
        403
      );
      await expectStatus(
        service.verifyRegistration(principal as any, registrationResponse as any),
        403
      );
      await expectStatus(service.createAssertionOptions(principal as any), 403);
      await expectStatus(
        service.verifyAssertion(principal as any, assertionResponse as any),
        403
      );
      expect(repository.countCredentials).not.toHaveBeenCalled();
      expect(verifyRegistrationResponseMock).not.toHaveBeenCalled();
      expect(verifyAuthenticationResponseMock).not.toHaveBeenCalled();
    });
  });

  describe('status', () => {
    it('reports an unenrolled operator as unverified', async () => {
      await expect(service.getStatus(operator, 'token')).resolves.toEqual({
        enrolled: false,
        verified: false,
        fresh: false,
        expiresAt: null,
        freshUntil: null,
      });
    });

    it('treats an enrolled operator without a session token as unverified', async () => {
      repository.countCredentials.mockResolvedValue(1);

      await expect(service.getStatus(operator)).resolves.toMatchObject({
        enrolled: true,
        verified: false,
      });
      expect(repository.findActiveSession).not.toHaveBeenCalled();
    });

    it('rejects a valid session that belongs to another operator', async () => {
      repository.countCredentials.mockResolvedValue(1);
      repository.findActiveSession.mockResolvedValue({
        id: 'session-1',
        userId: 'someone-else',
        credentialId: 'credential-row-1',
        authenticatedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.getStatus(operator, 'token')).resolves.toMatchObject({
        verified: false,
      });
    });

    it('reports a session as unverified once the operator has no credential left', async () => {
      repository.countCredentials.mockResolvedValue(0);
      repository.findActiveSession.mockResolvedValue({
        id: 'session-1',
        userId: operator.id,
        credentialId: null,
        authenticatedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.getStatus(operator, 'token')).resolves.toMatchObject({
        enrolled: false,
        verified: false,
      });
    });

    it('separates general validity from the fresh-action window', async () => {
      const authenticatedAt = new Date(
        Date.now() - ADMIN_WEBAUTHN_FRESH_ACTION_TTL_MS - 1_000
      );
      repository.countCredentials.mockResolvedValue(1);
      repository.findActiveSession.mockResolvedValue({
        id: 'session-1',
        userId: operator.id,
        credentialId: 'credential-row-1',
        authenticatedAt,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.getStatus(operator, 'token')).resolves.toMatchObject({
        enrolled: true,
        verified: true,
        fresh: false,
        freshUntil: new Date(
          authenticatedAt.getTime() + ADMIN_WEBAUTHN_FRESH_ACTION_TTL_MS
        ).toISOString(),
      });
      expect(repository.findActiveSession).toHaveBeenCalledWith(
        hashAdminSessionToken('token'),
        expect.any(Date)
      );
    });

    it('looks the session up by hash and never by the raw token', async () => {
      await service.getStatus(operator, 'raw-token');

      expect(repository.findActiveSession).toHaveBeenCalledWith(
        createHash('sha256').update('raw-token').digest('hex'),
        expect.any(Date)
      );
    });
  });

  describe('validateVerification', () => {
    const session = (authenticatedAt: Date) => ({
      id: 'session-1',
      userId: operator.id,
      credentialId: 'credential-row-1',
      authenticatedAt,
      expiresAt: new Date(Date.now() + ADMIN_VERIFICATION_SESSION_TTL_MS),
    });

    it('requires enrollment, then a session, then freshness', async () => {
      await expect(
        service.validateVerification(operator, 'token', 'general')
      ).resolves.toEqual({ valid: false, reason: 'enrollment' });

      repository.countCredentials.mockResolvedValue(1);
      await expect(
        service.validateVerification(operator, undefined, 'general')
      ).resolves.toEqual({ valid: false, reason: 'session' });

      repository.findActiveSession.mockResolvedValue(
        session(new Date(Date.now() - ADMIN_WEBAUTHN_FRESH_ACTION_TTL_MS - 1_000))
      );
      await expect(
        service.validateVerification(operator, 'token', 'fresh')
      ).resolves.toEqual({ valid: false, reason: 'stale' });
      await expect(
        service.validateVerification(operator, 'token', 'general')
      ).resolves.toMatchObject({ valid: true });

      repository.findActiveSession.mockResolvedValue(session(new Date()));
      await expect(
        service.validateVerification(operator, 'token', 'fresh')
      ).resolves.toMatchObject({ valid: true });
    });
  });

  describe('registration', () => {
    it('uses the configured relying party, prefers user verification and persists a 5 minute challenge', async () => {
      generateRegistrationOptionsMock.mockResolvedValue({
        challenge: 'registration-challenge',
      } as any);

      await service.createRegistrationOptions(operator);

      expect(generateRegistrationOptionsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          rpID: 'admin.postiz.example',
          rpName: 'Postiz',
          userName: operator.email,
          timeout: ADMIN_WEBAUTHN_CHALLENGE_TTL_MS,
          excludeCredentials: [],
          authenticatorSelection: expect.objectContaining({
            userVerification: 'preferred',
          }),
        })
      );
      const [userId, kind, challenge, expiresAt] =
        repository.createChallenge.mock.calls[0];
      expect(userId).toBe(operator.id);
      expect(kind).toBe(AdminWebAuthnChallengeKind.REGISTRATION);
      expect(challenge).toBe('registration-challenge');
      expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
        ADMIN_WEBAUTHN_CHALLENGE_TTL_MS
      );
      expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(
        ADMIN_WEBAUTHN_CHALLENGE_TTL_MS - 5_000
      );
    });

    it('refuses to start enrollment when a credential already exists', async () => {
      repository.listCredentials.mockResolvedValue([storedCredential]);

      await expectStatus(service.createRegistrationOptions(operator), 409);
      expect(generateRegistrationOptionsMock).not.toHaveBeenCalled();
    });

    it('refuses to verify a registration once a credential exists', async () => {
      repository.countCredentials.mockResolvedValue(1);

      await expectStatus(
        service.verifyRegistration(operator, registrationResponse as any),
        409
      );
      expect(verifyRegistrationResponseMock).not.toHaveBeenCalled();
      expect(repository.completeRegistration).not.toHaveBeenCalled();
    });

    it('rejects a challenge that is unknown, expired or bound to another ceremony', async () => {
      repository.hasPendingChallenge.mockResolvedValue(false);
      verifyRegistrationResponseMock.mockImplementation(async (options: any) => {
        if (!(await options.expectedChallenge('unknown-challenge'))) {
          throw new Error('Custom challenge verifier returned false');
        }
        return { verified: true } as any;
      });

      await expectStatus(
        service.verifyRegistration(operator, registrationResponse as any),
        400
      );
      expect(repository.hasPendingChallenge).toHaveBeenCalledWith(
        operator.id,
        AdminWebAuthnChallengeKind.REGISTRATION,
        'unknown-challenge',
        expect.any(Date)
      );
      expect(repository.completeRegistration).not.toHaveBeenCalled();
    });

    it('does not issue a session when the verifier fails', async () => {
      verifyRegistrationResponseMock.mockResolvedValue({
        verified: false,
      } as any);

      await expectStatus(
        service.verifyRegistration(operator, registrationResponse as any),
        400
      );
      expect(repository.completeRegistration).not.toHaveBeenCalled();
    });

    it('verifies against the trusted origin and stores only a hashed session token', async () => {
      const authenticatedAt = new Date();
      verifyRegistrationResponseMock.mockImplementation(async (options: any) => {
        expect(options.expectedOrigin).toBe('https://admin.postiz.example');
        expect(options.expectedRPID).toBe('admin.postiz.example');
        expect(options.requireUserVerification).toBe(false);
        await options.expectedChallenge('registration-challenge');
        return {
          verified: true,
          registrationInfo: {
            aaguid: 'aaguid-1',
            credentialDeviceType: 'multiDevice',
            credentialBackedUp: true,
            credential: {
              id: 'new-credential-id',
              publicKey: Uint8Array.from([9, 9]),
              counter: 0,
              transports: ['internal'],
            },
          },
        } as any;
      });
      repository.completeRegistration.mockImplementation(async (input: any) => ({
        outcome: 'created',
        session: {
          id: 'session-1',
          userId: operator.id,
          credentialId: 'credential-row-1',
          authenticatedAt,
          expiresAt: input.session.expiresAt,
        },
      }));

      const issued = await service.verifyRegistration(
        operator,
        registrationResponse as any
      );

      const input = repository.completeRegistration.mock.calls[0][0];
      expect(input.challenge).toBe('registration-challenge');
      expect(input.credential).toMatchObject({
        credentialId: 'new-credential-id',
        counter: 0n,
        transports: ['internal'],
        deviceType: 'multiDevice',
        backedUp: true,
        aaguid: 'aaguid-1',
      });
      expect(input.session.tokenHash).toBe(
        hashAdminSessionToken(issued.token)
      );
      expect(input.session.tokenHash).not.toBe(issued.token);
      expect(Buffer.from(issued.token, 'base64url')).toHaveLength(32);
      expect(
        input.session.expiresAt.getTime() - input.session.authenticatedAt.getTime()
      ).toBe(ADMIN_VERIFICATION_SESSION_TTL_MS);
      expect(issued.freshUntil.getTime()).toBe(
        authenticatedAt.getTime() + ADMIN_WEBAUTHN_FRESH_ACTION_TTL_MS
      );
    });

    it('reports a replayed challenge or duplicate credential as a client error', async () => {
      verifyRegistrationResponseMock.mockImplementation(async (options: any) => {
        await options.expectedChallenge('registration-challenge');
        return {
          verified: true,
          registrationInfo: {
            aaguid: '',
            credentialDeviceType: 'singleDevice',
            credentialBackedUp: false,
            credential: {
              id: 'new-credential-id',
              publicKey: Uint8Array.from([1]),
              counter: 0,
            },
          },
        } as any;
      });

      repository.completeRegistration.mockResolvedValue({
        outcome: 'challenge-unavailable',
      });
      await expectStatus(
        service.verifyRegistration(operator, registrationResponse as any),
        400
      );

      repository.completeRegistration.mockResolvedValue({
        outcome: 'credential-exists',
      });
      await expectStatus(
        service.verifyRegistration(operator, registrationResponse as any),
        409
      );
    });
  });

  describe('assertion', () => {
    it('refuses to start an assertion before enrollment', async () => {
      await expectStatus(service.createAssertionOptions(operator), 409);
      expect(generateAuthenticationOptionsMock).not.toHaveBeenCalled();
    });

    it('offers only the operator credentials and prefers user verification', async () => {
      repository.listCredentials.mockResolvedValue([storedCredential]);
      generateAuthenticationOptionsMock.mockResolvedValue({
        challenge: 'assertion-challenge',
      } as any);

      await service.createAssertionOptions(operator);

      expect(generateAuthenticationOptionsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          rpID: 'admin.postiz.example',
          userVerification: 'preferred',
          allowCredentials: [
            { id: 'stored-credential-id', transports: ['internal'] },
          ],
        })
      );
      expect(repository.createChallenge).toHaveBeenCalledWith(
        operator.id,
        AdminWebAuthnChallengeKind.AUTHENTICATION,
        'assertion-challenge',
        expect.any(Date)
      );
    });

    it('never verifies a credential that the operator does not own', async () => {
      repository.findCredential.mockResolvedValue(null);

      await expectStatus(
        service.verifyAssertion(operator, assertionResponse as any),
        400
      );
      expect(repository.findCredential).toHaveBeenCalledWith(
        operator.id,
        assertionResponse.id
      );
      expect(verifyAuthenticationResponseMock).not.toHaveBeenCalled();
      expect(repository.completeAssertion).not.toHaveBeenCalled();
    });

    it('rejects a bad origin, relying party or signature without issuing a session', async () => {
      repository.findCredential.mockResolvedValue(storedCredential);
      verifyAuthenticationResponseMock.mockRejectedValue(
        new Error('Unexpected authentication response origin')
      );

      await expectStatus(
        service.verifyAssertion(operator, assertionResponse as any),
        400
      );
      expect(repository.completeAssertion).not.toHaveBeenCalled();
    });

    it('persists the new authenticator counter and issues a fresh session', async () => {
      const authenticatedAt = new Date();
      repository.findCredential.mockResolvedValue(storedCredential);
      verifyAuthenticationResponseMock.mockImplementation(
        async (options: any) => {
          expect(options.expectedOrigin).toBe('https://admin.postiz.example');
          expect(options.expectedRPID).toBe('admin.postiz.example');
          expect(options.requireUserVerification).toBe(false);
          expect(options.credential).toEqual({
            id: storedCredential.credentialId,
            publicKey: storedCredential.publicKey,
            counter: 4,
            transports: ['internal'],
          });
          await options.expectedChallenge('assertion-challenge');
          return {
            verified: true,
            authenticationInfo: {
              credentialID: storedCredential.credentialId,
              newCounter: 12,
              userVerified: true,
              credentialDeviceType: 'multiDevice',
              credentialBackedUp: false,
              origin: 'https://admin.postiz.example',
              rpID: 'admin.postiz.example',
            },
          } as any;
        }
      );
      repository.completeAssertion.mockImplementation(async (input: any) => ({
        outcome: 'verified',
        session: {
          id: 'session-2',
          userId: operator.id,
          credentialId: storedCredential.id,
          authenticatedAt,
          expiresAt: input.session.expiresAt,
        },
      }));

      const issued = await service.verifyAssertion(
        operator,
        assertionResponse as any
      );

      const input = repository.completeAssertion.mock.calls[0][0];
      expect(input.challenge).toBe('assertion-challenge');
      expect(input.credential).toEqual({
        id: storedCredential.id,
        expectedCounter: 4n,
        counter: 12n,
        deviceType: 'multiDevice',
        backedUp: false,
      });
      expect(input.session.tokenHash).toBe(hashAdminSessionToken(issued.token));
      expect(issued.expiresAt.getTime() - authenticatedAt.getTime()).toBe(
        ADMIN_VERIFICATION_SESSION_TTL_MS
      );
    });

    it('allows a counterless authenticator to continue reporting zero', async () => {
      const counterlessCredential = { ...storedCredential, counter: 0n };
      repository.findCredential.mockResolvedValue(counterlessCredential);
      verifyAuthenticationResponseMock.mockImplementation(
        async (options: any) => {
          expect(options.credential.counter).toBe(0);
          await options.expectedChallenge('assertion-challenge');
          return {
            verified: true,
            authenticationInfo: {
              credentialID: counterlessCredential.credentialId,
              newCounter: 0,
              credentialDeviceType: 'multiDevice',
              credentialBackedUp: true,
            },
          } as any;
        }
      );
      repository.completeAssertion.mockImplementation(async (input: any) => ({
        outcome: 'verified',
        session: {
          id: 'session-counterless',
          userId: operator.id,
          credentialId: counterlessCredential.id,
          authenticatedAt: input.session.authenticatedAt,
          expiresAt: input.session.expiresAt,
        },
      }));

      await expect(
        service.verifyAssertion(operator, assertionResponse as any)
      ).resolves.toMatchObject({ token: expect.any(String) });

      expect(repository.completeAssertion.mock.calls[0][0].credential).toEqual(
        expect.objectContaining({
          expectedCounter: 0n,
          counter: 0n,
        })
      );
    });

    it('reports a consumed challenge, removed credential or changed counter state as a client error', async () => {
      repository.findCredential.mockResolvedValue(storedCredential);
      verifyAuthenticationResponseMock.mockImplementation(
        async (options: any) => {
          await options.expectedChallenge('assertion-challenge');
          return {
            verified: true,
            authenticationInfo: {
              credentialID: storedCredential.credentialId,
              newCounter: 5,
              credentialDeviceType: 'multiDevice',
              credentialBackedUp: true,
            },
          } as any;
        }
      );

      repository.completeAssertion.mockResolvedValue({
        outcome: 'challenge-unavailable',
      });
      await expectStatus(
        service.verifyAssertion(operator, assertionResponse as any),
        400
      );

      repository.completeAssertion.mockResolvedValue({
        outcome: 'credential-unavailable',
      });
      await expectStatus(
        service.verifyAssertion(operator, assertionResponse as any),
        400
      );

      repository.completeAssertion.mockResolvedValue({
        outcome: 'credential-state-changed',
      });
      await expectStatus(
        service.verifyAssertion(operator, assertionResponse as any),
        400
      );
    });
  });

  describe('revocation', () => {
    it('revokes by token hash and ignores a missing token', async () => {
      await expect(service.revokeSession('raw-token')).resolves.toBe(1);
      expect(repository.revokeSession).toHaveBeenCalledWith(
        hashAdminSessionToken('raw-token')
      );

      repository.revokeSession.mockClear();
      await expect(service.revokeSession(undefined)).resolves.toBe(0);
      expect(repository.revokeSession).not.toHaveBeenCalled();
    });
  });
});

describe('AdminPasskeyRepository assertion completion', () => {
  const completionInput = (expectedCounter: bigint, counter: bigint) => ({
    userId: operator.id,
    challenge: 'assertion-challenge',
    now: new Date(),
    credential: {
      id: storedCredential.id,
      expectedCounter,
      counter,
      deviceType: storedCredential.deviceType,
      backedUp: storedCredential.backedUp,
    },
    session: {
      tokenHash: 'token-hash',
      authenticatedAt: new Date(),
      expiresAt: new Date(Date.now() + ADMIN_VERIFICATION_SESSION_TTL_MS),
    },
  });

  const buildTransactionalRepository = (credentialUpdateCount: number) => {
    const tx = {
      adminWebAuthnChallenge: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      adminPasskeyCredential: {
        updateMany: jest
          .fn()
          .mockResolvedValue({ count: credentialUpdateCount }),
        findFirst: jest.fn().mockResolvedValue({ id: storedCredential.id }),
      },
      adminVerificationSession: {
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 'session-1',
          userId: data.userId,
          credentialId: data.credentialId,
          authenticatedAt: data.authenticatedAt,
          expiresAt: data.expiresAt,
        })),
      },
    };
    const transaction = {
      model: {
        $transaction: jest.fn().mockImplementation(async (callback: any) => {
          return callback(tx);
        }),
      },
    };

    return {
      repository: new AdminPasskeyRepository({} as any, transaction as any),
      tx,
    };
  };

  it('consumes the challenge but creates no session when the verified counter snapshot changed', async () => {
    const { repository, tx } = buildTransactionalRepository(0);

    await expect(
      repository.completeAssertion(completionInput(4n, 5n))
    ).resolves.toEqual({ outcome: 'credential-state-changed' });

    expect(tx.adminWebAuthnChallenge.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.adminPasskeyCredential.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ counter: 4n }),
        data: expect.objectContaining({ counter: 5n }),
      })
    );
    expect(tx.adminVerificationSession.create).not.toHaveBeenCalled();
  });

  it('accepts an unchanged zero-counter authenticator snapshot', async () => {
    const { repository, tx } = buildTransactionalRepository(1);

    await expect(
      repository.completeAssertion(completionInput(0n, 0n))
    ).resolves.toMatchObject({ outcome: 'verified' });

    expect(tx.adminPasskeyCredential.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ counter: 0n }),
        data: expect.objectContaining({ counter: 0n }),
      })
    );
    expect(tx.adminVerificationSession.create).toHaveBeenCalledTimes(1);
  });
});

describe('AdminPasskeyService account passkeys', () => {
  const repository = {
    countCredentials: jest.fn(),
    listCredentials: jest.fn(),
    findCredential: jest.fn(),
    createChallenge: jest.fn(),
    hasPendingChallenge: jest.fn(),
    completeRegistration: jest.fn(),
    completeAssertion: jest.fn(),
    findActiveSession: jest.fn(),
    revokeSession: jest.fn(),
    revokeSessionsForUser: jest.fn(),
    revokeCredentials: jest.fn(),
    deleteChallengesForUser: jest.fn(),
    createSessionOnly: jest.fn(),
  };

  const service = new AdminPasskeyService(repository as any);
  const member = {
    id: 'user-1',
    email: 'member@example.com',
    isSuperAdmin: false,
    activated: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows non-super-admins to read account passkey status', async () => {
    repository.countCredentials.mockResolvedValue(1);
    repository.findActiveSession.mockResolvedValue(null);

    await expect(service.getAccountStatus(member, undefined)).resolves.toEqual({
      enrolled: true,
      verified: false,
      expiresAt: null,
    });
  });

  it('rejects inactive users from account passkey flows', () => {
    expect(() =>
      service.assertUser({ ...member, activated: false })
    ).toThrow(HttpException);
  });

  it('treats a valid account session as general admin verification', async () => {
    const admin = {
      id: 'admin-1',
      email: 'admin@example.com',
      isSuperAdmin: true,
      activated: true,
    };
    const now = new Date();
    repository.countCredentials.mockResolvedValue(1);
    repository.findActiveSession.mockImplementation(async (tokenHash: string) => {
      if (tokenHash === hashAdminSessionToken('account-token')) {
        return {
          id: 'session-1',
          userId: admin.id,
          credentialId: 'cred-1',
          authenticatedAt: now,
          expiresAt: new Date(now.getTime() + 60_000),
        };
      }
      return null;
    });

    await expect(
      service.validateVerification(admin, undefined, 'general', 'account-token')
    ).resolves.toMatchObject({ valid: true });

    await expect(
      service.validateVerification(admin, undefined, 'fresh', 'account-token')
    ).resolves.toMatchObject({ valid: false, reason: 'session' });
  });

  it('revokes credentials, challenges, and sessions on disable', async () => {
    repository.revokeCredentials.mockResolvedValue(1);
    repository.deleteChallengesForUser.mockResolvedValue(2);
    repository.revokeSessionsForUser.mockResolvedValue(3);

    await expect(service.revokeCredential(member)).resolves.toEqual({
      revokedCredentials: 1,
      deletedChallenges: 2,
      revokedSessions: 3,
    });
  });

  it('issues a long-lived account session on registration, not the admin TTL', async () => {
    const authenticatedAt = new Date();
    repository.countCredentials.mockResolvedValue(0);
    repository.hasPendingChallenge.mockResolvedValue(true);
    verifyRegistrationResponseMock.mockImplementation(async (options: any) => {
      await options.expectedChallenge('registration-challenge');
      return {
        verified: true,
        registrationInfo: {
          aaguid: 'aaguid-1',
          credentialDeviceType: 'multiDevice',
          credentialBackedUp: true,
          credential: {
            id: 'new-credential-id',
            publicKey: Uint8Array.from([9, 9]),
            counter: 0,
            transports: ['internal'],
          },
        },
      } as any;
    });
    repository.completeRegistration.mockImplementation(async (input: any) => ({
      outcome: 'created',
      session: {
        id: 'session-account-reg',
        userId: member.id,
        credentialId: 'credential-row-1',
        authenticatedAt,
        expiresAt: input.session.expiresAt,
      },
    }));

    const issued = await service.verifyRegistration(
      member,
      registrationResponse as any,
      'account'
    );

    const input = repository.completeRegistration.mock.calls[0][0];
    expect(
      input.session.expiresAt.getTime() - input.session.authenticatedAt.getTime()
    ).toBe(ACCOUNT_PASSKEY_SESSION_TTL_MS);
    expect(
      input.session.expiresAt.getTime() - input.session.authenticatedAt.getTime()
    ).not.toBe(ADMIN_VERIFICATION_SESSION_TTL_MS);
    expect(issued.expiresAt.getTime()).toBe(input.session.expiresAt.getTime());
  });

  it('issues a long-lived account session on assertion, not the admin TTL', async () => {
    const authenticatedAt = new Date();
    repository.findCredential.mockResolvedValue(storedCredential);
    repository.hasPendingChallenge.mockResolvedValue(true);
    verifyAuthenticationResponseMock.mockImplementation(async (options: any) => {
      await options.expectedChallenge('assertion-challenge');
      return {
        verified: true,
        authenticationInfo: {
          credentialID: storedCredential.credentialId,
          newCounter: 12,
          userVerified: true,
          credentialDeviceType: 'multiDevice',
          credentialBackedUp: false,
          origin: 'https://admin.postiz.example',
          rpID: 'admin.postiz.example',
        },
      } as any;
    });
    repository.completeAssertion.mockImplementation(async (input: any) => ({
      outcome: 'verified',
      session: {
        id: 'session-account-assert',
        userId: member.id,
        credentialId: storedCredential.id,
        authenticatedAt,
        expiresAt: input.session.expiresAt,
      },
    }));

    const issued = await service.verifyAssertion(
      member,
      assertionResponse as any,
      'account'
    );

    const input = repository.completeAssertion.mock.calls[0][0];
    expect(
      input.session.expiresAt.getTime() - input.session.authenticatedAt.getTime()
    ).toBe(ACCOUNT_PASSKEY_SESSION_TTL_MS);
    expect(
      input.session.expiresAt.getTime() - input.session.authenticatedAt.getTime()
    ).not.toBe(ADMIN_VERIFICATION_SESSION_TTL_MS);
    expect(issued.expiresAt.getTime()).toBe(input.session.expiresAt.getTime());
  });
});
