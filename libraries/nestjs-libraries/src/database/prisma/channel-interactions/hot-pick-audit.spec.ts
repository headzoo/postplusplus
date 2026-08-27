import { ChannelAudienceMembership } from '@prisma/client';
import {
  classifyHotPickVisibility,
  isActiveHotTriageIgnore,
  matchesHotTriageSignal,
  summarizeHotPickAudit,
} from './hot-pick-audit';

const baseMember = {
  externalId: 'user-1',
  username: 'userone',
  membershipState: ChannelAudienceMembership.FOLLOWER,
  ignoredAt: null,
  isBot: null,
  relationshipTriage: 'hot_lead' as const,
  relationshipReciprocationScore: 5,
  relationshipEffortScore: 0,
  triageIgnores: [] as Array<{ triage: string; expiresAt: Date | null }>,
};

describe('hot-pick-audit', () => {
  it('treats hot_lead and unreciprocated inbound as hot triage signals', () => {
    expect(
      matchesHotTriageSignal({
        relationshipTriage: 'hot_lead',
        relationshipReciprocationScore: 0,
        relationshipEffortScore: 0,
      })
    ).toBe(true);
    expect(
      matchesHotTriageSignal({
        relationshipTriage: 'quiet',
        relationshipReciprocationScore: 3,
        relationshipEffortScore: 0,
      })
    ).toBe(true);
    expect(
      matchesHotTriageSignal({
        relationshipTriage: 'quiet',
        relationshipReciprocationScore: 0,
        relationshipEffortScore: 0,
      })
    ).toBe(false);
  });

  it('classifies visibility reasons in priority order', () => {
    expect(classifyHotPickVisibility(null)).toBe('missing_member');
    expect(
      classifyHotPickVisibility({
        ...baseMember,
        membershipState: ChannelAudienceMembership.NOT_FOLLOWER,
      })
    ).toBe('not_follower');
    expect(
      classifyHotPickVisibility({
        ...baseMember,
        ignoredAt: new Date('2026-08-27T10:00:00.000Z'),
      })
    ).toBe('ignored');
    expect(
      classifyHotPickVisibility({
        ...baseMember,
        isBot: true,
      })
    ).toBe('bot');
    expect(
      classifyHotPickVisibility({
        ...baseMember,
        triageIgnores: [{ triage: 'hot_lead', expiresAt: null }],
      })
    ).toBe('dismissed');
    expect(
      classifyHotPickVisibility({
        ...baseMember,
        relationshipTriage: 'quiet',
        relationshipReciprocationScore: 0,
        relationshipEffortScore: 0,
      })
    ).toBe('not_hot_triage');
    expect(classifyHotPickVisibility(baseMember)).toBe('visible');
  });

  it('ignores expired hot dismissals', () => {
    expect(
      isActiveHotTriageIgnore({
        triage: 'hot_lead',
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      })
    ).toBe(false);
    expect(
      isActiveHotTriageIgnore(
        { triage: 'hot_lead', expiresAt: new Date('2099-01-01T00:00:00.000Z') },
        new Date('2026-08-27T12:00:00.000Z')
      )
    ).toBe(true);
  });

  it('summarizes stored vs visible picks', () => {
    const audit = summarizeHotPickAudit({
      hour: '2026-08-27T11',
      picks: [
        { externalId: 'a', member: baseMember },
        {
          externalId: 'b',
          member: {
            ...baseMember,
            externalId: 'b',
            username: 'two',
            triageIgnores: [{ triage: 'hot_lead', expiresAt: null }],
          },
        },
        {
          externalId: 'c',
          member: {
            ...baseMember,
            externalId: 'c',
            username: 'three',
            relationshipTriage: 'quiet',
            relationshipReciprocationScore: 0,
          },
        },
      ],
    });

    expect(audit).toEqual({
      hour: '2026-08-27T11',
      storedCount: 3,
      visibleCount: 1,
      excludedCount: 2,
      excludedByReason: {
        dismissed: 1,
        not_hot_triage: 1,
      },
      excluded: [
        {
          externalId: 'b',
          username: 'two',
          reason: 'dismissed',
          relationshipTriage: 'hot_lead',
        },
        {
          externalId: 'c',
          username: 'three',
          reason: 'not_hot_triage',
          relationshipTriage: 'quiet',
        },
      ],
    });
  });
});
