import { Injectable } from '@nestjs/common';
import { AdminWebAuthnChallengeKind, Prisma } from '@prisma/client';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

const TRANSACTION_ATTEMPTS = 3;

export type AdminPasskeyCredentialRecord = {
  id: string;
  credentialId: string;
  publicKey: Uint8Array;
  counter: bigint;
  transports: string[] | null;
  deviceType: string;
  backedUp: boolean;
};

export type AdminPasskeyCredentialInput = {
  credentialId: string;
  publicKey: Uint8Array;
  counter: bigint;
  transports: string[] | null;
  deviceType: string;
  backedUp: boolean;
  aaguid: string | null;
};

export type AdminVerificationSessionInput = {
  tokenHash: string;
  authenticatedAt: Date;
  expiresAt: Date;
};

export type AdminVerificationSessionRecord = {
  id: string;
  userId: string;
  credentialId: string | null;
  authenticatedAt: Date;
  expiresAt: Date;
};

export type AdminPasskeyRegistrationResult =
  | { outcome: 'created'; session: AdminVerificationSessionRecord }
  | { outcome: 'challenge-unavailable' }
  | { outcome: 'credential-exists' };

export type AdminPasskeyAssertionResult =
  | { outcome: 'verified'; session: AdminVerificationSessionRecord }
  | { outcome: 'challenge-unavailable' }
  | { outcome: 'credential-unavailable' }
  | { outcome: 'credential-state-changed' };

const sessionSelect = {
  id: true,
  userId: true,
  credentialId: true,
  authenticatedAt: true,
  expiresAt: true,
} as const;

@Injectable()
export class AdminPasskeyRepository {
  constructor(
    private _adminPasskey: PrismaRepository<
      | 'adminPasskeyCredential'
      | 'adminWebAuthnChallenge'
      | 'adminVerificationSession'
    >,
    private _transaction: PrismaTransaction
  ) {}

  countCredentials(userId: string) {
    return this._adminPasskey.model.adminPasskeyCredential.count({
      where: { userId, revokedAt: null },
    });
  }

  async listCredentials(
    userId: string
  ): Promise<AdminPasskeyCredentialRecord[]> {
    const credentials =
      await this._adminPasskey.model.adminPasskeyCredential.findMany({
        where: { userId, revokedAt: null },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          credentialId: true,
          publicKey: true,
          counter: true,
          transports: true,
          deviceType: true,
          backedUp: true,
        },
      });

    return credentials.map((credential) => this.toRecord(credential));
  }

  async findCredential(
    userId: string,
    credentialId: string
  ): Promise<AdminPasskeyCredentialRecord | null> {
    const credential =
      await this._adminPasskey.model.adminPasskeyCredential.findFirst({
        where: { userId, credentialId, revokedAt: null },
        select: {
          id: true,
          credentialId: true,
          publicKey: true,
          counter: true,
          transports: true,
          deviceType: true,
          backedUp: true,
        },
      });

    return credential ? this.toRecord(credential) : null;
  }

  async createChallenge(
    userId: string,
    kind: AdminWebAuthnChallengeKind,
    challenge: string,
    expiresAt: Date
  ) {
    // Lazy cleanup only: correctness comes from the one-time consumption below.
    await this._adminPasskey.model.adminWebAuthnChallenge.deleteMany({
      where: {
        userId,
        kind,
        OR: [{ expiresAt: { lte: new Date() } }, { usedAt: { not: null } }],
      },
    });

    return this._adminPasskey.model.adminWebAuthnChallenge.create({
      data: { userId, kind, challenge, expiresAt },
      select: { id: true, expiresAt: true },
    });
  }

  async hasPendingChallenge(
    userId: string,
    kind: AdminWebAuthnChallengeKind,
    challenge: string,
    now: Date
  ) {
    const pending =
      await this._adminPasskey.model.adminWebAuthnChallenge.findFirst({
        where: {
          userId,
          kind,
          challenge,
          usedAt: null,
          expiresAt: { gt: now },
        },
        select: { id: true },
      });

    return !!pending;
  }

  async completeRegistration(input: {
    userId: string;
    challenge: string;
    now: Date;
    credential: AdminPasskeyCredentialInput;
    session: AdminVerificationSessionInput;
  }): Promise<AdminPasskeyRegistrationResult> {
    try {
      return await this.withSerializableRetry<AdminPasskeyRegistrationResult>(
        async (tx) => {
          const consumed = await this.consumeChallenge(
            tx,
            input.userId,
            AdminWebAuthnChallengeKind.REGISTRATION,
            input.challenge,
            input.now
          );
          if (!consumed) {
            return { outcome: 'challenge-unavailable' };
          }

          const enrolled = await tx.adminPasskeyCredential.count({
            where: { userId: input.userId, revokedAt: null },
          });
          if (enrolled) {
            return { outcome: 'credential-exists' };
          }

          const credential = await tx.adminPasskeyCredential.create({
            data: {
              userId: input.userId,
              credentialId: input.credential.credentialId,
              publicKey: Buffer.from(input.credential.publicKey),
              counter: input.credential.counter,
              transports: input.credential.transports ?? Prisma.DbNull,
              deviceType: input.credential.deviceType,
              backedUp: input.credential.backedUp,
              aaguid: input.credential.aaguid,
            },
            select: { id: true },
          });

          const session = await tx.adminVerificationSession.create({
            data: {
              userId: input.userId,
              credentialId: credential.id,
              tokenHash: input.session.tokenHash,
              authenticatedAt: input.session.authenticatedAt,
              expiresAt: input.session.expiresAt,
            },
            select: sessionSelect,
          });

          return { outcome: 'created', session };
        }
      );
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        return { outcome: 'credential-exists' };
      }
      throw error;
    }
  }

  completeAssertion(input: {
    userId: string;
    challenge: string;
    now: Date;
    credential: {
      id: string;
      expectedCounter: bigint;
      counter: bigint;
      deviceType: string;
      backedUp: boolean;
    };
    session: AdminVerificationSessionInput;
  }): Promise<AdminPasskeyAssertionResult> {
    return this.withSerializableRetry<AdminPasskeyAssertionResult>(
      async (tx) => {
        const consumed = await this.consumeChallenge(
          tx,
          input.userId,
          AdminWebAuthnChallengeKind.AUTHENTICATION,
          input.challenge,
          input.now
        );
        if (!consumed) {
          return { outcome: 'challenge-unavailable' };
        }

        const updated = await tx.adminPasskeyCredential.updateMany({
          where: {
            id: input.credential.id,
            userId: input.userId,
            revokedAt: null,
            counter: input.credential.expectedCounter,
          },
          data: {
            counter: input.credential.counter,
            deviceType: input.credential.deviceType,
            backedUp: input.credential.backedUp,
            lastUsedAt: input.now,
          },
        });
        if (updated.count !== 1) {
          const credential = await tx.adminPasskeyCredential.findFirst({
            where: {
              id: input.credential.id,
              userId: input.userId,
              revokedAt: null,
            },
            select: { id: true },
          });

          return credential
            ? { outcome: 'credential-state-changed' }
            : { outcome: 'credential-unavailable' };
        }

        const session = await tx.adminVerificationSession.create({
          data: {
            userId: input.userId,
            credentialId: input.credential.id,
            tokenHash: input.session.tokenHash,
            authenticatedAt: input.session.authenticatedAt,
            expiresAt: input.session.expiresAt,
          },
          select: sessionSelect,
        });

        return { outcome: 'verified', session };
      }
    );
  }

  findActiveSession(
    tokenHash: string,
    now: Date
  ): Promise<AdminVerificationSessionRecord | null> {
    return this._adminPasskey.model.adminVerificationSession.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
      select: sessionSelect,
    });
  }

  async createSessionOnly(input: {
    userId: string;
    session: AdminVerificationSessionInput;
    credentialId?: string | null;
  }): Promise<AdminVerificationSessionRecord> {
    return this._adminPasskey.model.adminVerificationSession.create({
      data: {
        userId: input.userId,
        credentialId: input.credentialId ?? null,
        tokenHash: input.session.tokenHash,
        authenticatedAt: input.session.authenticatedAt,
        expiresAt: input.session.expiresAt,
      },
      select: sessionSelect,
    });
  }

  async revokeSession(tokenHash: string) {
    const revoked =
      await this._adminPasskey.model.adminVerificationSession.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });

    return revoked.count;
  }

  async revokeSessionsForUser(userId: string) {
    const revoked =
      await this._adminPasskey.model.adminVerificationSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

    return revoked.count;
  }

  async revokeCredentials(userId: string) {
    const revoked =
      await this._adminPasskey.model.adminPasskeyCredential.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

    return revoked.count;
  }

  async deleteChallengesForUser(userId: string) {
    const deleted =
      await this._adminPasskey.model.adminWebAuthnChallenge.deleteMany({
        where: { userId },
      });

    return deleted.count;
  }

  private async consumeChallenge(
    tx: Prisma.TransactionClient,
    userId: string,
    kind: AdminWebAuthnChallengeKind,
    challenge: string,
    now: Date
  ) {
    const consumed = await tx.adminWebAuthnChallenge.updateMany({
      where: { userId, kind, challenge, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });

    return consumed.count === 1;
  }

  private toRecord(credential: {
    id: string;
    credentialId: string;
    publicKey: Uint8Array;
    counter: bigint;
    transports: Prisma.JsonValue;
    deviceType: string;
    backedUp: boolean;
  }): AdminPasskeyCredentialRecord {
    return {
      id: credential.id,
      credentialId: credential.credentialId,
      publicKey: Uint8Array.from(credential.publicKey),
      counter: credential.counter,
      transports: Array.isArray(credential.transports)
        ? credential.transports.filter(
            (transport): transport is string => typeof transport === 'string'
          )
        : null,
      deviceType: credential.deviceType,
      backedUp: credential.backedUp,
    };
  }

  private isUniqueConstraintError(error: unknown) {
    return (error as { code?: string })?.code === 'P2002';
  }

  private async withSerializableRetry<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < TRANSACTION_ATTEMPTS; attempt++) {
      try {
        return await (this._transaction.model as any).$transaction(callback, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: any) {
        lastError = error;
        if (error?.code !== 'P2034' || attempt === TRANSACTION_ATTEMPTS - 1) {
          throw error;
        }
      }
    }
    throw lastError;
  }
}
