import { createHash, randomBytes } from 'crypto';
import { HttpException, Injectable } from '@nestjs/common';
import { AdminWebAuthnChallengeKind } from '@prisma/client';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import {
  AdminWebAuthnConfiguration,
  getAdminWebAuthnConfiguration,
} from '@gitroom/nestjs-libraries/configuration/admin-webauthn.configuration';
import {
  AdminPasskeyRepository,
  AdminVerificationSessionRecord,
} from '@gitroom/nestjs-libraries/database/prisma/admin-passkeys/admin-passkey.repository';

export const ADMIN_SESSION_TOKEN_BYTES = 32;

export type AdminOperator = {
  id: string;
  email?: string | null;
  name?: string | null;
  isSuperAdmin?: boolean | null;
  activated?: boolean | null;
};

export type AdminVerificationPolicy = 'general' | 'fresh';

export type AdminVerificationStatus = {
  enrolled: boolean;
  verified: boolean;
  fresh: boolean;
  expiresAt: string | null;
  freshUntil: string | null;
};

export type AdminVerificationIssue = {
  token: string;
  expiresAt: Date;
  freshUntil: Date;
};

export type AdminVerificationCheck =
  | { valid: true; expiresAt: Date; freshUntil: Date }
  | { valid: false; reason: 'enrollment' | 'session' | 'stale' };

export type PasskeySessionKind = 'admin' | 'account';

export type AccountPasskeyStatus = {
  enrolled: boolean;
  verified: boolean;
  expiresAt: string | null;
};

export function hashAdminSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AdminPasskeyService {
  constructor(private _adminPasskeyRepository: AdminPasskeyRepository) {}

  assertOperator(operator?: AdminOperator | null) {
    if (
      !operator?.id ||
      operator.isSuperAdmin !== true ||
      operator.activated === false
    ) {
      // Deliberately not HttpForbiddenException: that filter clears the
      // operator's normal login instead of only denying this capability.
      throw new HttpException('Forbidden', 403);
    }

    return operator;
  }

  assertUser(user?: AdminOperator | null) {
    if (!user?.id || user.activated === false) {
      // Deliberately not HttpForbiddenException: that filter clears the
      // normal login instead of only denying this capability.
      throw new HttpException('Forbidden', 403);
    }

    return user;
  }

  async getStatus(
    operator?: AdminOperator | null,
    token?: string,
    accountToken?: string
  ): Promise<AdminVerificationStatus> {
    const admin = this.assertOperator(operator);
    const configuration = getAdminWebAuthnConfiguration();
    const now = new Date();
    const [credentials, adminSession, accountSession] = await Promise.all([
      this._adminPasskeyRepository.countCredentials(admin.id),
      this.loadSession(admin.id, token, now),
      this.loadSession(admin.id, accountToken, now),
    ]);

    const session = adminSession ?? accountSession;

    if (!credentials || !session) {
      return {
        enrolled: credentials > 0,
        verified: false,
        fresh: false,
        expiresAt: null,
        freshUntil: null,
      };
    }

    // Freshness only comes from a short-lived admin step-up session.
    const freshUntil = adminSession
      ? new Date(
          adminSession.authenticatedAt.getTime() +
            configuration.freshActionTtlMs
        )
      : new Date(0);

    return {
      enrolled: true,
      verified: true,
      fresh: !!adminSession && freshUntil.getTime() > now.getTime(),
      expiresAt: session.expiresAt.toISOString(),
      freshUntil: adminSession ? freshUntil.toISOString() : null,
    };
  }

  async getAccountStatus(
    user?: AdminOperator | null,
    token?: string
  ): Promise<AccountPasskeyStatus> {
    const account = this.assertUser(user);
    const now = new Date();
    const [credentials, session] = await Promise.all([
      this._adminPasskeyRepository.countCredentials(account.id),
      this.loadSession(account.id, token, now),
    ]);

    if (!credentials || !session) {
      return {
        enrolled: credentials > 0,
        verified: false,
        expiresAt: null,
      };
    }

    return {
      enrolled: true,
      verified: true,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async hasEnrolledPasskey(userId: string) {
    return (await this._adminPasskeyRepository.countCredentials(userId)) > 0;
  }

  async hasValidAccountSession(userId: string, token?: string) {
    const session = await this.loadSession(userId, token, new Date());
    return !!session;
  }

  async validateVerification(
    operator: AdminOperator | null | undefined,
    token: string | undefined,
    policy: AdminVerificationPolicy,
    accountToken?: string
  ): Promise<AdminVerificationCheck> {
    const admin = this.assertOperator(operator);
    const configuration = getAdminWebAuthnConfiguration();
    const now = new Date();
    const [credentials, adminSession, accountSession] = await Promise.all([
      this._adminPasskeyRepository.countCredentials(admin.id),
      this.loadSession(admin.id, token, now),
      this.loadSession(admin.id, accountToken, now),
    ]);

    if (!credentials) {
      return { valid: false, reason: 'enrollment' };
    }

    if (policy === 'fresh') {
      if (!adminSession) {
        return { valid: false, reason: 'session' };
      }

      const freshUntil = new Date(
        adminSession.authenticatedAt.getTime() + configuration.freshActionTtlMs
      );

      if (freshUntil.getTime() <= now.getTime()) {
        return { valid: false, reason: 'stale' };
      }

      return {
        valid: true,
        expiresAt: adminSession.expiresAt,
        freshUntil,
      };
    }

    const session = adminSession ?? accountSession;
    if (!session) {
      return { valid: false, reason: 'session' };
    }

    const freshUntil = adminSession
      ? new Date(
          adminSession.authenticatedAt.getTime() +
            configuration.freshActionTtlMs
        )
      : new Date(0);

    return { valid: true, expiresAt: session.expiresAt, freshUntil };
  }

  async createRegistrationOptions(operator?: AdminOperator | null) {
    const admin = this.assertUser(operator);
    const configuration = getAdminWebAuthnConfiguration();
    const credentials = await this._adminPasskeyRepository.listCredentials(
      admin.id
    );

    if (credentials.length) {
      throw new HttpException('A passkey is already enrolled', 409);
    }

    const options = await generateRegistrationOptions({
      rpName: configuration.rpName,
      rpID: configuration.rpId,
      userID: new TextEncoder().encode(admin.id),
      userName: admin.email || admin.id,
      userDisplayName: admin.name || admin.email || admin.id,
      timeout: configuration.challengeTtlMs,
      attestationType: 'none',
      excludeCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: this.toTransports(credential.transports),
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        requireResidentKey: false,
        userVerification: 'preferred',
      },
    });

    await this.persistChallenge(
      admin.id,
      AdminWebAuthnChallengeKind.REGISTRATION,
      options.challenge,
      configuration
    );

    return options;
  }

  async verifyRegistration(
    operator: AdminOperator | null | undefined,
    response: RegistrationResponseJSON,
    sessionKind: PasskeySessionKind = 'admin'
  ): Promise<AdminVerificationIssue> {
    const admin = this.assertUser(operator);
    const configuration = getAdminWebAuthnConfiguration();

    if (await this._adminPasskeyRepository.countCredentials(admin.id)) {
      throw new HttpException('A passkey is already enrolled', 409);
    }

    const now = new Date();
    let presentedChallenge: string | undefined;
    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;

    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: async (challenge) => {
          const pending =
            await this._adminPasskeyRepository.hasPendingChallenge(
              admin.id,
              AdminWebAuthnChallengeKind.REGISTRATION,
              challenge,
              now
            );
          if (!pending) {
            return false;
          }
          presentedChallenge = challenge;
          return true;
        },
        expectedOrigin: configuration.expectedOrigin,
        expectedRPID: configuration.rpId,
        requireUserVerification: false,
      });
    } catch {
      throw this.registrationRejected();
    }

    if (!verification.verified || !presentedChallenge) {
      throw this.registrationRejected();
    }

    const { credential, credentialDeviceType, credentialBackedUp, aaguid } =
      verification.registrationInfo;
    const issued = this.issueSessionToken(now, configuration, sessionKind);
    const result = await this._adminPasskeyRepository.completeRegistration({
      userId: admin.id,
      challenge: presentedChallenge,
      now,
      credential: {
        credentialId: credential.id,
        publicKey: credential.publicKey,
        counter: BigInt(credential.counter),
        transports: credential.transports ? [...credential.transports] : null,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        aaguid: aaguid || null,
      },
      session: {
        tokenHash: issued.tokenHash,
        authenticatedAt: now,
        expiresAt: issued.expiresAt,
      },
    });

    if (result.outcome === 'credential-exists') {
      throw new HttpException('A passkey is already enrolled', 409);
    }

    if (result.outcome !== 'created') {
      throw this.registrationRejected();
    }

    return this.toIssuedSession(issued, result.session, configuration);
  }

  async createAssertionOptions(operator?: AdminOperator | null) {
    const admin = this.assertUser(operator);
    const configuration = getAdminWebAuthnConfiguration();
    const credentials = await this._adminPasskeyRepository.listCredentials(
      admin.id
    );

    if (!credentials.length) {
      throw new HttpException('No passkey is enrolled', 409);
    }

    const options = await generateAuthenticationOptions({
      rpID: configuration.rpId,
      timeout: configuration.challengeTtlMs,
      userVerification: 'preferred',
      allowCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: this.toTransports(credential.transports),
      })),
    });

    await this.persistChallenge(
      admin.id,
      AdminWebAuthnChallengeKind.AUTHENTICATION,
      options.challenge,
      configuration
    );

    return options;
  }

  async verifyAssertion(
    operator: AdminOperator | null | undefined,
    response: AuthenticationResponseJSON,
    sessionKind: PasskeySessionKind = 'admin'
  ): Promise<AdminVerificationIssue> {
    const admin = this.assertUser(operator);
    const configuration = getAdminWebAuthnConfiguration();
    const now = new Date();
    const credential = await this._adminPasskeyRepository.findCredential(
      admin.id,
      response.id
    );

    if (!credential) {
      throw this.assertionRejected();
    }

    let presentedChallenge: string | undefined;
    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;

    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: async (challenge) => {
          const pending =
            await this._adminPasskeyRepository.hasPendingChallenge(
              admin.id,
              AdminWebAuthnChallengeKind.AUTHENTICATION,
              challenge,
              now
            );
          if (!pending) {
            return false;
          }
          presentedChallenge = challenge;
          return true;
        },
        expectedOrigin: configuration.expectedOrigin,
        expectedRPID: configuration.rpId,
        requireUserVerification: false,
        credential: {
          id: credential.credentialId,
          publicKey: credential.publicKey,
          counter: Number(credential.counter),
          transports: this.toTransports(credential.transports),
        },
      });
    } catch {
      throw this.assertionRejected();
    }

    if (!verification.verified || !presentedChallenge) {
      throw this.assertionRejected();
    }

    const issued = this.issueSessionToken(now, configuration, sessionKind);
    const result = await this._adminPasskeyRepository.completeAssertion({
      userId: admin.id,
      challenge: presentedChallenge,
      now,
      credential: {
        id: credential.id,
        expectedCounter: credential.counter,
        counter: BigInt(verification.authenticationInfo.newCounter),
        deviceType: verification.authenticationInfo.credentialDeviceType,
        backedUp: verification.authenticationInfo.credentialBackedUp,
      },
      session: {
        tokenHash: issued.tokenHash,
        authenticatedAt: now,
        expiresAt: issued.expiresAt,
      },
    });

    if (result.outcome !== 'verified') {
      throw this.assertionRejected();
    }

    return this.toIssuedSession(issued, result.session, configuration);
  }

  async revokeCredential(user?: AdminOperator | null) {
    const account = this.assertUser(user);
    const [revokedCredentials, deletedChallenges, revokedSessions] =
      await Promise.all([
        this._adminPasskeyRepository.revokeCredentials(account.id),
        this._adminPasskeyRepository.deleteChallengesForUser(account.id),
        this._adminPasskeyRepository.revokeSessionsForUser(account.id),
      ]);

    return {
      revokedCredentials,
      deletedChallenges,
      revokedSessions,
    };
  }

  /**
   * Issues an account session (long TTL). Super-admins also receive a short
   * admin step-up session so /admin does not immediately re-prompt.
   */
  async issueLoginSessions(
    user: AdminOperator,
    response: AuthenticationResponseJSON | RegistrationResponseJSON,
    mode: 'registration' | 'assertion'
  ): Promise<{
    account: AdminVerificationIssue;
    admin?: AdminVerificationIssue;
  }> {
    if (mode === 'registration') {
      const account = await this.verifyRegistration(
        user,
        response as RegistrationResponseJSON,
        'account'
      );
      if (user.isSuperAdmin === true) {
        // Registration already consumed the challenge; mint admin session
        // from a fresh account-verified credential path by issuing a second
        // short-lived session token bound to the same user.
        const admin = await this.issueCompanionAdminSessionForUser(user.id);
        return { account, admin };
      }
      return { account };
    }

    const account = await this.verifyAssertion(
      user,
      response as AuthenticationResponseJSON,
      'account'
    );
    if (user.isSuperAdmin === true) {
      const admin = await this.issueCompanionAdminSessionForUser(user.id);
      return { account, admin };
    }
    return { account };
  }

  revokeSession(token?: string) {
    if (!token) {
      return Promise.resolve(0);
    }

    return this._adminPasskeyRepository.revokeSession(
      hashAdminSessionToken(token)
    );
  }

  revokeSessionsForUser(userId: string) {
    return this._adminPasskeyRepository.revokeSessionsForUser(userId);
  }

  private async loadSession(
    userId: string,
    token: string | undefined,
    now: Date
  ) {
    if (!token) {
      return null;
    }

    const session = await this._adminPasskeyRepository.findActiveSession(
      hashAdminSessionToken(token),
      now
    );

    if (!session || session.userId !== userId) {
      return null;
    }

    return session;
  }

  private persistChallenge(
    userId: string,
    kind: AdminWebAuthnChallengeKind,
    challenge: string,
    configuration: AdminWebAuthnConfiguration
  ) {
    return this._adminPasskeyRepository.createChallenge(
      userId,
      kind,
      challenge,
      new Date(Date.now() + configuration.challengeTtlMs)
    );
  }

  async issueCompanionAdminSessionForUser(
    userId: string
  ): Promise<AdminVerificationIssue> {
    const configuration = getAdminWebAuthnConfiguration();
    const now = new Date();
    const issued = this.issueSessionToken(now, configuration, 'admin');
    const session = await this._adminPasskeyRepository.createSessionOnly({
      userId,
      session: {
        tokenHash: issued.tokenHash,
        authenticatedAt: now,
        expiresAt: issued.expiresAt,
      },
    });

    return this.toIssuedSession(issued, session, configuration);
  }

  private issueSessionToken(
    now: Date,
    configuration: AdminWebAuthnConfiguration,
    kind: PasskeySessionKind = 'admin'
  ) {
    const token = randomBytes(ADMIN_SESSION_TOKEN_BYTES).toString('base64url');
    const ttlMs =
      kind === 'account'
        ? configuration.accountSessionTtlMs
        : configuration.verificationSessionTtlMs;

    return {
      token,
      tokenHash: hashAdminSessionToken(token),
      expiresAt: new Date(now.getTime() + ttlMs),
    };
  }

  private toIssuedSession(
    issued: { token: string; expiresAt: Date },
    session: AdminVerificationSessionRecord,
    configuration: AdminWebAuthnConfiguration
  ): AdminVerificationIssue {
    return {
      token: issued.token,
      expiresAt: session.expiresAt ?? issued.expiresAt,
      freshUntil: new Date(
        session.authenticatedAt.getTime() + configuration.freshActionTtlMs
      ),
    };
  }

  private toTransports(transports: string[] | null) {
    return transports?.length
      ? (transports as AuthenticatorTransportFuture[])
      : undefined;
  }

  private registrationRejected() {
    return new HttpException('Passkey registration could not be verified', 400);
  }

  private assertionRejected() {
    return new HttpException(
      'Passkey verification could not be completed',
      400
    );
  }
}
