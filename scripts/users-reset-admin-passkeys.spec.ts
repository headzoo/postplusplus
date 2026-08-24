import {
  executeAdminPasskeyReset,
  formatResetResult,
  normalizeEmail,
  parseResetAdminPasskeysArgs,
  validateResetTarget,
} from './users-reset-admin-passkeys.lib.ts';

describe('parseResetAdminPasskeysArgs', () => {
  it('returns help for --help', () => {
    expect(parseResetAdminPasskeysArgs(['--help'])).toEqual({ kind: 'help' });
  });

  it('requires userId and confirm-email', () => {
    expect(parseResetAdminPasskeysArgs([])).toEqual({
      kind: 'error',
      message: 'Missing required --confirm-email <email> argument.',
    });

    expect(
      parseResetAdminPasskeysArgs(['user-1', '--confirm-email'])
    ).toEqual({
      kind: 'error',
      message: 'Missing value for --confirm-email.',
    });

    expect(
      parseResetAdminPasskeysArgs(['--confirm-email', 'ops@example.com'])
    ).toEqual({
      kind: 'error',
      message: 'Missing required <userId> argument.',
    });
  });

  it('rejects malformed arguments', () => {
    expect(
      parseResetAdminPasskeysArgs([
        'user-1',
        'user-2',
        '--confirm-email',
        'ops@example.com',
      ])
    ).toEqual({
      kind: 'error',
      message: 'Too many positional arguments. Expected exactly one <userId>.',
    });

    expect(
      parseResetAdminPasskeysArgs([
        'user-1',
        '--confirm-email',
        'ops@example.com',
        '--force',
      ])
    ).toEqual({
      kind: 'error',
      message: 'Unknown argument(s): --force',
    });
  });

  it('parses a valid invocation', () => {
    expect(
      parseResetAdminPasskeysArgs([
        'user-1',
        '--confirm-email',
        'Ops@Example.com',
      ])
    ).toEqual({
      kind: 'run',
      userId: 'user-1',
      confirmEmail: 'Ops@Example.com',
    });
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases email', () => {
    expect(normalizeEmail('  Ops@Example.COM ')).toBe('ops@example.com');
  });
});

describe('validateResetTarget', () => {
  const superAdmin = {
    id: 'user-1',
    email: 'ops@example.com',
    isSuperAdmin: true,
  };

  it('rejects missing users', () => {
    expect(validateResetTarget(null, 'ops@example.com')).toEqual({
      ok: false,
      message: 'User not found.',
    });
  });

  it('allows non-super-admin users', () => {
    expect(
      validateResetTarget(
        { ...superAdmin, isSuperAdmin: false },
        'ops@example.com'
      )
    ).toEqual({ ok: true });
  });

  it('rejects email mismatches', () => {
    expect(validateResetTarget(superAdmin, 'other@example.com')).toEqual({
      ok: false,
      message: 'Email confirmation does not match the target user.',
    });
  });

  it('accepts a matching user target', () => {
    expect(validateResetTarget(superAdmin, 'OPS@example.com')).toEqual({
      ok: true,
    });
  });
});

describe('executeAdminPasskeyReset', () => {
  const superAdmin = {
    id: 'user-1',
    email: 'ops@example.com',
    isSuperAdmin: true,
  };

  const buildPrisma = (tx: Record<string, unknown>) => ({
    $transaction: jest.fn(async (callback: (innerTx: typeof tx) => unknown) =>
      callback(tx)
    ),
  });

  it('looks up and validates the target inside the transaction', async () => {
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue(superAdmin),
      },
      adminPasskeyCredential: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      adminWebAuthnChallenge: {
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      adminVerificationSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 4 }),
      },
    };

    const prisma = buildPrisma(tx);

    await expect(
      executeAdminPasskeyReset(
        prisma as never,
        'user-1',
        'OPS@example.com'
      )
    ).resolves.toEqual({
      userId: 'user-1',
      email: 'ops@example.com',
      deletedCredentials: 2,
      deletedChallenges: 3,
      revokedSessions: 4,
    });

    expect(tx.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: {
        id: true,
        email: true,
        isSuperAdmin: true,
      },
    });
    expect(tx.adminPasskeyCredential.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(tx.adminWebAuthnChallenge.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(tx.adminVerificationSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('rejects missing users inside the transaction', async () => {
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      adminPasskeyCredential: {
        deleteMany: jest.fn(),
      },
      adminWebAuthnChallenge: {
        deleteMany: jest.fn(),
      },
      adminVerificationSession: {
        updateMany: jest.fn(),
      },
    };

    const prisma = buildPrisma(tx);

    await expect(
      executeAdminPasskeyReset(prisma as never, 'user-1', 'ops@example.com')
    ).rejects.toThrow('User not found.');

    expect(tx.adminPasskeyCredential.deleteMany).not.toHaveBeenCalled();
  });

  it('resets passkeys for non-super-admin users inside the transaction', async () => {
    const tx = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...superAdmin, isSuperAdmin: false }),
      },
      adminPasskeyCredential: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      adminWebAuthnChallenge: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      adminVerificationSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const prisma = buildPrisma(tx);

    await expect(
      executeAdminPasskeyReset(prisma as never, 'user-1', 'ops@example.com')
    ).resolves.toMatchObject({
      userId: 'user-1',
      deletedCredentials: 1,
      deletedChallenges: 1,
      revokedSessions: 1,
    });

    expect(tx.adminPasskeyCredential.deleteMany).toHaveBeenCalled();
  });

  it('rejects email mismatches inside the transaction', async () => {
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue(superAdmin),
      },
      adminPasskeyCredential: {
        deleteMany: jest.fn(),
      },
      adminWebAuthnChallenge: {
        deleteMany: jest.fn(),
      },
      adminVerificationSession: {
        updateMany: jest.fn(),
      },
    };

    const prisma = buildPrisma(tx);

    await expect(
      executeAdminPasskeyReset(prisma as never, 'user-1', 'other@example.com')
    ).rejects.toThrow('Email confirmation does not match the target user.');

    expect(tx.adminPasskeyCredential.deleteMany).not.toHaveBeenCalled();
  });
});

describe('formatResetResult', () => {
  it('prints an audit record without secrets', () => {
    const output = formatResetResult({
      userId: 'user-1',
      email: 'ops@example.com',
      deletedCredentials: 1,
      deletedChallenges: 2,
      revokedSessions: 3,
      timestamp: new Date('2026-08-19T18:30:00.000Z'),
    });

    expect(output).toContain('2026-08-19T18:30:00.000Z');
    expect(output).toContain('userId=user-1');
    expect(output).toContain('email=ops@example.com');
    expect(output).toContain('isSuperAdmin=true (unchanged)');
    expect(output).toContain('deletedCredentials=1');
    expect(output).toContain('deletedChallenges=2');
    expect(output).toContain('revokedSessions=3');
    expect(output).not.toMatch(/\btoken\b|\bpublicKey\b|\bcredentialId\b/i);
  });
});
