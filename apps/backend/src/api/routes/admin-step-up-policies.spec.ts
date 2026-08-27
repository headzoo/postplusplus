import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ADMIN_STEP_UP_KEY } from '@gitroom/backend/services/auth/admin-step-up.decorator';
import { AnnouncementsController } from './announcements.controller';
import { SettingsController } from './settings.controller';

type Policy = 'general' | 'fresh';

const ROUTES_DIRECTORY = __dirname;

/**
 * Every platform-super-admin capability in the backend and the verification age
 * it requires. Reads use the general window; anything that changes money,
 * membership, impersonation, scheduling, or exports user data must be fresh.
 */
const EXPECTED_POLICIES: Record<string, Record<string, Policy>> = {
  'admin.controller.ts': {
    listUsers: 'general',
    listErrors: 'general',
    listPlatforms: 'general',
    getStats: 'general',
    getRelationshipGradeSchedule: 'general',
    updateRelationshipGradeSchedule: 'fresh',
    triggerRelationshipGradeSchedule: 'fresh',
    getFollowerBotScoreSchedule: 'general',
    updateFollowerBotScoreSchedule: 'fresh',
    triggerFollowerBotScoreSchedule: 'fresh',
    getMissingPostRecoverySchedule: 'general',
    triggerMissingPostRecoverySchedule: 'fresh',
    getPostWorkflowSchedule: 'general',
    triggerPostWorkflowSchedule: 'fresh',
    getAutopostWorkflowSchedule: 'general',
    triggerAutopostWorkflowSchedule: 'fresh',
  },
  'users.controller.ts': {
    getImpersonate: 'general',
    setImpersonate: 'fresh',
    switchUser: 'fresh',
  },
  'billing.controller.ts': {
    getCharges: 'general',
    couponInfo: 'general',
    refundCharges: 'fresh',
    cancelSubscription: 'fresh',
    applyCoupon: 'fresh',
    cancelCoupon: 'fresh',
    addSubscription: 'fresh',
  },
  'announcements.controller.ts': {
    createAnnouncement: 'fresh',
    deleteAnnouncement: 'fresh',
  },
  'settings.controller.ts': { addTeamMember: 'fresh' },
  'posts.controller.ts': { getPostGroupDebugExport: 'fresh' },
};

/**
 * Members that mention platform super-admin without being a super-admin
 * capability of their own, so they intentionally carry no step-up policy.
 */
const NOT_A_PLATFORM_ADMIN_CAPABILITY: Record<string, string[]> = {
  // Reports `admin: !!user.isSuperAdmin` about the caller's own session.
  'users.controller.ts': ['getSelf'],
  // Defence-in-depth helper shared by the class-decorated handlers.
  'admin.controller.ts': ['assertSuperAdmin'],
};

/**
 * Ordinary organization-role capabilities that must not become
 * platform-super-admin-only as a side effect of this policy.
 */
const MUST_STAY_UNGATED: Record<string, string[]> = {
  'billing.controller.ts': [
    'chatbaseRefund',
    'chatbaseRefundPreview',
    'subscribe',
    'embedded',
    'cancel',
    'prorate',
    'modifyPayment',
    'getCurrentBilling',
    'applyDiscount',
  ],
  'settings.controller.ts': [
    'getTeam',
    'inviteTeamMember',
    'deleteTeamMember',
    'updateShortlinkPreference',
  ],
  'announcements.controller.ts': ['getAnnouncements'],
  'users.controller.ts': ['getSelf', 'logout', 'joinOrg', 'changeOrg'],
  'posts.controller.ts': ['getPostsByGroup', 'getPostsList'],
};

type Member = { policy?: Policy; checksSuperAdmin: boolean };

const MEMBER =
  /^ {2}(?:private |public |protected )?(?:async )?([A-Za-z0-9_]+)\s*\(/;
const HANDLER_POLICY = /^ {2}@RequireAdminStepUp\('(general|fresh)'\)/;
const CLASS_POLICY = /^@RequireAdminStepUp\('(general|fresh)'\)/m;
const SUPER_ADMIN_CHECK = /isSuperAdmin|assertSuperAdmin/;

/**
 * Reads the effective step-up policy of every class member straight from the
 * controller source, so a newly added super-admin route is caught here even
 * though it was never listed above.
 */
const readController = (file: string) => {
  const source = readFileSync(join(ROUTES_DIRECTORY, file), 'utf8');
  const classPolicy = CLASS_POLICY.exec(source)?.[1] as Policy | undefined;
  const members = new Map<string, Member>();
  let pending: Policy | undefined;
  let current: Member | undefined;

  for (const line of source.split('\n')) {
    const handlerPolicy = HANDLER_POLICY.exec(line);
    if (handlerPolicy) {
      pending = handlerPolicy[1] as Policy;
      continue;
    }

    const member = MEMBER.exec(line);
    if (member) {
      current = { policy: pending ?? classPolicy, checksSuperAdmin: false };
      members.set(member[1], current);
      pending = undefined;
      continue;
    }

    if (current && SUPER_ADMIN_CHECK.test(line)) {
      current.checksSuperAdmin = true;
    }
  }

  return members;
};

const files = Object.keys(EXPECTED_POLICIES);

describe('admin step-up route policy inventory', () => {
  it.each(files)(
    '%s applies the expected policy to every listed handler',
    (file) => {
      const members = readController(file);

      expect(
        Object.fromEntries(
          Object.keys(EXPECTED_POLICIES[file]).map((handler) => [
            handler,
            members.get(handler)?.policy,
          ])
        )
      ).toEqual(EXPECTED_POLICIES[file]);
    }
  );

  it.each(files)(
    '%s has no super-admin capability without a policy',
    (file) => {
      const exempt = NOT_A_PLATFORM_ADMIN_CAPABILITY[file] || [];
      const declared = Object.keys(EXPECTED_POLICIES[file]);

      const uncovered = [...readController(file)]
        .filter(
          ([name, member]) => member.checksSuperAdmin && !exempt.includes(name)
        )
        .filter(([name, member]) => !member.policy || !declared.includes(name))
        .map(([name]) => name);

      expect(uncovered).toEqual([]);
    }
  );

  it.each(files)(
    '%s still finds the super-admin checks it inventories',
    (file) => {
      const members = readController(file);
      const checked = [...members]
        .filter(([, member]) => member.checksSuperAdmin)
        .map(([name]) => name);

      expect(checked.length).toBeGreaterThan(0);
      expect(checked).toEqual(
        expect.arrayContaining(
          file === 'admin.controller.ts'
            ? ['assertSuperAdmin']
            : Object.keys(EXPECTED_POLICIES[file])
        )
      );
    }
  );

  it.each(Object.keys(MUST_STAY_UNGATED))(
    '%s keeps ordinary organization routes free of platform-admin gating',
    (file) => {
      const members = readController(file);
      const gated = MUST_STAY_UNGATED[file].filter(
        (handler) => members.get(handler)?.policy
      );

      expect(gated).toEqual([]);
      for (const handler of MUST_STAY_UNGATED[file]) {
        expect(members.has(handler)).toBe(true);
      }
    }
  );

  describe('decorator metadata', () => {
    it('attaches the declared policy as Nest handler metadata', () => {
      expect(
        Reflect.getMetadata(
          ADMIN_STEP_UP_KEY,
          AnnouncementsController.prototype.createAnnouncement
        )
      ).toBe('fresh');
      expect(
        Reflect.getMetadata(
          ADMIN_STEP_UP_KEY,
          AnnouncementsController.prototype.deleteAnnouncement
        )
      ).toBe('fresh');
      expect(
        Reflect.getMetadata(
          ADMIN_STEP_UP_KEY,
          SettingsController.prototype.addTeamMember
        )
      ).toBe('fresh');
    });

    it('leaves ordinary organization handlers without metadata', () => {
      expect(
        Reflect.getMetadata(
          ADMIN_STEP_UP_KEY,
          AnnouncementsController.prototype.getAnnouncements
        )
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(
          ADMIN_STEP_UP_KEY,
          SettingsController.prototype.inviteTeamMember
        )
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(ADMIN_STEP_UP_KEY, SettingsController)
      ).toBeUndefined();
    });
  });
});
