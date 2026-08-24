export const HELP_TEXT = `Usage:
  pnpm run commands:users:reset-admin-passkeys <userId> --confirm-email <email>

Operations-only recovery: deletes all passkey credentials and WebAuthn
challenges for the target user, and revokes every active verification session.
Login MFA is off until the user enrolls again. Super-admins must enroll before
the next /admin access.

Recovery risk: after reset, anyone who controls that user's normal login can
enroll a replacement passkey. Restrict shell/database access and retain ops
logs from this command's output.

Options:
  --confirm-email <email>  Required. Must exactly match the target user's email
                           (case-insensitive comparison).
  --help, -h               Show this help text.`;

export type ParsedResetArgs =
  | { kind: 'help' }
  | { kind: 'error'; message: string }
  | { kind: 'run'; userId: string; confirmEmail: string };

export type ResetTargetUser = {
  id: string;
  email: string;
  isSuperAdmin: boolean;
};

export type ResetValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export type ResetCounts = {
  deletedCredentials: number;
  deletedChallenges: number;
  revokedSessions: number;
};

export type ResetExecutionResult = ResetCounts & {
  userId: string;
  email: string;
};

type ResetPrismaClient = {
  $transaction<T>(
    callback: (tx: {
      user: {
        findUnique: (args: {
          where: { id: string };
          select: { id: true; email: true; isSuperAdmin: true };
        }) => Promise<ResetTargetUser | null>;
      };
      adminPasskeyCredential: {
        deleteMany: (args: {
          where: { userId: string };
        }) => Promise<{ count: number }>;
      };
      adminWebAuthnChallenge: {
        deleteMany: (args: {
          where: { userId: string };
        }) => Promise<{ count: number }>;
      };
      adminVerificationSession: {
        updateMany: (args: {
          where: { userId: string; revokedAt: null };
          data: { revokedAt: Date };
        }) => Promise<{ count: number }>;
      };
    }) => Promise<T>
  ): Promise<T>;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function parseResetAdminPasskeysArgs(argv: string[]): ParsedResetArgs {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { kind: 'help' };
  }

  const confirmEmailFlagIndex = argv.indexOf('--confirm-email');
  if (confirmEmailFlagIndex === -1) {
    return {
      kind: 'error',
      message: 'Missing required --confirm-email <email> argument.',
    };
  }

  const confirmEmail = argv[confirmEmailFlagIndex + 1];
  if (!confirmEmail || confirmEmail.startsWith('-')) {
    return {
      kind: 'error',
      message: 'Missing value for --confirm-email.',
    };
  }

  const positional = argv.filter(
    (arg, index) =>
      !arg.startsWith('-') &&
      index !== confirmEmailFlagIndex + 1 &&
      arg !== '--confirm-email'
  );

  if (positional.length === 0) {
    return {
      kind: 'error',
      message: 'Missing required <userId> argument.',
    };
  }

  if (positional.length > 1) {
    return {
      kind: 'error',
      message: 'Too many positional arguments. Expected exactly one <userId>.',
    };
  }

  const unknownFlags = argv.filter(
    (arg, index) =>
      arg.startsWith('-') &&
      arg !== '--confirm-email' &&
      !(index > 0 && argv[index - 1] === '--confirm-email')
  );

  if (unknownFlags.length > 0) {
    return {
      kind: 'error',
      message: `Unknown argument(s): ${unknownFlags.join(', ')}`,
    };
  }

  return {
    kind: 'run',
    userId: positional[0],
    confirmEmail,
  };
}

export function validateResetTarget(
  user: ResetTargetUser | null,
  confirmEmail: string
): ResetValidationResult {
  if (!user) {
    return { ok: false, message: 'User not found.' };
  }

  if (normalizeEmail(user.email) !== normalizeEmail(confirmEmail)) {
    return {
      ok: false,
      message: 'Email confirmation does not match the target user.',
    };
  }

  return { ok: true };
}

export async function executeAdminPasskeyReset(
  prisma: ResetPrismaClient,
  userId: string,
  confirmEmail: string
): Promise<ResetExecutionResult> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isSuperAdmin: true,
      },
    });

    const validation = validateResetTarget(user, confirmEmail);
    if (!validation.ok) {
      throw new Error(validation.message);
    }

    const targetUser = user!;

    const deletedCredentials = await tx.adminPasskeyCredential.deleteMany({
      where: { userId: targetUser.id },
    });

    const deletedChallenges = await tx.adminWebAuthnChallenge.deleteMany({
      where: { userId: targetUser.id },
    });

    const revokedSessions = await tx.adminVerificationSession.updateMany({
      where: { userId: targetUser.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return {
      userId: targetUser.id,
      email: targetUser.email,
      deletedCredentials: deletedCredentials.count,
      deletedChallenges: deletedChallenges.count,
      revokedSessions: revokedSessions.count,
    };
  });
}

export function formatResetResult(input: {
  userId: string;
  email: string;
  deletedCredentials: number;
  deletedChallenges: number;
  revokedSessions: number;
  timestamp?: Date;
}) {
  const timestamp = (input.timestamp ?? new Date()).toISOString();

  return [
    `[${timestamp}] Admin passkey recovery reset completed`,
    `userId=${input.userId}`,
    `email=${input.email}`,
    'isSuperAdmin=true (unchanged)',
    `deletedCredentials=${input.deletedCredentials}`,
    `deletedChallenges=${input.deletedChallenges}`,
    `revokedSessions=${input.revokedSessions}`,
    'serverSideSessionsInvalidated=true',
  ].join('\n');
}
