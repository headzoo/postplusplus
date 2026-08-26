jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class IntegrationService { } })
);

import { FollowersController } from './followers.controller';
import { FollowersQueryDto } from '@gitroom/nestjs-libraries/dtos/integrations/followers.query.dto';
import { FollowerMemberQueryDto } from '@gitroom/nestjs-libraries/dtos/integrations/follower-member.query.dto';
import { IgnoreFollowerTriageDto } from '@gitroom/nestjs-libraries/dtos/integrations/follower-triage-ignore.dto';
import { IgnoreFollowerDto } from '@gitroom/nestjs-libraries/dtos/integrations/follower-ignore.dto';
import { RefreshFollowerRelationshipScoreDto } from '@gitroom/nestjs-libraries/dtos/integrations/follower-relationship-score.dto';
import { validate } from 'class-validator';

describe('FollowersController', () => {
  const org = { id: 'org-a' } as any;
  const user = { id: 'user-a' } as any;
  const service = {
    getFollowerChannels: jest.fn(),
    getFollowers: jest.fn(),
    getFollowerAudienceSummary: jest.fn(),
    getFollowerMemberDetails: jest.fn(),
    getFollowerMemberTimeline: jest.fn(),
    createFollowerMemberNote: jest.fn(),
    updateFollowerMemberNote: jest.fn(),
    deleteFollowerMemberNote: jest.fn(),
    updateFollowerMemberGrade: jest.fn(),
    refreshFollowerMemberRelationshipScore: jest.fn(),
    ignoreFollowerMemberTriage: jest.fn(),
    followFollowerMember: jest.fn(),
    unfollowFollowerMember: jest.fn(),
    ignoreFollowerMember: jest.fn(),
    unignoreFollowerMember: jest.fn(),
    createFollowerList: jest.fn(),
    listFollowerLists: jest.fn(),
    importFollowerListMemberFromUrl: jest.fn(),
  };
  const controller = new FollowersController(service as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates eligible channel discovery using the request organization', async () => {
    service.getFollowerChannels.mockResolvedValue([{ id: 'channel-a' }]);

    await expect(controller.getChannels(org)).resolves.toEqual([
      { id: 'channel-a' },
    ]);
    expect(service.getFollowerChannels).toHaveBeenCalledWith(org);
  });

  it('delegates audience summary for an owned channel', async () => {
    const summary = {
      total: 1256,
      totalAsOf: '2026-08-25T12:00:00.000Z',
      totalSource: 'snapshot' as const,
      categories: { lead: 12, hot: 5 },
      lists: [],
      listsTruncated: false,
      tracking: null,
    };
    service.getFollowerAudienceSummary.mockResolvedValue(summary);

    await expect(
      controller.getFollowerAudienceSummary(org, user, 'channel-a')
    ).resolves.toEqual(summary);
    expect(service.getFollowerAudienceSummary).toHaveBeenCalledWith(
      org,
      user,
      'channel-a'
    );
  });

  it('forwards a validated follower page query and scoped organization', async () => {
    const query = {
      limit: 24,
      cursor: 'opaque-cursor',
      sort: 'recent',
      direction: 'desc' as const,
      triage: 'hot_lead' as const,
    };
    service.getFollowers.mockResolvedValue({ items: [], hasMore: false });

    await expect(
      controller.getFollowers(org, user, 'channel-a', query)
    ).resolves.toEqual({ items: [], hasMore: false });
    expect(service.getFollowers).toHaveBeenCalledWith(org, user, 'channel-a', query);
  });

  it('rejects combining listId with triage or audience', async () => {
    const withTriage = Object.assign(new FollowersQueryDto(), {
      listId: 'list-1',
      triage: 'hot_lead',
    });
    const withAudience = Object.assign(new FollowersQueryDto(), {
      listId: 'list-1',
      audience: 'lead',
    });
    const valid = Object.assign(new FollowersQueryDto(), { listId: 'list-1' });

    await expect(validate(valid)).resolves.toHaveLength(0);
    await expect(validate(withTriage)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'listId' }),
      ])
    );
    await expect(validate(withAudience)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'listId' }),
      ])
    );
  });

  it('delegates list creation with organization, user, and name', async () => {
    const list = { id: 'list-1', name: 'VIP' };
    service.createFollowerList = jest.fn().mockResolvedValue(list);
    const controllerWithLists = new FollowersController(service as any);

    await expect(
      controllerWithLists.createFollowerList(org, user, 'channel-a', { name: 'VIP' })
    ).resolves.toEqual(list);
    expect(service.createFollowerList).toHaveBeenCalledWith(
      org,
      user,
      'channel-a',
      'VIP'
    );
  });

  it('accepts only the follower triage filter allowlist', async () => {
    const valid = Object.assign(new FollowersQueryDto(), { triage: 'engaged_not_yet' });
    const invalid = Object.assign(new FollowersQueryDto(), { triage: 'arbitrary' });

    await expect(validate(valid)).resolves.toHaveLength(0);
    await expect(validate(invalid)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'triage' }),
      ])
    );
  });

  it('accepts the hot audience and rejects it combined with triage', async () => {
    const valid = Object.assign(new FollowersQueryDto(), { audience: 'hot' });
    const combined = Object.assign(new FollowersQueryDto(), {
      audience: 'hot',
      triage: 'hot_lead',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    await expect(validate(combined)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'audience' }),
      ])
    );
  });

  it('accepts the lead audience and rejects it combined with triage', async () => {
    const valid = Object.assign(new FollowersQueryDto(), { audience: 'lead' });
    const invalidAudience = Object.assign(new FollowersQueryDto(), {
      audience: 'followers',
    });
    const combined = Object.assign(new FollowersQueryDto(), {
      audience: 'lead',
      triage: 'hot_lead',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    await expect(validate(invalidAudience)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'audience' }),
      ])
    );
    await expect(validate(combined)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'audience' }),
      ])
    );
  });

  it('accepts the followed audience and rejects it combined with triage', async () => {
    const valid = Object.assign(new FollowersQueryDto(), { audience: 'followed' });
    const combined = Object.assign(new FollowersQueryDto(), {
      audience: 'followed',
      triage: 'hot_lead',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    await expect(validate(combined)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'audience' }),
      ])
    );
  });

  it('delegates follow member through organization and external id', async () => {
    service.followFollowerMember.mockResolvedValue({
      weFollowedAt: '2026-08-20T12:00:00.000Z',
    });

    await expect(
      controller.followFollowerMember(org, 'channel-a', {
        externalId: 'follower-a',
      })
    ).resolves.toEqual({ weFollowedAt: '2026-08-20T12:00:00.000Z' });
    expect(service.followFollowerMember).toHaveBeenCalledWith(
      org,
      'channel-a',
      'follower-a'
    );
  });

  it('delegates unfollow member through organization and external id', async () => {
    service.unfollowFollowerMember.mockResolvedValue({
      unfollowedAt: '2026-08-20T12:00:00.000Z',
    });

    await expect(
      controller.unfollowFollowerMember(org, 'channel-a', {
        externalId: 'follower-a',
      })
    ).resolves.toEqual({ unfollowedAt: '2026-08-20T12:00:00.000Z' });
    expect(service.unfollowFollowerMember).toHaveBeenCalledWith(
      org,
      'channel-a',
      'follower-a'
    );
  });

  it('delegates follower member detail reads with organization and external id', async () => {
    const detail = { follower: { id: 'follower-a', name: 'Follower A' } };
    service.getFollowerMemberDetails.mockResolvedValue(detail);

    await expect(
      controller.getFollowerMember(org, user, 'channel-a', { externalId: 'follower-a' })
    ).resolves.toEqual(detail);
    expect(service.getFollowerMemberDetails).toHaveBeenCalledWith(
      org,
      user,
      'channel-a',
      'follower-a',
      undefined
    );
  });

  it('delegates follower member detail reads with a username', async () => {
    const detail = { follower: { id: 'follower-a', name: 'Follower A' } };
    service.getFollowerMemberDetails.mockResolvedValue(detail);

    await expect(
      controller.getFollowerMember(org, user, 'channel-a', {
        username: 'SummerYule',
      })
    ).resolves.toEqual(detail);
    expect(service.getFollowerMemberDetails).toHaveBeenCalledWith(
      org,
      user,
      'channel-a',
      undefined,
      'SummerYule'
    );
  });

  it('delegates follower member timeline reads with username and pagination', async () => {
    const timeline = { items: [], hasMore: false };
    service.getFollowerMemberTimeline.mockResolvedValue(timeline);

    await expect(
      controller.getFollowerMemberTimeline(org, 'channel-a', {
        username: 'SummerYule',
        limit: 20,
        cursor: 'next',
      })
    ).resolves.toEqual(timeline);
    expect(service.getFollowerMemberTimeline).toHaveBeenCalledWith(
      org,
      'channel-a',
      undefined,
      'SummerYule',
      20,
      'next'
    );
  });

  it('accepts either externalId or username for member detail queries', async () => {
    const byId = Object.assign(new FollowerMemberQueryDto(), {
      externalId: 'follower-a',
    });
    const byUsername = Object.assign(new FollowerMemberQueryDto(), {
      username: '@SummerYule',
    });
    const both = Object.assign(new FollowerMemberQueryDto(), {
      externalId: 'follower-a',
      username: 'SummerYule',
    });
    const neither = Object.assign(new FollowerMemberQueryDto(), {});

    await expect(validate(byId)).resolves.toHaveLength(0);
    await expect(validate(byUsername)).resolves.toHaveLength(0);
    await expect(validate(both)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'identity' }),
      ])
    );
    await expect(validate(neither)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'identity' }),
      ])
    );
  });

  it('delegates follower note creation with organization, user, and body', async () => {
    const note = { id: 'note-a', content: 'Hello' };
    service.createFollowerMemberNote.mockResolvedValue(note);

    await expect(
      controller.createFollowerMemberNote(org, user, 'channel-a', {
        externalId: 'follower-a',
        content: 'Hello',
      })
    ).resolves.toEqual(note);
    expect(service.createFollowerMemberNote).toHaveBeenCalledWith(
      org,
      user,
      'channel-a',
      'follower-a',
      'Hello'
    );
  });

  it('delegates follower note updates with organization, note id, and content', async () => {
    service.updateFollowerMemberNote.mockResolvedValue(undefined);

    await expect(
      controller.updateFollowerMemberNote(org, 'channel-a', 'note-a', {
        content: 'Updated',
      })
    ).resolves.toBeUndefined();
    expect(service.updateFollowerMemberNote).toHaveBeenCalledWith(
      org,
      'channel-a',
      'note-a',
      'Updated'
    );
  });

  it('delegates follower note deletion with organization and note id', async () => {
    service.deleteFollowerMemberNote.mockResolvedValue(undefined);

    await expect(
      controller.deleteFollowerMemberNote(org, 'channel-a', 'note-a')
    ).resolves.toBeUndefined();
    expect(service.deleteFollowerMemberNote).toHaveBeenCalledWith(
      org,
      'channel-a',
      'note-a'
    );
  });

  it('delegates personal grade updates with organization, user, and body', async () => {
    service.updateFollowerMemberGrade.mockResolvedValue({
      myGrade: 4.5,
      adjustedGrade: 5,
    });

    await expect(
      controller.updateFollowerMemberGrade(org, user, 'channel-a', {
        externalId: 'follower-a',
        grade: 4.5,
      })
    ).resolves.toEqual({ myGrade: 4.5, adjustedGrade: 5 });
    expect(service.updateFollowerMemberGrade).toHaveBeenCalledWith(
      org,
      user,
      'channel-a',
      'follower-a',
      4.5
    );
  });

  it('delegates directional relationship score refresh with organization and body', async () => {
    const current = { effortScore: 10, reciprocationScore: 30, grade: 5 };
    service.refreshFollowerMemberRelationshipScore.mockResolvedValue(current);

    await expect(
      controller.refreshFollowerMemberRelationshipScore(org, 'channel-a', {
        externalId: 'follower-a',
        direction: 'their',
      })
    ).resolves.toEqual(current);
    expect(service.refreshFollowerMemberRelationshipScore).toHaveBeenCalledWith(
      org,
      'channel-a',
      'follower-a',
      'their'
    );
  });

  it('delegates triage ignore creation with organization, user, and body', async () => {
    service.ignoreFollowerMemberTriage.mockResolvedValue(undefined);

    await expect(
      controller.ignoreFollowerMemberTriage(org, user, 'channel-a', {
        externalId: 'follower-a',
        triage: 'hot_lead',
      })
    ).resolves.toBeUndefined();
    expect(service.ignoreFollowerMemberTriage).toHaveBeenCalledWith(
      org,
      user,
      'channel-a',
      'follower-a',
      'hot_lead',
      undefined,
      undefined
    );
  });

  it('forwards snooze when ignoring a triage badge temporarily', async () => {
    service.ignoreFollowerMemberTriage.mockResolvedValue(undefined);

    await expect(
      controller.ignoreFollowerMemberTriage(org, user, 'channel-a', {
        externalId: 'follower-a',
        triage: 'hot_lead',
        snooze: true,
      })
    ).resolves.toBeUndefined();
    expect(service.ignoreFollowerMemberTriage).toHaveBeenCalledWith(
      org,
      user,
      'channel-a',
      'follower-a',
      'hot_lead',
      undefined,
      true
    );
  });

  it('forwards lead dismiss reasons when ignoring a lead triage badge', async () => {
    service.ignoreFollowerMemberTriage.mockResolvedValue(undefined);

    await expect(
      controller.ignoreFollowerMemberTriage(org, user, 'channel-a', {
        externalId: 'follower-a',
        triage: 'lead',
        reasons: ['bio_wording'],
      })
    ).resolves.toBeUndefined();
    expect(service.ignoreFollowerMemberTriage).toHaveBeenCalledWith(
      org,
      user,
      'channel-a',
      'follower-a',
      'lead',
      ['bio_wording'],
      undefined
    );
  });

  it('requires reasons for lead triage ignores and allows other triages without them', async () => {
    const leadWithoutReasons = Object.assign(new IgnoreFollowerTriageDto(), {
      externalId: 'follower-a',
      triage: 'lead',
    });
    const leadWithReasons = Object.assign(new IgnoreFollowerTriageDto(), {
      externalId: 'follower-a',
      triage: 'lead',
      reasons: ['wrong_topic'],
    });
    const leadSnooze = Object.assign(new IgnoreFollowerTriageDto(), {
      externalId: 'follower-a',
      triage: 'lead',
      snooze: true,
    });
    const hotLead = Object.assign(new IgnoreFollowerTriageDto(), {
      externalId: 'follower-a',
      triage: 'hot_lead',
    });

    await expect(validate(leadWithoutReasons)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'reasons' }),
      ])
    );
    await expect(validate(leadWithReasons)).resolves.toHaveLength(0);
    await expect(validate(leadSnooze)).resolves.toHaveLength(0);
    await expect(validate(hotLead)).resolves.toHaveLength(0);
  });

  it('delegates follower ignore and unignore with organization and body', async () => {
    service.ignoreFollowerMember.mockResolvedValue(undefined);
    service.unignoreFollowerMember.mockResolvedValue(undefined);

    await expect(
      controller.ignoreFollowerMember(org, user, 'channel-a', {
        externalId: 'follower-a',
      })
    ).resolves.toBeUndefined();
    expect(service.ignoreFollowerMember).toHaveBeenCalledWith(
      org,
      user,
      'channel-a',
      'follower-a'
    );

    await expect(
      controller.unignoreFollowerMember(org, 'channel-a', {
        externalId: 'follower-a',
      })
    ).resolves.toBeUndefined();
    expect(service.unignoreFollowerMember).toHaveBeenCalledWith(
      org,
      'channel-a',
      'follower-a'
    );
  });

  it('accepts audience=ignored on follower queries', async () => {
    const valid = Object.assign(new FollowersQueryDto(), {
      audience: 'ignored',
      limit: 24,
    });
    const invalidCombo = Object.assign(new FollowersQueryDto(), {
      audience: 'ignored',
      triage: 'hot_lead',
      limit: 24,
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    await expect(validate(invalidCombo)).resolves.not.toHaveLength(0);
  });

  it('accepts only the follower triage ignore allowlist', async () => {
    const valid = Object.assign(new IgnoreFollowerTriageDto(), {
      externalId: 'follower-a',
      triage: 'hot_lead',
    });
    const validLead = Object.assign(new IgnoreFollowerTriageDto(), {
      externalId: 'follower-a',
      triage: 'lead',
      reasons: ['wrong_topic'],
    });
    const validEngaged = Object.assign(new IgnoreFollowerTriageDto(), {
      externalId: 'follower-a',
      triage: 'engaged_not_yet',
    });
    const validCultivate = Object.assign(new IgnoreFollowerTriageDto(), {
      externalId: 'follower-a',
      triage: 'cultivate',
    });
    const invalid = Object.assign(new IgnoreFollowerTriageDto(), {
      externalId: 'follower-a',
      triage: 'invalid',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    await expect(validate(validLead)).resolves.toHaveLength(0);
    await expect(validate(validEngaged)).resolves.toHaveLength(0);
    await expect(validate(validCultivate)).resolves.toHaveLength(0);
    await expect(validate(invalid)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'triage' }),
      ])
    );
  });

  it('accepts only their and your relationship score directions', async () => {
    const valid = Object.assign(new RefreshFollowerRelationshipScoreDto(), {
      externalId: 'follower-a',
      direction: 'your',
    });
    const invalid = Object.assign(new RefreshFollowerRelationshipScoreDto(), {
      externalId: 'follower-a',
      direction: 'both',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    await expect(validate(invalid)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'direction' }),
      ])
    );
  });

  it('delegates importing a list member from a profile URL', async () => {
    const imported = {
      externalId: '42',
      name: 'Harbor',
      username: 'HarborClient',
      profileUrl: 'https://x.com/HarborClient',
      picture: null as string | null,
    };
    service.importFollowerListMemberFromUrl.mockResolvedValue(imported);
    const controllerWithImport = new FollowersController(service as any);

    await expect(
      controllerWithImport.importFollowerListMember(
        org,
        user,
        'channel-a',
        'list-1',
        { url: 'https://x.com/HarborClient' }
      )
    ).resolves.toEqual(imported);
    expect(service.importFollowerListMemberFromUrl).toHaveBeenCalledWith(
      org,
      user,
      'channel-a',
      'list-1',
      'https://x.com/HarborClient'
    );
  });

  it('validates import URL length and rejects empty values', async () => {
    const { ImportFollowerListMemberDto } = await import(
      '@gitroom/nestjs-libraries/dtos/integrations/follower-list.dto'
    );
    const valid = Object.assign(new ImportFollowerListMemberDto(), {
      url: 'https://x.com/HarborClient',
    });
    const empty = Object.assign(new ImportFollowerListMemberDto(), { url: '' });
    const tooLong = Object.assign(new ImportFollowerListMemberDto(), {
      url: `https://x.com/${'a'.repeat(2100)}`,
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    await expect(validate(empty)).resolves.not.toHaveLength(0);
    await expect(validate(tooLong)).resolves.not.toHaveLength(0);
  });
});
