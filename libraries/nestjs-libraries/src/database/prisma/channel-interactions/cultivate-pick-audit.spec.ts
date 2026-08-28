import { ChannelAudienceMembership } from '@prisma/client';
import {
  classifyCultivatePickVisibility,
  summarizeCultivatePickAudit,
} from './cultivate-pick-audit';

const baseMember = {
  externalId: 'user-1',
  username: 'userone',
  membershipState: ChannelAudienceMembership.FOLLOWER,
  ignoredAt: null,
  isBot: null,
  relationshipTriage: 'mutual' as const,
  relationshipGrade: 4,
  lastOutboundAt: null,
  triageIgnores: [] as Array<{ triage: string; expiresAt: Date | null }>,
};

describe('cultivate-pick-audit', () => {
  it('classifies cultivate visibility reasons', () => {
    expect(classifyCultivatePickVisibility(null)).toBe('missing_member');
    expect(
      classifyCultivatePickVisibility({
        ...baseMember,
        relationshipTriage: 'hot_lead',
      })
    ).toBe('hot_lead');
    expect(
      classifyCultivatePickVisibility({
        ...baseMember,
        triageIgnores: [{ triage: 'cultivate', expiresAt: null }],
      })
    ).toBe('dismissed');
    expect(
      classifyCultivatePickVisibility({
        ...baseMember,
        relationshipTriage: 'quiet',
        relationshipGrade: 2,
      })
    ).toBe('visible');
    expect(
      classifyCultivatePickVisibility(
        {
          ...baseMember,
          relationshipTriage: 'over_invested',
          relationshipGrade: 4,
          lastOutboundAt: new Date('2026-08-27T10:00:00.000Z'),
        },
        new Date('2026-08-27T11:00:00.000Z'),
        { warmGradeThreshold: 3.5, staleDays: 14 }
      )
    ).toBe('recently_contacted');
    expect(
      classifyCultivatePickVisibility({
        ...baseMember,
        relationshipTriage: 'over_invested',
        relationshipGrade: 2,
      })
    ).toBe('not_warm');
    expect(classifyCultivatePickVisibility(baseMember)).toBe('visible');
  });

  it('summarizes stored vs visible cultivate picks', () => {
    const audit = summarizeCultivatePickAudit({
      hour: '2026-08-27T11',
      picks: [
        { externalId: 'a', member: baseMember },
        {
          externalId: 'b',
          member: {
            ...baseMember,
            externalId: 'b',
            username: 'two',
            triageIgnores: [{ triage: 'cultivate', expiresAt: null }],
          },
        },
      ],
    });

    expect(audit).toEqual({
      hour: '2026-08-27T11',
      storedCount: 2,
      visibleCount: 1,
      excludedCount: 1,
      excludedByReason: { dismissed: 1 },
      excluded: [
        {
          externalId: 'b',
          username: 'two',
          reason: 'dismissed',
          relationshipTriage: 'mutual',
          relationshipGrade: 4,
        },
      ],
    });
  });
});
