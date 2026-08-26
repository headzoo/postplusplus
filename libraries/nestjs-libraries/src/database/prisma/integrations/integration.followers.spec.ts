import { HttpException } from '@nestjs/common';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { IntegrationService } from './integration.service';

jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/integration.manager',
  () => ({ IntegrationManager: class IntegrationManager { } })
);

describe('IntegrationService followers', () => {
  const org = { id: 'org-a' } as any;
  const user = { id: 'user-a' } as any;
  const integration = {
    id: 'channel-a',
    name: 'Channel A',
    picture: 'https://example.com/channel.png',
    profile: '@channel',
    providerIdentifier: 'supported',
    disabled: false,
    type: 'social',
    token: 'token',
    tokenExpiration: new Date(Date.now() + 60_000),
  };

  const createService = (integrations: any[], providers: Record<string, any>) => {
    const service = Object.create(IntegrationService.prototype) as IntegrationService;
    (service as any)._integrationRepository = {
      getIntegrationsList: jest.fn().mockResolvedValue(integrations),
      getIntegrationById: jest.fn((orgId: string, integrationId: string) =>
        orgId === org.id
          ? integrations.find((item) => item.id === integrationId)
          : undefined
      ),
    };
    (service as any)._integrationManager = {
      getSocialIntegration: jest.fn((identifier: string) => providers[identifier]),
    };
    (service as any)._refreshIntegrationService = {
      refresh: jest.fn(),
    };
    (service as any)._channelInteractionRepository = {
      getInteractionTracking: jest.fn(),
      getRankedFollowers: jest.fn(),
      getFollowersByNoteCount: jest.fn(),
      getFollowersByLikesCount: jest.fn(),
      getFollowersByRelationshipGrade: jest.fn(),
      getFollowersByMyGrade: jest.fn(),
      getFollowersByProjectedField: jest.fn(),
      getAudienceFollowers: jest.fn(),
      getRecentFollowers: jest.fn(),
      getAudienceLeads: jest.fn(),
      getAudienceFollowed: jest.fn(),
      getAudienceCultivate: jest.fn(),
      getAudienceHot: jest.fn(),
      getIgnoredAudienceFollowers: jest.fn(),
      getFollowerInteractionMetrics: jest.fn().mockResolvedValue(new Map()),
      getFollowerNoteCounts: jest.fn().mockResolvedValue(new Map()),
      findMemberExternalIdByUsername: jest.fn(),
      hasStaleRelationshipProjections: jest.fn().mockResolvedValue(false),
    };
    (service as any)._channelInteractionService = {
      getFollowerDetails: jest.fn(),
      createFollowerNote: jest.fn(),
      updateFollowerNote: jest.fn(),
      deleteFollowerNote: jest.fn(),
      upsertFollowerGrade: jest.fn(),
      refreshFollowerRelationshipScore: jest.fn(),
      getStoredFollowerAudienceCounts: jest.fn(),
      markAudienceMemberFollowed: jest.fn(),
      markAudienceMemberUnfollowed: jest.fn(),
    };
    (service as any)._channelAnalyticsService = {
      getLatestAccountAudienceTotal: jest.fn().mockResolvedValue(null),
    };
    (service as any)._relationshipGradeScheduleService = {
      trigger: jest.fn(),
    };
    return service;
  };

  const ignoredNoteCounts = (externalIds: string[]) =>
    new Map(
      externalIds.map((id) => [
        id,
        {
          noteCount: 0,
          likesCount: 0,
          relationshipGrade: null,
          myGrade: null,
          relationshipEffortScore: null,
          relationshipReciprocationScore: null,
          relationshipNetGap: null,
          relationshipTriage: null,
          relationshipFormulaVersion: null,
          relationshipSnapshotAt: null,
          listIds: [],
          ignoredTriages: [],
          ignoredAt: new Date('2026-08-18T12:00:00.000Z'),
        },
      ])
    );

  const followerItems = (start: number, count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `follower-${start + index}`,
      name: `Follower ${start + index}`,
    }));

  beforeEach(() => {
    jest.clearAllMocks();
    (ioRedis.get as jest.Mock).mockResolvedValue(null);
    (ioRedis.set as jest.Mock).mockResolvedValue('OK');
  });

  it('returns bounded stored audience counts only for an owned follower channel', async () => {
    const service = createService([integration], {
      supported: { followers: jest.fn() },
    });
    (service as any)._channelInteractionService
      .getStoredFollowerAudienceCounts
      .mockResolvedValue({
        categories: { quiet: 3 },
        lists: [{ id: 'list-1', name: 'VIP', total: 2 }],
        listsTruncated: false,
      });

    await expect(
      service.getStoredFollowerAudienceCounts(org, integration.id)
    ).resolves.toEqual({
      categories: { quiet: 3 },
      lists: [{ id: 'list-1', name: 'VIP', total: 2 }],
      listsTruncated: false,
    });
    expect(
      (service as any)._channelInteractionService.getStoredFollowerAudienceCounts
    ).toHaveBeenCalledWith(org.id, integration.id);
    await expect(
      service.getStoredFollowerAudienceCounts({ id: 'other-org' } as any, integration.id)
    ).rejects.toMatchObject({ status: 404 });
  });

  it('summarizes platform total from snapshot over list total and returns category counts', async () => {
    const followers = jest.fn().mockResolvedValue({
      items: [{ id: 'follower-1', name: 'Follower 1' }],
      hasMore: true,
      total: 900,
      tracking: { status: 'ready' },
    });
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [
          {
            key: 'recent',
            label: 'Recent',
            directions: ['desc'],
            defaultDirection: 'desc',
          },
        ],
      },
    });
    (service as any)._channelInteractionService
      .getStoredFollowerAudienceCounts
      .mockResolvedValue({
        categories: { lead: 12, hot: 5, quiet: 3 },
        lists: [{ id: 'list-1', name: 'VIP', total: 2 }],
        listsTruncated: false,
      });
    (service as any)._channelAnalyticsService.getLatestAccountAudienceTotal
      .mockResolvedValue({
        value: 1256,
        asOf: '2026-08-25T12:00:00.000Z',
      });

    await expect(
      service.getFollowerAudienceSummary(org, user, integration.id)
    ).resolves.toEqual(
      expect.objectContaining({
        total: 1256,
        totalAsOf: '2026-08-25T12:00:00.000Z',
        totalSource: 'snapshot',
        categories: { lead: 12, hot: 5, quiet: 3 },
        lists: [{ id: 'list-1', name: 'VIP', total: 2 }],
        listsTruncated: false,
      })
    );
  });

  it('falls back to list total when no analytics snapshot exists', async () => {
    const followers = jest.fn().mockResolvedValue({
      items: [],
      hasMore: false,
      total: 42,
    });
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [
          {
            key: 'recent',
            label: 'Recent',
            directions: ['desc'],
            defaultDirection: 'desc',
          },
        ],
      },
    });
    (service as any)._channelInteractionService
      .getStoredFollowerAudienceCounts
      .mockResolvedValue({
        categories: { mutual: 8 },
        lists: [],
        listsTruncated: false,
      });

    await expect(
      service.getFollowerAudienceSummary(org, user, integration.id)
    ).resolves.toEqual(
      expect.objectContaining({
        total: 42,
        totalAsOf: null,
        totalSource: 'list',
        categories: { mutual: 8 },
        lists: [],
        listsTruncated: false,
      })
    );
  });

  it('returns only eligible, sanitized social channels', async () => {
    const followers = jest.fn().mockResolvedValue({
      items: [{ id: 'follower-a', name: 'Follower A' }],
      hasMore: false,
    });
    const service = createService(
      [
        integration,
        { ...integration, id: 'disabled', disabled: true },
        { ...integration, id: 'article', type: 'article' },
        { ...integration, id: 'unsupported', providerIdentifier: 'unsupported' },
        { ...integration, id: 'empty', providerIdentifier: 'empty' },
        { ...integration, id: 'failing', providerIdentifier: 'failing' },
      ],
      {
        supported: {
          followers,
          followerSorts: [
            {
              key: 'recent',
              label: 'Recent',
              directions: ['desc'],
              defaultDirection: 'desc',
            },
          ],
        },
        unsupported: {},
        empty: { followers: jest.fn().mockResolvedValue({ items: [], hasMore: false }) },
        failing: { followers: jest.fn().mockRejectedValue(new Error('provider body')) },
      }
    );

    await expect(service.getFollowerChannels(org)).resolves.toEqual([
      {
        id: 'channel-a',
        name: 'Channel A',
        picture: 'https://example.com/channel.png',
        display: '@channel',
        identifier: 'supported',
        sorts: [
          {
            key: 'recent',
            label: 'Recent',
            directions: ['desc'],
            defaultDirection: 'desc',
          },
        ],
        strategy: {
          id: 'grow_audience',
          version: 1,
          summary: {
            key: 'channelStrategies.grow_audience.description',
            defaultValue:
              'Prioritize reciprocal relationships that can expand your audience.',
          },
          ui: expect.objectContaining({
            defaultFilter: 'all',
            defaultSort: 'recent',
          }),
        },
        recomputing: false,
        canFollowAudienceMember: false,
      },
    ]);
    expect(followers).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'channel-a' }),
      'token',
      { limit: 1 }
    );
    expect(ioRedis.set).toHaveBeenCalledWith(
      'integration:followers:probe:org-a:channel-a',
      '1',
      'EX',
      expect.any(Number)
    );
  });

  it('returns channel details with subscription diagnostics', async () => {
    const service = createService(
      [
        {
          ...integration,
          internalId: '1911740070',
          refreshNeeded: false,
          inBetweenSteps: false,
        },
      ],
      {
        supported: {
          profileUrl: () => 'https://x.com/channel',
          channelInteractionWebhooks: {
            getInteractionCoverage: () => [
              { kind: 'like', inbound: 'supported', outbound: 'supported' },
              { kind: 'follow', inbound: 'supported', outbound: 'supported' },
            ],
          },
        },
      }
    );
    (service as any)._channelInteractionRepository.getInteractionTracking.mockResolvedValue({
      followerSync: {
        activeGeneration: 'gen-1',
        status: 'COMPLETE',
        completedAt: new Date('2026-08-15T16:00:00.000Z'),
      },
      subscriptions: [
        {
          eventKey: 'like.create',
          direction: 'INBOUND',
          remoteIdentifier: 'sub-like',
          state: 'ERROR',
          failureCategory: 'authorization',
          failureReason: 'Tracking permissions do not allow this subscription.',
          trackingStartedAt: null,
          createdAt: new Date('2026-08-15T20:12:00.000Z'),
          updatedAt: new Date('2026-08-15T20:12:00.000Z'),
        },
        {
          eventKey: 'follow.follow',
          direction: 'INBOUND',
          remoteIdentifier: 'sub-follow',
          state: 'ACTIVE',
          trackingStartedAt: new Date('2026-08-15T20:12:00.000Z'),
          createdAt: new Date('2026-08-15T20:12:00.000Z'),
          updatedAt: new Date('2026-08-15T20:12:00.000Z'),
        },
      ],
    });

    await expect(service.getChannelDetails(org, 'channel-a')).resolves.toEqual({
      id: 'channel-a',
      name: 'Channel A',
      picture: 'https://example.com/channel.png',
      display: '@channel',
      identifier: 'supported',
      internalId: '1911740070',
      type: 'social',
      disabled: false,
      refreshNeeded: false,
      inBetweenSteps: false,
      profileUrl: 'https://x.com/channel',
      strategyApplicable: false,
      recomputeRequested: false,
      utmParams: null,
      tracking: expect.objectContaining({
        state: 'partial',
        failureCategory: 'authorization',
        reason: 'Tracking permissions do not allow this subscription.',
        failedSubscriptions: [
          expect.objectContaining({
            eventKey: 'like.create',
            direction: 'inbound',
            reason: 'Tracking permissions do not allow this subscription.',
          }),
        ],
      }),
      subscriptions: [
        expect.objectContaining({
          eventKey: 'like.create',
          direction: 'inbound',
          state: 'error',
          remoteIdentifier: 'sub-like',
          failureCategory: 'authorization',
        }),
        expect.objectContaining({
          eventKey: 'follow.follow',
          direction: 'inbound',
          state: 'active',
          remoteIdentifier: 'sub-follow',
        }),
      ],
    });
  });

  it('returns unsupported tracking for channels without interaction webhooks', async () => {
    const service = createService(
      [{ ...integration, internalId: '42', refreshNeeded: true, inBetweenSteps: false }],
      { supported: { followers: jest.fn() } }
    );

    await expect(service.getChannelDetails(org, 'channel-a')).resolves.toMatchObject({
      id: 'channel-a',
      refreshNeeded: true,
      tracking: {
        state: 'unsupported',
        availability: 'unavailable',
        noBackfill: true,
        coverage: [],
      },
      subscriptions: [],
    });
    expect(
      (service as any)._channelInteractionRepository.getInteractionTracking
    ).not.toHaveBeenCalled();
  });

  it('returns the selected public strategy only for follower-capable channels', async () => {
    const service = createService(
      [{ ...integration, strategyId: 'lead_capture', strategyVersion: 1 }],
      { supported: { followers: jest.fn() } }
    );

    await expect(service.getChannelDetails(org, 'channel-a')).resolves.toMatchObject({
      strategyApplicable: true,
      strategy: {
        id: 'lead_capture',
        version: 1,
        label: { defaultValue: 'Capture leads' },
      },
      recomputeRequested: false,
    });
  });

  it('reports recomputing while stored projections still use another strategy', async () => {
    const service = createService(
      [{ ...integration, strategyId: 'lead_capture', strategyVersion: 1 }],
      { supported: { followers: jest.fn() } }
    );
    (service as any)._channelInteractionRepository
      .hasStaleRelationshipProjections.mockResolvedValue(true);

    await expect(
      service.getChannelDetails(org, 'channel-a')
    ).resolves.toMatchObject({ recomputing: true });
    expect(
      (service as any)._channelInteractionRepository
        .hasStaleRelationshipProjections
    ).toHaveBeenCalledWith('org-a', 'channel-a', {
      strategyId: 'lead_capture',
      strategyVersion: 1,
    });
  });

  it('does not query recompute status for channels without follower identities', async () => {
    const service = createService([integration], { supported: {} });

    await expect(
      service.getChannelDetails(org, 'channel-a')
    ).resolves.not.toHaveProperty('recomputing');
    expect(
      (service as any)._channelInteractionRepository
        .hasStaleRelationshipProjections
    ).not.toHaveBeenCalled();
  });

  it('updates a valid strategy and requests recomputation after persistence', async () => {
    const updateStrategy = jest.fn().mockResolvedValue(true);
    const service = createService([integration], { supported: { followers: jest.fn() } });
    (service as any)._integrationRepository.updateStrategy = updateStrategy;
    (service as any)._relationshipGradeScheduleService.trigger.mockResolvedValue(undefined);

    await expect(
      service.updateChannelStrategy(org.id, 'channel-a', {
        strategyId: 'lead_capture',
      })
    ).resolves.toEqual({
      strategy: expect.objectContaining({
        id: 'lead_capture',
        version: 1,
      }),
      recomputeRequested: true,
    });
    expect(updateStrategy).toHaveBeenCalledWith(
      org.id,
      'channel-a',
      'lead_capture',
      1
    );
    expect(
      (service as any)._relationshipGradeScheduleService.trigger
    ).toHaveBeenCalledTimes(1);
  });

  it('keeps a changed strategy saved when recomputation fails', async () => {
    const service = createService([integration], { supported: { followers: jest.fn() } });
    (service as any)._integrationRepository.updateStrategy = jest.fn().mockResolvedValue(true);
    (service as any)._relationshipGradeScheduleService.trigger.mockRejectedValue(
      new Error('Temporal unavailable')
    );

    await expect(
      service.updateChannelStrategy(org.id, 'channel-a', {
        strategyId: 'lead_capture',
      })
    ).resolves.toMatchObject({
      strategy: { id: 'lead_capture', version: 1 },
      recomputeRequested: false,
    });
  });

  it('does not trigger recomputation for an unchanged strategy', async () => {
    const service = createService([integration], { supported: { followers: jest.fn() } });
    (service as any)._integrationRepository.updateStrategy = jest.fn().mockResolvedValue(false);

    await expect(
      service.updateChannelStrategy(org.id, 'channel-a', {
        strategyId: 'grow_audience',
      })
    ).resolves.toMatchObject({ recomputeRequested: false });
    expect(
      (service as any)._relationshipGradeScheduleService.trigger
    ).not.toHaveBeenCalled();
  });

  it('rejects strategy updates for unsupported and cross-organization channels', async () => {
    const unsupported = createService([integration], { supported: {} });
    await expect(
      unsupported.updateChannelStrategy(org.id, 'channel-a', {
        strategyId: 'lead_capture',
      })
    ).rejects.toMatchObject({ status: 400 });

    const supported = createService([integration], { supported: { followers: jest.fn() } });
    await expect(
      supported.updateChannelStrategy('other-org', 'channel-a', {
        strategyId: 'lead_capture',
      })
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      supported.updateChannelStrategy(org.id, 'channel-a', {
        strategyId: 'not_a_strategy' as any,
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects channel details for another organization', async () => {
    const service = createService([integration], { supported: {} });
    await expect(
      service.getChannelDetails({ id: 'org-b' } as any, 'channel-a')
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('uses an organization-scoped integration and validates declared sorting', async () => {
    const followers = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'follower-a',
          name: 'Follower A',
          profileUrl: 'javascript:alert(1)',
          picture: 'https://example.com/follower.png',
        },
      ],
      nextCursor: 'opaque-next',
      hasMore: true,
    });
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [
          {
            key: 'recent',
            label: 'Recent',
            directions: ['desc'],
            defaultDirection: 'desc',
          },
        ],
      },
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'recent',
        direction: 'desc',
      })
    ).resolves.toEqual({
      items: [
        {
          id: 'follower-a',
          name: 'Follower A',
          picture: 'https://example.com/follower.png',
        },
      ],
      nextCursor: 'opaque-next',
      hasMore: true,
    });
    expect(
      (service as any)._integrationRepository.getIntegrationById
    ).toHaveBeenCalledWith('org-a', 'channel-a');
    expect(followers).toHaveBeenCalledWith(
      expect.anything(),
      'token',
      expect.objectContaining({ sort: 'recent', direction: 'desc' })
    );

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'recent',
        direction: 'asc',
      })
    ).rejects.toBeInstanceOf(HttpException);
    await expect(
      service.getFollowers(org, user, 'missing', { limit: 24 })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('enriches provider follower pages with interaction metrics', async () => {
    const followers = jest.fn().mockResolvedValue({
      items: [
        { id: 'follower-a', name: 'Follower A' },
        { id: 'follower-b', name: 'Follower B' },
      ],
      hasMore: false,
    });
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [
          {
            key: 'recent',
            label: 'Recent',
            directions: ['desc'],
            defaultDirection: 'desc',
          },
        ],
        channelInteractionWebhooks: {
          getInteractionCoverage: (): any[] => [],
        },
      },
    });
    (service as any)._channelInteractionRepository.getFollowerInteractionMetrics.mockResolvedValue(
      new Map([
        [
          'follower-a',
          {
            interactionCount: 23,
            interactionScore: 40,
            lastInteractionAt: new Date('2026-08-12T12:00:00.000Z'),
          },
        ],
      ])
    );

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'recent',
        direction: 'desc',
      })
    ).resolves.toEqual({
      items: [
        {
          id: 'follower-a',
          name: 'Follower A',
          interactionCount: 23,
          interactionScore: 40,
          lastInteractionAt: '2026-08-12T12:00:00.000Z',
          noteCount: 0,
          likesCount: 0,
          relationshipGrade: null,
          myGrade: null,
          adjustedGrade: null,
        },
        {
          id: 'follower-b',
          name: 'Follower B',
          interactionCount: 0,
          noteCount: 0,
          likesCount: 0,
          relationshipGrade: null,
          myGrade: null,
          adjustedGrade: null,
        },
      ],
      hasMore: false,
    });
    expect(
      (service as any)._channelInteractionRepository.getFollowerInteractionMetrics
    ).toHaveBeenCalledWith('org-a', 'channel-a', ['follower-a', 'follower-b']);
  });

  it('sorts page-scoped follower results locally without passing sort to the provider', async () => {
    const followers = jest.fn().mockResolvedValue({
      items: [
        { id: 'low', name: 'Low', followersCount: 10 },
        { id: 'high', name: 'High', followersCount: 100 },
      ],
      hasMore: false,
    });
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [
          {
            key: 'recent',
            label: 'Recent',
            directions: ['desc'],
            defaultDirection: 'desc',
            scope: 'native',
          },
          {
            key: 'followers_count',
            label: 'Followers',
            directions: ['asc', 'desc'],
            defaultDirection: 'desc',
            scope: 'page',
          },
        ],
      },
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'followers_count',
        direction: 'desc',
      })
    ).resolves.toEqual({
      items: [
        { id: 'high', name: 'High', followersCount: 100 },
        { id: 'low', name: 'Low', followersCount: 10 },
      ],
      hasMore: false,
    });
    expect(followers).toHaveBeenCalledWith(
      expect.anything(),
      'token',
      expect.objectContaining({ limit: 24, sort: undefined, direction: undefined })
    );
  });

  it('backfills the next provider page when ignored followers empty the current page', async () => {
    const followers = jest
      .fn()
      .mockResolvedValueOnce({
        items: followerItems(1, 24),
        nextCursor: 'page-2',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: followerItems(25, 24),
        nextCursor: 'page-3',
        hasMore: true,
      });
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [
          {
            key: 'recent',
            label: 'Recent',
            directions: ['desc'],
            defaultDirection: 'desc',
          },
        ],
      },
    });
    (service as any)._channelInteractionRepository.getFollowerNoteCounts.mockImplementation(
      async (_org: string, _integrationId: string, externalIds: string[]) =>
        ignoredNoteCounts(
          externalIds.filter((id) => Number(id.replace('follower-', '')) <= 24)
        )
    );

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'recent',
        direction: 'desc',
      })
    ).resolves.toEqual({
      items: followerItems(25, 24),
      nextCursor: 'page-3',
      hasMore: true,
    });
    expect(followers).toHaveBeenCalledTimes(2);
    expect(followers).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      'token',
      expect.objectContaining({ cursor: 'page-2', limit: 24 })
    );
  });

  it('stops backfilling when the provider runs out of followers', async () => {
    const followers = jest
      .fn()
      .mockResolvedValueOnce({
        items: followerItems(1, 24),
        nextCursor: 'page-2',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: followerItems(25, 3),
        hasMore: false,
      });
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [
          {
            key: 'recent',
            label: 'Recent',
            directions: ['desc'],
            defaultDirection: 'desc',
          },
        ],
      },
    });
    (service as any)._channelInteractionRepository.getFollowerNoteCounts.mockImplementation(
      async (_org: string, _integrationId: string, externalIds: string[]) =>
        ignoredNoteCounts(
          externalIds.filter((id) => Number(id.replace('follower-', '')) <= 24)
        )
    );

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'recent',
        direction: 'desc',
      })
    ).resolves.toEqual({
      items: followerItems(25, 3),
      hasMore: false,
    });
    expect(followers).toHaveBeenCalledTimes(2);
  });

  it('caps ignored backfill at five provider pages', async () => {
    const followers = jest.fn().mockImplementation(
      async (_integration: unknown, _token: string, query: { cursor?: string }) => {
        const page = query.cursor
          ? Number(String(query.cursor).replace('page-', ''))
          : 1;
        const start = (page - 1) * 24 + 1;
        return {
          items: followerItems(start, 24),
          nextCursor: `page-${page + 1}`,
          hasMore: true,
        };
      }
    );
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [
          {
            key: 'recent',
            label: 'Recent',
            directions: ['desc'],
            defaultDirection: 'desc',
          },
        ],
      },
    });
    const keptIds = new Set(['follower-1', 'follower-25', 'follower-49', 'follower-73', 'follower-97']);
    (service as any)._channelInteractionRepository.getFollowerNoteCounts.mockImplementation(
      async (_org: string, _integrationId: string, externalIds: string[]) =>
        ignoredNoteCounts(externalIds.filter((id) => !keptIds.has(id)))
    );

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'recent',
        direction: 'desc',
      })
    ).resolves.toEqual({
      items: [
        { id: 'follower-1', name: 'Follower 1' },
        { id: 'follower-25', name: 'Follower 25' },
        { id: 'follower-49', name: 'Follower 49' },
        { id: 'follower-73', name: 'Follower 73' },
        { id: 'follower-97', name: 'Follower 97' },
      ],
      nextCursor: 'page-6',
      hasMore: true,
    });
    expect(followers).toHaveBeenCalledTimes(5);
  });

  it('does not skip leftover followers when a later provider page would overflow', async () => {
    const followers = jest
      .fn()
      .mockResolvedValueOnce({
        items: followerItems(1, 24),
        nextCursor: 'page-2',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: followerItems(25, 24),
        nextCursor: 'page-3',
        hasMore: true,
      });
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [
          {
            key: 'recent',
            label: 'Recent',
            directions: ['desc'],
            defaultDirection: 'desc',
          },
        ],
      },
    });
    (service as any)._channelInteractionRepository.getFollowerNoteCounts.mockImplementation(
      async (_org: string, _integrationId: string, externalIds: string[]) =>
        ignoredNoteCounts(
          externalIds.filter((id) => {
            const n = Number(id.replace('follower-', ''));
            return n >= 22 && n <= 24;
          })
        )
    );

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'recent',
        direction: 'desc',
      })
    ).resolves.toEqual({
      items: followerItems(1, 21),
      nextCursor: 'page-2',
      hasMore: true,
    });
    expect(followers).toHaveBeenCalledTimes(2);
  });

  it('refreshes exactly once after a refresh-token failure', async () => {
    const followers = jest
      .fn()
      .mockRejectedValueOnce(new RefreshToken('', '{}', {} as any))
      .mockResolvedValueOnce({ items: [], hasMore: false });
    const service = createService([integration], {
      supported: { followers, followerSorts: [] },
    });
    (service as any)._refreshIntegrationService.refresh.mockResolvedValue({
      accessToken: 'new-token',
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', { limit: 24 })
    ).resolves.toEqual({ items: [], hasMore: false });
    expect((service as any)._refreshIntegrationService.refresh).toHaveBeenCalledTimes(1);
    expect(followers).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ token: 'new-token' }),
      'new-token',
      { limit: 24 }
    );
  });

  it('returns a sanitized temporary-unavailable error for provider failures', async () => {
    const service = createService([integration], {
      supported: {
        followers: jest.fn().mockRejectedValue(new Error('token=secret provider body')),
      },
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', { limit: 24 })
    ).rejects.toMatchObject({
      message: 'Followers are temporarily unavailable',
      status: 503,
    });
  });

  it('uses the database-ranked follower path for interaction sorting', async () => {
    const followers = jest.fn();
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [],
        channelInteractionWebhooks: {
          getInteractionCoverage: (): any[] => [],
        },
      },
    });
    (service as any)._channelInteractionRepository.getRankedFollowers.mockResolvedValue({
      items: [{
        counterpartyExternalId: 'follower-a',
        interactionCount: 5,
        interactionScore: 14,
        lastInteractionAt: new Date('2026-08-12T12:00:00.000Z'),
        audienceMember: { name: 'Follower A' },
      }],
      hasMore: false,
      rollup: {
        activeGeneration: 'generation-a',
        computedAt: new Date('2026-08-12T12:00:00.000Z'),
      },
      followerSync: {
        activeGeneration: 'followers-a',
        status: 'IN_PROGRESS',
        completedAt: new Date(),
      },
      subscriptions: [{ state: 'ACTIVE' }],
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'interactions',
        direction: 'desc',
        window: 'month',
      })
    ).resolves.toMatchObject({
      items: [{
        id: 'follower-a',
        interactionCount: 5,
        interactionScore: 14,
      }],
      window: 'month',
      tracking: { availability: 'ready' },
    });
    expect(followers).not.toHaveBeenCalled();
    expect(
      (service as any)._channelInteractionRepository.getRankedFollowers
    ).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-a',
      integrationId: 'channel-a',
      direction: 'desc',
      limit: 24,
    }));

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'interactions',
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('maps relationship projection on interaction-ranked pages', async () => {
    const followers = jest.fn();
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [],
        channelInteractionWebhooks: {
          getInteractionCoverage: (): any[] => [],
        },
      },
    });
    (service as any)._channelInteractionRepository.getRankedFollowers.mockResolvedValue({
      items: [{
        counterpartyExternalId: 'follower-a',
        interactionCount: 5,
        interactionScore: 14,
        lastInteractionAt: new Date('2026-08-12T12:00:00.000Z'),
        audienceMember: { name: 'Follower A' },
      }],
      hasMore: false,
      rollup: {
        activeGeneration: 'generation-a',
        computedAt: new Date('2026-08-12T12:00:00.000Z'),
      },
      followerSync: {
        activeGeneration: 'followers-a',
        status: 'IN_PROGRESS',
        completedAt: new Date(),
      },
      subscriptions: [{ state: 'ACTIVE' }],
    });
    (
      service as any
    )._channelInteractionRepository.getFollowerNoteCounts.mockResolvedValue(
      new Map([
        [
          'follower-a',
          {
            noteCount: 1,
            likesCount: 2,
            relationshipGrade: 4,
            myGrade: null,
            relationshipEffortScore: 4,
            relationshipReciprocationScore: 12,
            relationshipNetGap: 8,
            relationshipTriage: 'hot_lead',
            relationshipFormulaVersion: 2,
            relationshipSnapshotAt: new Date('2026-08-12T12:00:00.000Z'),
          },
        ],
      ])
    );

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'interactions',
        direction: 'desc',
        window: 'month',
      })
    ).resolves.toMatchObject({
      items: [{
        id: 'follower-a',
        effortScore: 4,
        reciprocationScore: 12,
        netGap: 8,
        effortStars: 1.5,
        reciprocationStars: 2,
        relationshipTriage: 'hot_lead',
        relationshipFormulaVersion: 2,
        relationshipSnapshotAt: '2026-08-12T12:00:00.000Z',
      }],
    });
  });

  it('maps relationship projection on provider recent pages', async () => {
    const followers = jest.fn().mockResolvedValue({
      items: [{ id: 'follower-a', name: 'Follower A' }],
      hasMore: false,
    });
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [
          {
            key: 'recent',
            label: 'Recent',
            directions: ['desc'],
            defaultDirection: 'desc',
          },
        ],
        channelInteractionWebhooks: {
          getInteractionCoverage: (): any[] => [],
        },
      },
    });
    (
      service as any
    )._channelInteractionRepository.getFollowerNoteCounts.mockResolvedValue(
      new Map([
        [
          'follower-a',
          {
            noteCount: 0,
            likesCount: 0,
            relationshipGrade: 4,
            myGrade: null,
            relationshipEffortScore: 4,
            relationshipReciprocationScore: 12,
            relationshipNetGap: 8,
            relationshipTriage: 'hot_lead',
            relationshipFormulaVersion: 2,
            relationshipSnapshotAt: new Date('2026-08-12T12:00:00.000Z'),
          },
        ],
      ])
    );

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'recent',
        direction: 'desc',
      })
    ).resolves.toMatchObject({
      items: [{
        id: 'follower-a',
        effortScore: 4,
        reciprocationScore: 12,
        netGap: 8,
        effortStars: 1.5,
        reciprocationStars: 2,
        relationshipTriage: 'hot_lead',
        relationshipFormulaVersion: 2,
        relationshipSnapshotAt: '2026-08-12T12:00:00.000Z',
      }],
    });
  });

  it('uses the database note-count path for notes sorting without a window', async () => {
    const followers = jest.fn();
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [],
        channelInteractionWebhooks: {
          getInteractionCoverage: (): any[] => [],
        },
      },
    });
    (
      service as any
    )._channelInteractionRepository.getFollowersByNoteCount.mockResolvedValue({
      items: [
        {
          externalId: 'follower-a',
          name: 'Follower A',
          username: null,
          picture: null,
          profileUrl: null,
          bio: null,
          followersCount: null,
          followingCount: null,
          followedAt: null,
          accountCreatedAt: null,
          noteCount: 3,
          likesCount: 0,
        },
      ],
      hasMore: false,
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'notes',
        direction: 'desc',
      })
    ).resolves.toMatchObject({
      items: [{ id: 'follower-a', noteCount: 3, likesCount: 0 }],
      hasMore: false,
    });
    expect(followers).not.toHaveBeenCalled();
    expect(
      (service as any)._channelInteractionRepository.getFollowersByNoteCount
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        integrationId: 'channel-a',
        userId: 'user-a',
        direction: 'desc',
        limit: 24,
      })
    );
    expect(
      (service as any)._channelInteractionRepository.getRankedFollowers
    ).not.toHaveBeenCalled();
  });

  it('advertises the Notes database sort for interaction-capable channels', async () => {
    const service = createService([integration], {
      supported: {
        followers: jest.fn().mockResolvedValue({
          items: [{ id: 'follower-a', name: 'Follower A' }],
          hasMore: false,
        }),
        followerSorts: [
          {
            key: 'recent',
            label: 'Recent',
            directions: ['desc'],
            defaultDirection: 'desc',
          },
        ],
        channelInteractionWebhooks: {
          getInteractionCoverage: (): any[] => [],
        },
      },
    });
    (
      service as any
    )._channelInteractionRepository.getInteractionTracking.mockResolvedValue({
      followerSync: null,
      subscriptions: [],
    });

    await expect(service.getFollowerChannels(org)).resolves.toEqual([
      expect.objectContaining({
        id: 'channel-a',
        sorts: expect.arrayContaining([
          expect.objectContaining({ key: 'notes', scope: 'database' }),
          expect.objectContaining({ key: 'likes', scope: 'database' }),
          expect.objectContaining({ key: 'interactions', scope: 'database' }),
          expect.objectContaining({
            key: 'relationship_grade',
            scope: 'database',
          }),
          expect.objectContaining({ key: 'my_grade', scope: 'database' }),
        ]),
      }),
    ]);
  });

  it('returns unsupported tracking metadata when interaction coverage is absent', async () => {
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
      },
    });
    (service as any)._channelInteractionService.getFollowerDetails.mockResolvedValue({
      member: {
        externalId: 'follower-a',
        name: 'Follower A',
        username: null,
        picture: null,
        profileUrl: null,
        bio: null,
        followersCount: null,
        followingCount: null,
        followedAt: null,
        accountCreatedAt: null,
      },
      snapshots: [],
      notes: [],
      events: [],
      tracking: {
        followerSync: null,
        subscriptions: [],
      },
    });

    await expect(
      service.getFollowerMemberDetails(org, user, 'channel-a', 'follower-a')
    ).resolves.toMatchObject({
      tracking: {
        state: 'unsupported',
        availability: 'unavailable',
        noBackfill: true,
        coverage: [],
      },
    });
  });

  it('treats unsupported interaction directions as limited coverage', async () => {
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        channelInteractionWebhooks: {
          getInteractionCoverage: () => [
            { kind: 'like', inbound: 'supported', outbound: 'supported' },
            {
              kind: 'repost',
              inbound: 'unsupported',
              outbound: 'supported',
              reason: 'Inbound reposts are not tracked',
            },
          ],
        },
      },
    });
    (service as any)._channelInteractionService.getFollowerDetails.mockResolvedValue({
      member: {
        externalId: 'follower-a',
        name: 'Follower A',
        username: null,
        picture: null,
        profileUrl: null,
        bio: null,
        followersCount: null,
        followingCount: null,
        followedAt: null,
        accountCreatedAt: null,
      },
      snapshots: [],
      notes: [],
      events: [],
      tracking: {
        followerSync: null,
        subscriptions: [{ state: 'ACTIVE' }],
      },
    });

    await expect(
      service.getFollowerMemberDetails(org, user, 'channel-a', 'follower-a')
    ).resolves.toMatchObject({
      tracking: {
        state: 'partial',
        noBackfill: true,
        coverage: [
          { kind: 'like', inbound: 'supported', outbound: 'supported' },
          {
            kind: 'repost',
            inbound: 'unsupported',
            outbound: 'supported',
            reason: 'Inbound reposts are not tracked',
          },
        ],
      },
    });
  });

  it('returns a sanitized follower member detail payload for an owned follower', async () => {
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        channelInteractionWebhooks: {
          getInteractionCoverage: () => [
            { kind: 'like', inbound: 'supported', outbound: 'supported' },
          ],
        },
      },
    });
    (service as any)._channelInteractionService.getFollowerDetails.mockResolvedValue({
      member: {
        externalId: 'follower-a',
        name: 'Follower A',
        username: 'follower',
        picture: 'https://example.com/follower.png',
        profileUrl: 'javascript:alert(1)',
        bio: 'Bio',
        followersCount: 10,
        followingCount: 5,
        followedAt: new Date('2026-01-01T00:00:00.000Z'),
        accountCreatedAt: new Date('2025-01-01T00:00:00.000Z'),
      },
      snapshots: [
        {
          snapshotAt: new Date('2026-07-01T00:00:00.000Z'),
          windowStartedAt: new Date('2026-06-01T00:00:00.000Z'),
          effortScore: 4,
          reciprocationScore: 2,
          reciprocity: 0.5,
          grade: 3,
          formulaVersion: 1,
        },
        {
          snapshotAt: new Date('2026-08-01T00:00:00.000Z'),
          windowStartedAt: new Date('2026-07-02T00:00:00.000Z'),
          effortScore: 8,
          reciprocationScore: 8,
          reciprocity: 1,
          grade: 5,
          formulaVersion: 1,
        },
      ],
      notes: [
        {
          id: 'note-a',
          content: 'Team note',
          createdAt: new Date('2026-08-10T12:00:00.000Z'),
          updatedAt: new Date('2026-08-10T12:00:00.000Z'),
          author: {
            id: 'user-a',
            name: 'Alex',
            lastName: 'Author',
            email: 'alex@example.com',
          },
        },
      ],
      events: [
        {
          id: 'event-a',
          kind: 'LIKE',
          direction: 'INBOUND',
          eventAt: new Date('2026-08-11T12:00:00.000Z'),
          relatedObjectId: 'post-a',
        },
      ],
      tracking: {
        followerSync: {
          activeGeneration: 'generation-a',
          status: 'COMPLETED',
          completedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        subscriptions: [
          {
            state: 'ACTIVE',
            trackingStartedAt: new Date('2026-07-01T00:00:00.000Z'),
          },
        ],
      },
    });

    await expect(
      service.getFollowerMemberDetails(org, user, 'channel-a', 'follower-a')
    ).resolves.toEqual({
      follower: {
        id: 'follower-a',
        name: 'Follower A',
        username: 'follower',
        picture: 'https://example.com/follower.png',
        bio: 'Bio',
        followersCount: 10,
        followingCount: 5,
        followedAt: '2026-01-01T00:00:00.000Z',
        accountCreatedAt: '2025-01-01T00:00:00.000Z',
        relationshipGrade: null,
        myGrade: null,
        adjustedGrade: null,
      },
      notes: [
        {
          id: 'note-a',
          content: 'Team note',
          author: { id: 'user-a', name: 'Alex Author' },
          createdAt: '2026-08-10T12:00:00.000Z',
          updatedAt: '2026-08-10T12:00:00.000Z',
        },
      ],
      interactions: [
        {
          id: 'event-a',
          kind: 'like',
          direction: 'inbound',
          timestamp: '2026-08-11T12:00:00.000Z',
          relatedObjectId: 'post-a',
        },
      ],
      relationship: {
        windowDays: 30,
        cadenceDays: 3,
        formulaVersion: 1,
        current: {
          snapshotAt: '2026-08-01T00:00:00.000Z',
          windowStartedAt: '2026-07-02T00:00:00.000Z',
          effortScore: 8,
          reciprocationScore: 8,
          reciprocity: 1,
          grade: 5,
          adjustedGrade: 5,
          effortStars: 2,
          reciprocationStars: 2,
          triage: 'mutual',
          formulaVersion: 1,
        },
        history: [
          {
            snapshotAt: '2026-07-01T00:00:00.000Z',
            windowStartedAt: '2026-06-01T00:00:00.000Z',
            effortScore: 4,
            reciprocationScore: 2,
            reciprocity: 0.5,
            grade: 3,
            adjustedGrade: 3,
            effortStars: 1.5,
            reciprocationStars: 1,
            triage: 'quiet',
            formulaVersion: 1,
          },
          {
            snapshotAt: '2026-08-01T00:00:00.000Z',
            windowStartedAt: '2026-07-02T00:00:00.000Z',
            effortScore: 8,
            reciprocationScore: 8,
            reciprocity: 1,
            grade: 5,
            adjustedGrade: 5,
            effortStars: 2,
            reciprocationStars: 2,
            triage: 'mutual',
            formulaVersion: 1,
          },
        ],
      },
      myGrade: null,
      tracking: {
        state: 'active',
        noBackfill: true,
        trackingStartedAt: '2026-07-01T00:00:00.000Z',
        followerSnapshotAt: '2026-08-01T00:00:00.000Z',
        coverage: [
          { kind: 'like', inbound: 'supported', outbound: 'supported' },
        ],
      },
    });
    expect(
      (service as any)._channelInteractionService.getFollowerDetails
    ).toHaveBeenCalledWith('org-a', 'channel-a', 'follower-a', 'user-a');
  });

  it('uses the live relationship projection as follower detail current', async () => {
    const service = createService([integration], {
      supported: { followers: jest.fn() },
    });
    (service as any)._channelInteractionService.getFollowerDetails.mockResolvedValue({
      member: {
        externalId: 'follower-a',
        name: 'Follower A',
        username: null,
        picture: null,
        profileUrl: null,
        bio: null,
        followersCount: null,
        followingCount: null,
        followedAt: null,
        accountCreatedAt: null,
        relationshipGrade: 1,
        relationshipEffortScore: 12,
        relationshipReciprocationScore: 4,
        relationshipNetGap: -8,
        relationshipTriage: 'over_invested',
        relationshipFormulaVersion: 2,
        relationshipSnapshotAt: new Date('2026-08-14T12:00:00.000Z'),
      },
      snapshots: [
        {
          snapshotAt: new Date('2026-08-01T00:00:00.000Z'),
          windowStartedAt: new Date('2026-07-02T00:00:00.000Z'),
          effortScore: 8,
          reciprocationScore: 8,
          reciprocity: 1,
          grade: 5,
          formulaVersion: 1,
        },
      ],
      notes: [],
      events: [],
      tracking: {
        followerSync: null,
        subscriptions: [],
      },
    });

    const result = await service.getFollowerMemberDetails(
      org,
      user,
      'channel-a',
      'follower-a'
    );
    expect(result.relationship.current).toEqual({
      snapshotAt: '2026-08-14T12:00:00.000Z',
      windowStartedAt: '2026-07-15T12:00:00.000Z',
      effortScore: 12,
      reciprocationScore: 4,
      reciprocity: 4 / 12,
      grade: 1,
      adjustedGrade: 1,
      effortStars: 2,
      reciprocationStars: 1.5,
      triage: 'over_invested',
      formulaVersion: 2,
    });
    expect(result.relationship.history).toEqual([
      expect.objectContaining({
        snapshotAt: '2026-08-01T00:00:00.000Z',
        effortScore: 8,
        reciprocationScore: 8,
        formulaVersion: 1,
      }),
    ]);
    expect(result.relationship.formulaVersion).toBe(2);
  });

  it('maps lead fit fields on follower member details', async () => {
    const service = createService([integration], {
      supported: { followers: jest.fn() },
    });
    (service as any)._channelInteractionService.getFollowerDetails.mockResolvedValue({
      member: {
        externalId: 'lead-1',
        name: 'Lead One',
        username: 'leadone',
        picture: null,
        profileUrl: null,
        bio: null,
        followersCount: null,
        followingCount: null,
        followedAt: null,
        accountCreatedAt: null,
        membershipState: 'UNKNOWN',
        inboundInteractionCount: 2,
        leadFitScore: 77,
        leadFitReason: 'Matches tech audience',
        leadBridgesAsLead: [
          {
            bridgeExternalId: 'warm-1',
            bridgeRelationshipGrade: 4.2,
            bridgeMember: { username: 'warmbridge', name: 'Warm' },
          },
        ],
      },
      snapshots: [],
      notes: [],
      events: [],
      tracking: { followerSync: null, subscriptions: [] },
    });

    const result = await service.getFollowerMemberDetails(
      org,
      user,
      'channel-a',
      'lead-1'
    );

    expect(result.follower).toEqual(
      expect.objectContaining({
        id: 'lead-1',
        isLead: true,
        leadFitScore: 77,
        leadFitReason: 'Matches tech audience',
        leadBridges: [
          {
            externalId: 'warm-1',
            username: 'warmbridge',
            grade: 4.2,
          },
        ],
      })
    );
  });

  it('marks bridge-only leads as leads on follower member details', async () => {
    const service = createService([integration], {
      supported: { followers: jest.fn() },
    });
    (service as any)._channelInteractionService.getFollowerDetails.mockResolvedValue({
      member: {
        externalId: 'bridge-lead',
        name: 'Bridge Lead',
        username: null,
        picture: null,
        profileUrl: null,
        bio: null,
        followersCount: null,
        followingCount: null,
        followedAt: null,
        accountCreatedAt: null,
        membershipState: 'NOT_FOLLOWER',
        inboundInteractionCount: 0,
        leadBridgesAsLead: [
          {
            bridgeExternalId: 'warm-1',
            bridgeRelationshipGrade: 3,
            bridgeMember: { username: 'bridge', name: null },
          },
        ],
      },
      snapshots: [],
      notes: [],
      events: [],
      tracking: { followerSync: null, subscriptions: [] },
    });

    const result = await service.getFollowerMemberDetails(
      org,
      user,
      'channel-a',
      'bridge-lead'
    );

    expect(result.follower.isLead).toBe(true);
  });

  it('reads historical grades with the strategy each snapshot was scored with', async () => {
    const service = createService(
      [{ ...integration, strategyId: 'customer_support', strategyVersion: 1 }],
      { supported: { followers: jest.fn() } }
    );
    (service as any)._channelInteractionService.getFollowerDetails.mockResolvedValue({
      member: {
        externalId: 'follower-a',
        name: 'Follower A',
        username: null,
        picture: null,
        profileUrl: null,
        bio: null,
        followersCount: null,
        followingCount: null,
        followedAt: null,
        accountCreatedAt: null,
        relationshipGrade: 2,
        relationshipEffortScore: 12,
        relationshipReciprocationScore: 4,
        relationshipTriage: 'mutual',
        relationshipFormulaVersion: 3,
        relationshipStrategyId: 'customer_support',
        relationshipStrategyVersion: 1,
        relationshipSnapshotAt: new Date('2026-08-14T12:00:00.000Z'),
      },
      snapshots: [
        {
          snapshotAt: new Date('2026-08-01T00:00:00.000Z'),
          windowStartedAt: new Date('2026-07-02T00:00:00.000Z'),
          effortScore: 12,
          reciprocationScore: 4,
          reciprocity: 1 / 3,
          grade: 1.5,
          formulaVersion: 3,
          relationshipStrategyId: 'grow_audience',
          relationshipStrategyVersion: 1,
        },
      ],
      notes: [],
      events: [],
      tracking: { followerSync: null, subscriptions: [] },
    });

    const result = await service.getFollowerMemberDetails(
      org,
      user,
      'channel-a',
      'follower-a'
    );

    // Historical rows keep the identity and triage they were graded with.
    expect(result.relationship.history[0]).toMatchObject({
      grade: 1.5,
      triage: 'over_invested',
      strategyId: 'grow_audience',
      strategyVersion: 1,
    });
    // The live projection keeps its stored triage instead of being re-derived.
    expect(result.relationship.current).toMatchObject({
      grade: 2,
      triage: 'mutual',
      strategyId: 'customer_support',
      strategyVersion: 1,
    });
  });

  it('keeps personal grade independent from relationship snapshot grades', async () => {
    const service = createService([integration], {
      supported: { followers: jest.fn() },
    });
    (service as any)._channelInteractionService.getFollowerDetails.mockResolvedValue({
      member: {
        externalId: 'follower-a',
        name: 'Follower A',
        username: null,
        picture: null,
        profileUrl: null,
        bio: null,
        followersCount: null,
        followingCount: null,
        followedAt: null,
        accountCreatedAt: null,
      },
      snapshots: [
        {
          snapshotAt: new Date('2026-08-01T00:00:00.000Z'),
          windowStartedAt: new Date('2026-07-02T00:00:00.000Z'),
          effortScore: 8,
          reciprocationScore: 6,
          reciprocity: 0.75,
          grade: 4,
          formulaVersion: 1,
        },
      ],
      notes: [],
      events: [],
      tracking: { followerSync: null, subscriptions: [] },
      myGrade: 5,
    });

    await expect(
      service.getFollowerMemberDetails(org, user, 'channel-a', 'follower-a')
    ).resolves.toMatchObject({
      myGrade: 5,
      relationship: {
        current: {
          grade: 4,
          adjustedGrade: 5,
        },
        history: [
          {
            grade: 4,
            adjustedGrade: 5,
          },
        ],
      },
    });
  });

  it('treats persisted PARTIAL subscriptions as partial even with full static coverage', async () => {
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        channelInteractionWebhooks: {
          getInteractionCoverage: () => [
            { kind: 'like', inbound: 'supported', outbound: 'supported' },
          ],
        },
      },
    });
    (service as any)._channelInteractionService.getFollowerDetails.mockResolvedValue({
      member: {
        externalId: 'follower-a',
        name: 'Follower A',
        username: null,
        picture: null,
        profileUrl: null,
        bio: null,
        followersCount: null,
        followingCount: null,
        followedAt: null,
        accountCreatedAt: null,
      },
      snapshots: [],
      notes: [],
      events: [],
      tracking: {
        followerSync: null,
        subscriptions: [{ state: 'PARTIAL', trackingStartedAt: new Date() }],
      },
    });

    const result = await service.getFollowerMemberDetails(
      org,
      user,
      'channel-a',
      'follower-a'
    );
    expect(result.tracking).toMatchObject({
      state: 'partial',
      noBackfill: true,
    });
    expect(result.tracking).not.toHaveProperty('availability');
  });

  it('omits ranking availability for active follower detail tracking', async () => {
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        channelInteractionWebhooks: {
          getInteractionCoverage: () => [
            { kind: 'like', inbound: 'supported', outbound: 'supported' },
          ],
        },
      },
    });
    (service as any)._channelInteractionService.getFollowerDetails.mockResolvedValue({
      member: {
        externalId: 'follower-a',
        name: 'Follower A',
        username: null,
        picture: null,
        profileUrl: null,
        bio: null,
        followersCount: null,
        followingCount: null,
        followedAt: null,
        accountCreatedAt: null,
      },
      snapshots: [],
      notes: [],
      events: [],
      tracking: {
        followerSync: {
          activeGeneration: 'generation-a',
          status: 'COMPLETED',
          completedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        subscriptions: [
          {
            state: 'ACTIVE',
            trackingStartedAt: new Date('2026-07-01T00:00:00.000Z'),
          },
        ],
      },
    });

    const result = await service.getFollowerMemberDetails(
      org,
      user,
      'channel-a',
      'follower-a'
    );
    expect(result.tracking).toMatchObject({
      state: 'active',
      noBackfill: true,
      trackingStartedAt: '2026-07-01T00:00:00.000Z',
      followerSnapshotAt: '2026-08-01T00:00:00.000Z',
    });
    expect(result.tracking).not.toHaveProperty('availability');
  });

  it('reports unavailable detail tracking for error and unconfigured subscriptions', async () => {
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        channelInteractionWebhooks: {
          getInteractionCoverage: () => [
            { kind: 'like', inbound: 'supported', outbound: 'supported' },
          ],
        },
      },
    });
    const baseDetail = {
      member: {
        externalId: 'follower-a',
        name: 'Follower A',
        username: null,
        picture: null,
        profileUrl: null,
        bio: null,
        followersCount: null,
        followingCount: null,
        followedAt: null,
        accountCreatedAt: null,
      },
      snapshots: [],
      notes: [],
      events: [],
      tracking: {
        followerSync: null,
        subscriptions: [],
      },
    };

    (service as any)._channelInteractionService.getFollowerDetails.mockResolvedValue({
      ...baseDetail,
      tracking: {
        followerSync: null,
        subscriptions: [
          {
            state: 'ERROR',
            failureCategory: 'authentication',
            failureReason: 'raw provider oauth failure',
          },
        ],
      },
    });
    await expect(
      service.getFollowerMemberDetails(org, user, 'channel-a', 'follower-a')
    ).resolves.toMatchObject({
      tracking: {
        state: 'error',
        availability: 'unavailable',
        failureCategory: 'authentication',
        reason: 'raw provider oauth failure',
      },
    });

    (service as any)._channelInteractionService.getFollowerDetails.mockResolvedValue({
      ...baseDetail,
      tracking: {
        followerSync: null,
        subscriptions: [{ state: 'UNCONFIGURED' }],
      },
    });
    await expect(
      service.getFollowerMemberDetails(org, user, 'channel-a', 'follower-a')
    ).resolves.toMatchObject({
      tracking: {
        state: 'unconfigured',
        availability: 'unavailable',
      },
    });
  });

  it('rejects follower member detail reads for missing or unavailable integrations', async () => {
    const { NotFoundException } = await import('@nestjs/common');
    const service = createService([integration], {
      supported: { followers: jest.fn() },
    });
    (service as any)._channelInteractionService.getFollowerDetails.mockRejectedValue(
      new NotFoundException('Follower was not found')
    );

    await expect(
      service.getFollowerMemberDetails(org, user, 'missing', 'follower-a')
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.getFollowerMemberDetails(
        org,
        user,
        'channel-a',
        'missing-follower'
      )
    ).rejects.toMatchObject({ status: 404, message: 'Follower was not found' });
  });

  it('resolves follower member details by username', async () => {
    const service = createService([integration], {
      supported: { followers: jest.fn() },
    });
    (service as any)._channelInteractionRepository.findMemberExternalIdByUsername
      .mockResolvedValue('follower-a');
    (service as any)._channelInteractionService.getFollowerDetails.mockResolvedValue({
      member: {
        externalId: 'follower-a',
        name: 'Follower A',
        username: 'SummerYule',
        picture: null,
        bio: null,
        followersCount: null,
        followingCount: null,
        followedAt: null,
        accountCreatedAt: null,
        relationshipGrade: null,
        membershipState: 'FOLLOWER',
        listMemberships: [],
        triageIgnores: [],
      },
      notes: [],
      events: [],
      snapshots: [],
      tracking: { followerSync: null, subscriptions: [] },
      myGrade: null,
    });

    await expect(
      service.getFollowerMemberDetails(
        org,
        user,
        'channel-a',
        undefined,
        'SummerYule'
      )
    ).resolves.toMatchObject({
      follower: { id: 'follower-a', username: 'SummerYule' },
    });
    expect(
      (service as any)._channelInteractionRepository.findMemberExternalIdByUsername
    ).toHaveBeenCalledWith('org-a', 'channel-a', 'SummerYule');
    expect(
      (service as any)._channelInteractionService.getFollowerDetails
    ).toHaveBeenCalledWith('org-a', 'channel-a', 'follower-a', 'user-a');
  });

  it('rejects username member lookups that do not uniquely match', async () => {
    const service = createService([integration], {
      supported: { followers: jest.fn() },
    });
    (service as any)._channelInteractionRepository.findMemberExternalIdByUsername
      .mockResolvedValue(null);

    await expect(
      service.getFollowerMemberDetails(
        org,
        user,
        'channel-a',
        undefined,
        'missing'
      )
    ).rejects.toMatchObject({ status: 404, message: 'Follower was not found' });
    expect(
      (service as any)._channelInteractionService.getFollowerDetails
    ).not.toHaveBeenCalled();
  });

  it('creates, updates, and deletes organization-scoped follower notes', async () => {
    const service = createService([integration], {
      supported: { followers: jest.fn() },
    });
    const user = { id: 'user-a' } as any;
    (service as any)._channelInteractionService.createFollowerNote.mockResolvedValue({
      id: 'note-a',
      content: 'Hello',
      createdAt: new Date('2026-08-12T12:00:00.000Z'),
      updatedAt: new Date('2026-08-12T12:00:00.000Z'),
      author: {
        id: 'user-a',
        name: 'Alex',
        lastName: null,
        email: 'alex@example.com',
      },
    });
    (service as any)._channelInteractionService.updateFollowerNote.mockResolvedValue(
      undefined
    );
    (service as any)._channelInteractionService.deleteFollowerNote.mockResolvedValue(
      undefined
    );

    await expect(
      service.createFollowerMemberNote(
        org,
        user,
        'channel-a',
        'follower-a',
        'Hello'
      )
    ).resolves.toEqual({
      id: 'note-a',
      content: 'Hello',
      author: { id: 'user-a', name: 'Alex' },
      createdAt: '2026-08-12T12:00:00.000Z',
      updatedAt: '2026-08-12T12:00:00.000Z',
    });
    await expect(
      service.updateFollowerMemberNote(org, 'channel-a', 'note-a', 'Updated')
    ).resolves.toBeUndefined();
    await expect(
      service.deleteFollowerMemberNote(org, 'channel-a', 'note-a')
    ).resolves.toBeUndefined();
    expect(
      (service as any)._channelInteractionService.createFollowerNote
    ).toHaveBeenCalledWith(
      'org-a',
      'channel-a',
      'follower-a',
      'user-a',
      'Hello'
    );
    expect(
      (service as any)._channelInteractionService.updateFollowerNote
    ).toHaveBeenCalledWith('org-a', 'channel-a', 'note-a', 'Updated');
    expect(
      (service as any)._channelInteractionService.deleteFollowerNote
    ).toHaveBeenCalledWith('org-a', 'channel-a', 'note-a');
  });

  it('upserts a user-scoped personal grade for an owned follower', async () => {
    const service = createService([integration], {
      supported: { followers: jest.fn() },
    });
    (service as any)._channelInteractionService.upsertFollowerGrade.mockResolvedValue(
      { grade: 4.5, adjustedGrade: 5 }
    );

    await expect(
      service.updateFollowerMemberGrade(org, user, 'channel-a', 'follower-a', 4.5)
    ).resolves.toEqual({ myGrade: 4.5, adjustedGrade: 5 });
    expect(
      (service as any)._channelInteractionService.upsertFollowerGrade
    ).toHaveBeenCalledWith('org-a', 'channel-a', 'follower-a', 'user-a', 4.5);
  });

  it('refreshes a directional relationship score for an owned follower', async () => {
    const service = createService([integration], {
      supported: { followers: jest.fn() },
    });
    const snapshotAt = new Date('2026-08-14T12:00:00.000Z');
    (service as any)._channelInteractionService.refreshFollowerRelationshipScore.mockResolvedValue(
      {
        externalId: 'follower-a',
        effortScore: 10,
        reciprocationScore: 30,
        reciprocity: 1 / 3,
        grade: 5,
        formulaVersion: 2,
        snapshotAt,
      }
    );

    await expect(
      service.refreshFollowerMemberRelationshipScore(
        org,
        'channel-a',
        'follower-a',
        'their'
      )
    ).resolves.toEqual({
      snapshotAt: '2026-08-14T12:00:00.000Z',
      windowStartedAt: '2026-07-15T12:00:00.000Z',
      effortScore: 10,
      reciprocationScore: 30,
      reciprocity: 1 / 3,
      grade: 5,
      adjustedGrade: 5,
      effortStars: 2,
      reciprocationStars: 4,
      triage: 'hot_lead',
      formulaVersion: 2,
    });
    expect(
      (service as any)._channelInteractionService.refreshFollowerRelationshipScore
    ).toHaveBeenCalledWith('org-a', 'channel-a', 'follower-a', 'their');
  });

  it('falls back to email local-part when note author has no name', async () => {
    const service = createService([integration], {
      supported: { followers: jest.fn() },
    });
    const user = { id: 'user-a' } as any;
    (service as any)._channelInteractionService.createFollowerNote.mockResolvedValue({
      id: 'note-b',
      content: 'Hello',
      createdAt: new Date('2026-08-12T12:00:00.000Z'),
      updatedAt: new Date('2026-08-12T12:00:00.000Z'),
      author: {
        id: 'user-a',
        name: null,
        lastName: null,
        email: 'sean@example.com',
      },
    });

    await expect(
      service.createFollowerMemberNote(
        org,
        user,
        'channel-a',
        'follower-a',
        'Hello'
      )
    ).resolves.toMatchObject({
      author: { id: 'user-a', name: 'Sean' },
    });
  });

  it('returns not found for missing follower notes', async () => {
    const { NotFoundException } = await import('@nestjs/common');
    const service = createService([integration], {
      supported: { followers: jest.fn() },
    });
    (service as any)._channelInteractionService.updateFollowerNote.mockRejectedValue(
      new NotFoundException('Follower note was not found')
    );

    await expect(
      service.updateFollowerMemberNote(org, 'channel-a', 'missing', 'Updated')
    ).rejects.toMatchObject({
      status: 404,
      message: 'Follower note was not found',
    });
  });

  it('searches synced audience members instead of calling the provider', async () => {
    const followers = jest.fn();
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [
          {
            key: 'recent',
            label: 'Recent',
            directions: ['desc'],
            defaultDirection: 'desc',
          },
        ],
      },
    });
    (
      service as any
    )._channelInteractionRepository.getAudienceFollowers.mockResolvedValue({
      items: [
        {
          externalId: 'follower-a',
          name: 'Alice',
          username: 'alice',
          picture: null,
          profileUrl: null,
          bio: null,
          followersCount: null,
          followingCount: null,
          followedAt: new Date('2026-08-12T12:00:00.000Z'),
          accountCreatedAt: null,
          noteCount: 0,
        },
      ],
      hasMore: false,
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'recent',
        direction: 'desc',
        search: ' @Alice ',
      })
    ).resolves.toMatchObject({
      items: [{ id: 'follower-a', name: 'Alice', username: 'alice' }],
      hasMore: false,
    });
    expect(followers).not.toHaveBeenCalled();
    expect(
      (service as any)._channelInteractionRepository.getAudienceFollowers
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        integrationId: 'channel-a',
        userId: 'user-a',
        search: 'Alice',
        sortField: 'followedAt',
        direction: 'desc',
        limit: 24,
      })
    );
  });

  it('treats empty and @-only search as no search', async () => {
    const followers = jest.fn().mockResolvedValue({
      items: [{ id: 'follower-a', name: 'Follower A' }],
      hasMore: false,
    });
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [
          {
            key: 'recent',
            label: 'Recent',
            directions: ['desc'],
            defaultDirection: 'desc',
          },
        ],
      },
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'recent',
        direction: 'desc',
        search: ' @ ',
      })
    ).resolves.toMatchObject({
      items: [{ id: 'follower-a', name: 'Follower A' }],
    });
    expect(followers).toHaveBeenCalled();
    expect(
      (service as any)._channelInteractionRepository.getAudienceFollowers
    ).not.toHaveBeenCalled();
  });

  it('passes search through the notes database sort', async () => {
    const followers = jest.fn();
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [],
        channelInteractionWebhooks: {
          getInteractionCoverage: (): any[] => [],
        },
      },
    });
    (
      service as any
    )._channelInteractionRepository.getFollowersByNoteCount.mockResolvedValue({
      items: [],
      hasMore: false,
    });

    await service.getFollowers(org, user, 'channel-a', {
      limit: 24,
      sort: 'notes',
      direction: 'desc',
      search: '@alice',
    });

    expect(followers).not.toHaveBeenCalled();
    expect(
      (service as any)._channelInteractionRepository.getFollowersByNoteCount
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'alice',
      })
    );
    expect(
      (service as any)._channelInteractionRepository.getAudienceFollowers
    ).not.toHaveBeenCalled();
  });

  it('uses the database like-count path for likes sorting without a window', async () => {
    const followers = jest.fn();
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [],
        channelInteractionWebhooks: {
          getInteractionCoverage: (): any[] => [],
        },
      },
    });
    (
      service as any
    )._channelInteractionRepository.getFollowersByLikesCount.mockResolvedValue({
      items: [
        {
          externalId: 'follower-a',
          name: 'Follower A',
          username: null,
          picture: null,
          profileUrl: null,
          bio: null,
          followersCount: null,
          followingCount: null,
          followedAt: null,
          accountCreatedAt: null,
          noteCount: 0,
          likesCount: 5,
        },
      ],
      hasMore: false,
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'likes',
        direction: 'desc',
      })
    ).resolves.toMatchObject({
      items: [{ id: 'follower-a', likesCount: 5, noteCount: 0 }],
      hasMore: false,
    });
    expect(followers).not.toHaveBeenCalled();
    expect(
      (service as any)._channelInteractionRepository.getFollowersByLikesCount
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        integrationId: 'channel-a',
        userId: 'user-a',
        direction: 'desc',
        limit: 24,
      })
    );
    expect(
      (service as any)._channelInteractionRepository.getRankedFollowers
    ).not.toHaveBeenCalled();
    expect(
      (service as any)._channelInteractionRepository.getFollowersByNoteCount
    ).not.toHaveBeenCalled();
  });

  it('passes search through the likes database sort', async () => {
    const followers = jest.fn();
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [],
        channelInteractionWebhooks: {
          getInteractionCoverage: (): any[] => [],
        },
      },
    });
    (
      service as any
    )._channelInteractionRepository.getFollowersByLikesCount.mockResolvedValue({
      items: [],
      hasMore: false,
    });

    await service.getFollowers(org, user, 'channel-a', {
      limit: 24,
      sort: 'likes',
      direction: 'desc',
      search: '@alice',
    });

    expect(followers).not.toHaveBeenCalled();
    expect(
      (service as any)._channelInteractionRepository.getFollowersByLikesCount
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'alice',
      })
    );
    expect(
      (service as any)._channelInteractionRepository.getAudienceFollowers
    ).not.toHaveBeenCalled();
  });

  it('passes search through the interactions database sort', async () => {
    const followers = jest.fn();
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [],
        channelInteractionWebhooks: {
          getInteractionCoverage: (): any[] => [],
        },
      },
    });
    (
      service as any
    )._channelInteractionRepository.getRankedFollowers.mockResolvedValue({
      items: [],
      hasMore: false,
      rollup: {
        activeGeneration: 'generation-a',
        computedAt: new Date('2026-08-12T12:00:00.000Z'),
      },
      followerSync: {
        activeGeneration: 'followers-a',
        status: 'IN_PROGRESS',
        completedAt: new Date(),
      },
      subscriptions: [{ state: 'ACTIVE' }],
    });

    await service.getFollowers(org, user, 'channel-a', {
      limit: 24,
      sort: 'interactions',
      direction: 'desc',
      window: 'month',
      search: 'alice',
    });

    expect(followers).not.toHaveBeenCalled();
    expect(
      (service as any)._channelInteractionRepository.getRankedFollowers
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'alice',
      })
    );
    expect(
      (service as any)._channelInteractionRepository.getAudienceFollowers
    ).not.toHaveBeenCalled();
  });

  it('uses the database relationship-grade path without a window', async () => {
    const followers = jest.fn();
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [],
        channelInteractionWebhooks: {
          getInteractionCoverage: (): any[] => [],
        },
      },
    });
    (
      service as any
    )._channelInteractionRepository.getFollowersByRelationshipGrade.mockResolvedValue({
      items: [
        {
          externalId: 'follower-a',
          name: 'Follower A',
          username: null,
          picture: null,
          profileUrl: null,
          bio: null,
          followersCount: null,
          followingCount: null,
          followedAt: null,
          accountCreatedAt: null,
          noteCount: 0,
          likesCount: 0,
          relationshipGrade: 4,
          personalGrades: [{ grade: 5 }],
        },
      ],
      hasMore: false,
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'relationship_grade',
        direction: 'desc',
      })
    ).resolves.toMatchObject({
      items: [
        {
          id: 'follower-a',
          relationshipGrade: 4,
          myGrade: 5,
          adjustedGrade: 5,
        },
      ],
      hasMore: false,
    });
    expect(followers).not.toHaveBeenCalled();
    expect(
      (service as any)._channelInteractionRepository.getFollowersByRelationshipGrade
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        integrationId: 'channel-a',
        userId: 'user-a',
        direction: 'desc',
        limit: 24,
      })
    );
  });

  it('uses the database my-grade path for the current user', async () => {
    const followers = jest.fn();
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [],
        channelInteractionWebhooks: {
          getInteractionCoverage: (): any[] => [],
        },
      },
    });
    (
      service as any
    )._channelInteractionRepository.getFollowersByMyGrade.mockResolvedValue({
      items: [],
      hasMore: false,
    });

    await service.getFollowers(org, user, 'channel-a', {
      limit: 24,
      sort: 'my_grade',
      direction: 'desc',
    });

    expect(
      (service as any)._channelInteractionRepository.getFollowersByMyGrade
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-a',
        direction: 'desc',
        limit: 24,
      })
    );
  });

  it('supports actorless organization reads without projecting personal grades', async () => {
    const followers = jest.fn().mockResolvedValue({
      items: [{ id: 'follower-a', name: 'Follower A', myGrade: 5 }],
      hasMore: false,
    });
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [],
      },
    });

    const result = await service.getFollowers(org, undefined, 'channel-a', {
      limit: 24,
    });

    expect(result.items).toEqual([
      expect.objectContaining({ id: 'follower-a', myGrade: null }),
    ]);
    expect(
      (service as any)._channelInteractionRepository.getFollowerNoteCounts
    ).toHaveBeenCalledWith('org-a', 'channel-a', ['follower-a'], undefined);
  });

  it('rejects actorless my-grade sorting before a repository query', async () => {
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        followerSorts: [],
      },
    });

    await expect(
      service.getFollowers(org, undefined, 'channel-a', {
        limit: 24,
        sort: 'my_grade',
        direction: 'desc',
      })
    ).rejects.toMatchObject({
      message: 'Sorting followers by my_grade requires an authenticated user',
    });
    expect(
      (service as any)._channelInteractionRepository.getFollowersByMyGrade
    ).not.toHaveBeenCalled();
  });

  it('routes legacy hot triage through materialized hot picks', async () => {
    const followers = jest.fn();
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [{
          key: 'recent',
          label: 'Recent',
          directions: ['desc'],
          defaultDirection: 'desc',
        }],
      },
    });
    (
      service as any
    )._channelInteractionRepository.getAudienceHot.mockResolvedValue({
      items: [
        {
          externalId: 'hot-1',
          name: 'Hot One',
          username: 'hotone',
          picture: null,
          profileUrl: null,
          bio: null,
          followersCount: null,
          followingCount: null,
          followedAt: null,
          accountCreatedAt: null,
          finalRank: 1,
          rulesRank: 1,
          hotReason: 'Inbound effort exceeds reciprocation',
          suggestedAction: 'Reply to their latest mention',
          hotSource: 'rules',
        },
      ],
      hasMore: false,
      source: 'materialized',
      hour: '2026-08-25T14',
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        triage: 'hot_lead',
      })
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'hot-1',
          name: 'Hot One',
          isHot: true,
          relationshipTriage: 'hot_lead',
          triageReason: 'Inbound effort exceeds reciprocation',
          suggestedAction: 'Reply to their latest mention',
          triageSource: 'rules',
        }),
      ],
      hasMore: false,
    });
    expect(followers).not.toHaveBeenCalled();
    expect(
      (service as any)._channelInteractionRepository.getAudienceHot
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        integrationId: 'channel-a',
        direction: 'asc',
        limit: 24,
      })
    );
    expect(
      (service as any)._channelInteractionRepository.getAudienceFollowers
    ).not.toHaveBeenCalled();
  });

  it('returns hot followers from the hot audience page', async () => {
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        followerSorts: [{
          key: 'recent',
          label: 'Recent',
          directions: ['desc'],
          defaultDirection: 'desc',
        }],
      },
    });
    (
      service as any
    )._channelInteractionRepository.getAudienceHot.mockResolvedValue({
      items: [
        {
          externalId: 'hot-1',
          name: 'Hot One',
          username: 'hotone',
          picture: null,
          profileUrl: null,
          bio: null,
          followersCount: null,
          followingCount: null,
          followedAt: null,
          accountCreatedAt: null,
          finalRank: 1,
          rulesRank: 1,
          hotReason: 'Strong inbound engagement',
          suggestedAction: null,
          hotSource: 'rules',
        },
      ],
      hasMore: false,
      source: 'materialized',
      hour: '2026-08-25T14',
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        audience: 'hot',
      })
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'hot-1',
          isHot: true,
          triageReason: 'Strong inbound engagement',
        }),
      ],
      hasMore: false,
    });
    expect(
      (service as any)._channelInteractionRepository.getAudienceHot
    ).toHaveBeenCalled();
    expect(
      (service as any)._channelInteractionRepository.getAudienceFollowers
    ).not.toHaveBeenCalled();
  });

  it('returns an empty hot page when no materialized batch is available', async () => {
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        followerSorts: [{
          key: 'recent',
          label: 'Recent',
          directions: ['desc'],
          defaultDirection: 'desc',
        }],
      },
    });
    (
      service as any
    )._channelInteractionRepository.getAudienceHot.mockResolvedValue({
      items: [],
      hasMore: false,
      source: 'materialized',
      hour: null,
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        audience: 'hot',
      })
    ).resolves.toEqual({
      items: [],
      hasMore: false,
    });
    expect(
      (service as any)._channelInteractionRepository.getAudienceFollowers
    ).not.toHaveBeenCalled();
  });

  it('rejects incompatible hot sorting and interaction windows', async () => {
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        followerSorts: [{
          key: 'net_gap',
          label: 'Net effort gap',
          directions: ['desc'],
          defaultDirection: 'desc',
          scope: 'database',
        }],
      },
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        audience: 'hot',
        sort: 'net_gap',
        direction: 'desc',
      })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        audience: 'hot',
        window: 'month',
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (service as any)._channelInteractionRepository.getAudienceHot
    ).not.toHaveBeenCalled();
  });

  it('rejects a tampered hot cursor hour', async () => {
    const cursor = `follower-hot:v1:${Buffer.from(JSON.stringify({
      version: 1,
      organizationId: 'org-a',
      integrationId: 'channel-a',
      direction: 'asc',
      audience: 'hot',
      hour: '2099-01-01T00',
      finalRank: 1,
      externalId: 'hot-1',
    })).toString('base64url')}`;
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        followerSorts: [{
          key: 'recent',
          label: 'Recent',
          directions: ['desc'],
          defaultDirection: 'desc',
        }],
      },
    });
    (
      service as any
    )._channelInteractionRepository.getAudienceHot.mockResolvedValue({
      items: [],
      hasMore: false,
      source: 'materialized',
      hour: null,
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        audience: 'hot',
        cursor,
      })
    ).resolves.toEqual({ items: [], hasMore: false });
    expect(
      (service as any)._channelInteractionRepository.getAudienceHot
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        hour: '2099-01-01T00',
        cursor: { finalRank: 1, externalId: 'hot-1' },
      })
    );
  });

  it('returns empty hot page when replaying a stale cursor hour', async () => {
    const cursor = `follower-hot:v1:${Buffer.from(JSON.stringify({
      version: 1,
      organizationId: 'org-a',
      integrationId: 'channel-a',
      direction: 'asc',
      audience: 'hot',
      hour: '2020-01-01T00',
      finalRank: 1,
      externalId: 'hot-1',
    })).toString('base64url')}`;
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        followerSorts: [{
          key: 'recent',
          label: 'Recent',
          directions: ['desc'],
          defaultDirection: 'desc',
        }],
      },
    });
    (
      service as any
    )._channelInteractionRepository.getAudienceHot.mockResolvedValue({
      items: [],
      hasMore: false,
      source: 'materialized',
      hour: null,
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        audience: 'hot',
        cursor,
      })
    ).resolves.toEqual({ items: [], hasMore: false });
    expect(
      (service as any)._channelInteractionRepository.getAudienceHot
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        hour: '2020-01-01T00',
        cursor: { finalRank: 1, externalId: 'hot-1' },
      })
    );
    expect(
      (service as any)._channelInteractionRepository.getAudienceFollowers
    ).not.toHaveBeenCalled();
  });

  it('routes a triage filter through the complete synced audience', async () => {
    const followers = jest.fn();
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [{
          key: 'recent',
          label: 'Recent',
          directions: ['desc'],
          defaultDirection: 'desc',
        }],
      },
    });
    (
      service as any
    )._channelInteractionRepository.getAudienceFollowers.mockResolvedValue({
      items: [],
      hasMore: false,
    });

    await service.getFollowers(org, user, 'channel-a', {
      limit: 24,
      sort: 'recent',
      direction: 'desc',
      triage: 'mutual',
    });

    expect(followers).not.toHaveBeenCalled();
    expect(
      (service as any)._channelInteractionRepository.getAudienceFollowers
    ).toHaveBeenCalledWith(
      expect.objectContaining({ triage: 'mutual' })
    );
  });

  it('routes a custom list filter through the complete synced audience', async () => {
    const followers = jest.fn();
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [{
          key: 'recent',
          label: 'Recent',
          directions: ['desc'],
          defaultDirection: 'desc',
        }],
      },
    });
    (
      service as any
    )._channelInteractionRepository.getAudienceFollowers.mockResolvedValue({
      items: [],
      hasMore: false,
    });

    await service.getFollowers(org, user, 'channel-a', {
      limit: 24,
      sort: 'recent',
      direction: 'desc',
      listId: 'list-1',
    });

    expect(followers).not.toHaveBeenCalled();
    expect(
      (service as any)._channelInteractionRepository.getAudienceFollowers
    ).toHaveBeenCalledWith(
      expect.objectContaining({ listId: 'list-1' })
    );
  });

  it('keeps custom list memberships on mapped follower cards', async () => {
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        followerSorts: [{
          key: 'recent',
          label: 'Recent',
          directions: ['desc'],
          defaultDirection: 'desc',
        }],
      },
    });
    (
      service as any
    )._channelInteractionRepository.getAudienceFollowers.mockResolvedValue({
      items: [
        {
          externalId: 'follower-a',
          name: 'Follower A',
          username: null,
          picture: null,
          profileUrl: null,
          bio: null,
          followersCount: null,
          followingCount: null,
          followedAt: null,
          accountCreatedAt: null,
          noteCount: 0,
          likesCount: 0,
          listMemberships: [{ listId: 'list-1' }],
        },
      ],
      hasMore: false,
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'recent',
        direction: 'desc',
        listId: 'list-1',
      })
    ).resolves.toMatchObject({
      items: [{ id: 'follower-a', listIds: ['list-1'] }],
    });
  });

  it('rejects combining a list filter with triage', async () => {
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        followerSorts: [{
          key: 'recent',
          label: 'Recent',
          directions: ['desc'],
          defaultDirection: 'desc',
        }],
      },
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        listId: 'list-1',
        triage: 'hot_lead',
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('routes the lead audience through non-follower inbound members', async () => {
    const followers = jest.fn();
    const service = createService([integration], {
      supported: {
        followers,
        followerSorts: [{
          key: 'recent',
          label: 'Recent',
          directions: ['desc'],
          defaultDirection: 'desc',
        }],
      },
    });
    (
      service as any
    )._channelInteractionRepository.getAudienceLeads.mockResolvedValue({
      items: [
        {
          externalId: 'lead-1',
          name: 'Lead One',
          username: null,
          picture: null,
          profileUrl: null,
          bio: null,
          followersCount: null,
          followingCount: null,
          followedAt: null,
          accountCreatedAt: null,
          inboundInteractionCount: 2,
          lastInboundAt: new Date('2026-08-14T12:00:00.000Z'),
          leadBridgeScore: 4.2,
          leadFitScore: 77,
          leadFitReason: 'Matches tech audience',
          leadBridgesAsLead: [
            {
              bridgeExternalId: 'warm-1',
              bridgeRelationshipGrade: 4.2,
              bridgeMember: { username: 'warmbridge', name: 'Warm' },
            },
          ],
        },
      ],
      hasMore: false,
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        audience: 'lead',
      })
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'lead-1',
          name: 'Lead One',
          interactionCount: 2,
          lastInteractionAt: '2026-08-14T12:00:00.000Z',
          isLead: true,
          leadBridgeScore: 4.2,
          leadFitScore: 77,
          leadFitReason: 'Matches tech audience',
          leadBridges: [
            {
              externalId: 'warm-1',
              username: 'warmbridge',
              grade: 4.2,
            },
          ],
        }),
      ],
      hasMore: false,
    });
    expect(followers).not.toHaveBeenCalled();
    expect(
      (service as any)._channelInteractionRepository.getAudienceLeads
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        integrationId: 'channel-a',
        direction: 'desc',
        limit: 24,
        ignoredVisibility: 'exclude',
      })
    );
    expect(
      (service as any)._channelInteractionRepository.getAudienceFollowers
    ).not.toHaveBeenCalled();
  });

  it('hides Hot triage on lead audience members who are not followers', async () => {
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        followerSorts: [{
          key: 'recent',
          label: 'Recent',
          directions: ['desc'],
          defaultDirection: 'desc',
        }],
      },
    });
    (
      service as any
    )._channelInteractionRepository.getAudienceLeads.mockResolvedValue({
      items: [
        {
          externalId: 'lead-hot',
          name: 'Lead Hot',
          username: 'leadhot',
          picture: null,
          profileUrl: null,
          bio: null,
          followersCount: null,
          followingCount: null,
          followedAt: null,
          accountCreatedAt: null,
          membershipState: 'NOT_FOLLOWER',
          inboundInteractionCount: 3,
          lastInboundAt: new Date('2026-08-14T12:00:00.000Z'),
          relationshipEffortScore: 0,
          relationshipReciprocationScore: 12,
          relationshipNetGap: 12,
          relationshipTriage: 'hot_lead',
          relationshipFormulaVersion: 4,
          relationshipSnapshotAt: new Date('2026-08-14T12:00:00.000Z'),
          leadBridgeScore: null,
          leadFitScore: null,
          leadBridgesAsLead: [],
        },
      ],
      hasMore: false,
    });

    const page = await service.getFollowers(org, user, 'channel-a', {
      limit: 24,
      audience: 'lead',
    });
    expect(page.items).toEqual([
      expect.objectContaining({
        id: 'lead-hot',
        isLead: true,
        effortScore: 0,
        reciprocationScore: 12,
      }),
    ]);
    expect(page.items[0]?.relationshipTriage).toBeUndefined();
  });

  it('returns cultivate followers from the cultivate audience page', async () => {
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        followerSorts: [{
          key: 'recent',
          label: 'Recent',
          directions: ['desc'],
          defaultDirection: 'desc',
        }],
      },
    });
    (
      service as any
    )._channelInteractionRepository.getAudienceCultivate.mockResolvedValue({
      items: [
        {
          externalId: 'warm-1',
          name: 'Warm One',
          username: 'warmone',
          picture: null,
          profileUrl: null,
          bio: null,
          followersCount: null,
          followingCount: null,
          followedAt: null,
          accountCreatedAt: null,
          finalRank: 1,
          rulesRank: 1,
          cultivateReason: 'No outbound attention in 20 days · mutual relationship',
          suggestedAction: null,
          cultivateSource: 'rules',
        },
      ],
      hasMore: false,
      source: 'materialized',
      hour: '2026-08-21T12',
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        audience: 'cultivate',
      })
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'warm-1',
          name: 'Warm One',
          isCultivate: true,
          cultivateReason:
            'No outbound attention in 20 days · mutual relationship',
        }),
      ],
      hasMore: false,
    });
    expect(
      (service as any)._channelInteractionRepository.getAudienceCultivate
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        integrationId: 'channel-a',
        direction: 'asc',
        limit: 24,
      })
    );
  });

  it('returns ignored followers from the ignored audience page', async () => {
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        followerSorts: [{
          key: 'recent',
          label: 'Recent',
          directions: ['desc'],
          defaultDirection: 'desc',
        }],
      },
    });
    (
      service as any
    )._channelInteractionRepository.getIgnoredAudienceFollowers.mockResolvedValue({
      items: [
        {
          externalId: 'ignored-1',
          name: 'Ignored One',
          username: null,
          picture: null,
          profileUrl: null,
          bio: null,
          followersCount: null,
          followingCount: null,
          followedAt: null,
          accountCreatedAt: null,
          ignoredAt: new Date('2026-08-18T12:00:00.000Z'),
          listMemberships: [],
          personalGrades: [],
          triageIgnores: [],
        },
      ],
      hasMore: false,
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        audience: 'ignored',
      })
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'ignored-1',
          name: 'Ignored One',
          isIgnored: true,
        }),
      ],
      hasMore: false,
    });
    expect(
      (service as any)._channelInteractionRepository.getIgnoredAudienceFollowers
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        integrationId: 'channel-a',
        direction: 'desc',
        limit: 24,
      })
    );
  });

  it('rejects combining lead audience with a triage filter', async () => {
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        followerSorts: [{
          key: 'recent',
          label: 'Recent',
          directions: ['desc'],
          defaultDirection: 'desc',
        }],
      },
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        audience: 'lead',
        triage: 'hot_lead',
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects replaying a lead cursor under a follower triage filter', async () => {
    const cursor = `follower-lead:v3:${Buffer.from(JSON.stringify({
      version: 3,
      organizationId: 'org-a',
      integrationId: 'channel-a',
      direction: 'desc',
      audience: 'lead',
      leadFitScore: 88,
      leadBridgeScore: 4,
      lastInboundAt: '2026-08-14T12:00:00.000Z',
      externalId: 'lead-1',
    })).toString('base64url')}`;
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        followerSorts: [{
          key: 'recent',
          label: 'Recent',
          directions: ['desc'],
          defaultDirection: 'desc',
        }],
      },
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'recent',
        direction: 'desc',
        triage: 'hot_lead',
        cursor,
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('maps projected effort metadata from their-effort sorting', async () => {
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        followerSorts: [],
        channelInteractionWebhooks: {
          getInteractionCoverage: (): any[] => [],
        },
      },
    });
    (
      service as any
    )._channelInteractionRepository.getFollowersByProjectedField.mockResolvedValue({
      items: [{
        externalId: 'follower-a',
        name: 'Follower A',
        username: null,
        picture: null,
        profileUrl: null,
        bio: null,
        followersCount: null,
        followingCount: null,
        followedAt: null,
        accountCreatedAt: null,
        noteCount: 0,
        likesCount: 0,
        relationshipGrade: 4,
        relationshipEffortScore: 4,
        relationshipReciprocationScore: 12,
        relationshipNetGap: 8,
        relationshipTriage: 'hot_lead',
        relationshipFormulaVersion: 2,
        relationshipSnapshotAt: new Date('2026-08-12T12:00:00.000Z'),
        membershipState: 'FOLLOWER',
        personalGrades: [],
      }],
      hasMore: false,
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'their_effort',
        direction: 'desc',
      })
    ).resolves.toMatchObject({
      items: [{
        effortScore: 4,
        reciprocationScore: 12,
        netGap: 8,
        effortStars: 1.5,
        reciprocationStars: 2,
        relationshipTriage: 'hot_lead',
        relationshipFormulaVersion: 2,
        relationshipSnapshotAt: '2026-08-12T12:00:00.000Z',
      }],
    });
  });

  it('hides ignored triage badges on projected follower pages', async () => {
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        followerSorts: [],
        channelInteractionWebhooks: {
          getInteractionCoverage: (): any[] => [],
        },
      },
    });
    (
      service as any
    )._channelInteractionRepository.getFollowersByProjectedField.mockResolvedValue({
      items: [{
        externalId: 'follower-a',
        name: 'Follower A',
        username: null,
        picture: null,
        profileUrl: null,
        bio: null,
        followersCount: null,
        followingCount: null,
        followedAt: null,
        accountCreatedAt: null,
        noteCount: 0,
        likesCount: 0,
        relationshipGrade: 4,
        relationshipEffortScore: 4,
        relationshipReciprocationScore: 12,
        relationshipNetGap: 8,
        relationshipTriage: 'hot_lead',
        relationshipFormulaVersion: 2,
        relationshipSnapshotAt: new Date('2026-08-12T12:00:00.000Z'),
        personalGrades: [],
        triageIgnores: [{ triage: 'hot_lead' }],
      }],
      hasMore: false,
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'their_effort',
        direction: 'desc',
      })
    ).resolves.toMatchObject({
      items: [{
        id: 'follower-a',
        effortScore: 4,
        reciprocationScore: 12,
        relationshipTriage: null,
      }],
    });
  });

  it('rejects replaying an audience cursor under another triage filter', async () => {
    const cursor = `follower-audience:v1:${Buffer.from(JSON.stringify({
      version: 1,
      organizationId: 'org-a',
      integrationId: 'channel-a',
      sort: 'recent',
      direction: 'desc',
      triage: 'hot_lead',
      sortField: 'followedAt',
      sortValue: null,
      externalId: 'follower-a',
    })).toString('base64url')}`;
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        followerSorts: [{
          key: 'recent',
          label: 'Recent',
          directions: ['desc'],
          defaultDirection: 'desc',
        }],
      },
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'recent',
        direction: 'desc',
        triage: 'mutual',
        cursor,
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects an audience cursor when search is missing', async () => {
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        followerSorts: [
          {
            key: 'recent',
            label: 'Recent',
            directions: ['desc'],
            defaultDirection: 'desc',
          },
        ],
      },
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        sort: 'recent',
        direction: 'desc',
        cursor: 'follower-audience:v1:abc',
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('lists recent followers from stored audience data', async () => {
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        channelInteractionWebhooks: {
          getInteractionCoverage: () => [
            { kind: 'follow', inbound: 'supported', outbound: 'supported' },
          ],
        },
      },
    });
    (
      service as any
    )._channelInteractionRepository.getRecentFollowers.mockResolvedValue({
      items: [
        {
          externalId: 'follower-a',
          name: 'Alice',
          username: 'alice',
          picture: null,
          profileUrl: null,
          bio: null,
          followersCount: null,
          followingCount: null,
          followedAt: new Date('2026-08-20T12:00:00.000Z'),
          accountCreatedAt: null,
          inboundInteractionCount: 2,
          lastInboundAt: new Date('2026-08-21T12:00:00.000Z'),
          lastOutboundAt: null,
          noteCount: 0,
          likesCount: 0,
          relationshipEffortScore: 0,
          relationshipReciprocationScore: 4,
          relationshipNetGap: 4,
          relationshipTriage: null,
          relationshipGrade: null,
          relationshipFormulaVersion: null,
          relationshipSnapshotAt: null,
          triageIgnores: [],
        },
      ],
      hasMore: false,
    });
    (
      service as any
    )._channelInteractionRepository.getInteractionTracking.mockResolvedValue({
      followerSync: {
        activeGeneration: 'gen-1',
        status: 'COMPLETE',
        completedAt: new Date('2026-08-15T16:00:00.000Z'),
      },
      subscriptions: [{ state: 'ACTIVE' }],
    });

    await expect(
      service.getRecentFollowers(org, user, 'channel-a', {
        sinceDays: 30,
        limit: 20,
      })
    ).resolves.toMatchObject({
      items: [
        {
          id: 'follower-a',
          username: 'alice',
          followedAt: '2026-08-20T12:00:00.000Z',
          lastInboundAt: '2026-08-21T12:00:00.000Z',
          relationshipTriage: 'hot_lead',
        },
      ],
      hasMore: false,
      tracking: expect.objectContaining({ state: 'active' }),
    });
    expect(
      (service as any)._channelInteractionRepository.getRecentFollowers
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        integrationId: 'channel-a',
        userId: 'user-a',
        limit: 20,
      })
    );
  });

  it('filters recent followers without outbound since follow in the service layer', async () => {
    const service = createService([integration], {
      supported: { followers: jest.fn() },
    });
    (
      service as any
    )._channelInteractionRepository.getRecentFollowers.mockResolvedValue({
      items: [
        {
          externalId: 'replied',
          name: 'Replied',
          username: 'replied',
          picture: null,
          profileUrl: null,
          bio: null,
          followersCount: null,
          followingCount: null,
          followedAt: new Date('2026-08-20T12:00:00.000Z'),
          accountCreatedAt: null,
          lastOutboundAt: new Date('2026-08-21T12:00:00.000Z'),
          lastInboundAt: null,
          inboundInteractionCount: 0,
          noteCount: 0,
          likesCount: 0,
          triageIgnores: [],
        },
        {
          externalId: 'waiting',
          name: 'Waiting',
          username: 'waiting',
          picture: null,
          profileUrl: null,
          bio: null,
          followersCount: null,
          followingCount: null,
          followedAt: new Date('2026-08-19T12:00:00.000Z'),
          accountCreatedAt: null,
          lastOutboundAt: null,
          lastInboundAt: null,
          inboundInteractionCount: 0,
          noteCount: 0,
          likesCount: 0,
          triageIgnores: [],
        },
      ],
      hasMore: false,
    });

    await expect(
      service.getRecentFollowers(org, user, 'channel-a', {
        withoutOutboundSinceFollow: true,
        limit: 20,
      })
    ).resolves.toMatchObject({
      items: [{ id: 'waiting', username: 'waiting' }],
      hasMore: false,
    });
  });

  it('exposes canFollowAudienceMember from provider capability', async () => {
    const followers = jest
      .fn()
      .mockResolvedValue({ items: [{ id: 'follower-1' }], hasMore: false });
    const service = createService([integration], {
      supported: {
        followers,
        followAudienceMember: jest.fn(),
      },
    });

    await expect(service.getFollowerChannels(org)).resolves.toEqual([
      expect.objectContaining({
        id: 'channel-a',
        canFollowAudienceMember: true,
      }),
    ]);
  });

  it('rejects follow when the provider does not support followAudienceMember', async () => {
    const service = createService([integration], {
      supported: { followers: jest.fn() },
    });

    await expect(
      service.followFollowerMember(org, 'channel-a', 'user-1')
    ).rejects.toMatchObject({ status: 400 });
  });

  it('follows through the provider and stamps weFollowedAt', async () => {
    const followAudienceMember = jest.fn().mockResolvedValue(undefined);
    const service = createService([integration], {
      supported: { followers: jest.fn(), followAudienceMember },
    });
    (
      service as any
    )._channelInteractionService.markAudienceMemberFollowed.mockResolvedValue({
      weFollowedAt: '2026-08-20T12:00:00.000Z',
    });

    await expect(
      service.followFollowerMember(org, 'channel-a', 'user-1')
    ).resolves.toEqual({
      weFollowedAt: '2026-08-20T12:00:00.000Z',
    });
    expect(followAudienceMember).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'channel-a' }),
      'token',
      'user-1'
    );
    expect(
      (service as any)._channelInteractionService.markAudienceMemberFollowed
    ).toHaveBeenCalledWith('org-a', 'channel-a', 'user-1');
  });

  it('rejects unfollow when the provider does not support unfollowAudienceMember', async () => {
    const service = createService([integration], {
      supported: { followers: jest.fn(), followAudienceMember: jest.fn() },
    });

    await expect(
      service.unfollowFollowerMember(org, 'channel-a', 'user-1')
    ).rejects.toMatchObject({ status: 400 });
  });

  it('unfollows through the provider and clears weFollowedAt', async () => {
    const unfollowAudienceMember = jest.fn().mockResolvedValue(undefined);
    const service = createService([integration], {
      supported: {
        followers: jest.fn(),
        followAudienceMember: jest.fn(),
        unfollowAudienceMember,
      },
    });
    (
      service as any
    )._channelInteractionService.markAudienceMemberUnfollowed.mockResolvedValue({
      unfollowedAt: '2026-08-20T12:00:00.000Z',
    });

    await expect(
      service.unfollowFollowerMember(org, 'channel-a', 'user-1')
    ).resolves.toEqual({
      unfollowedAt: '2026-08-20T12:00:00.000Z',
    });
    expect(unfollowAudienceMember).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'channel-a' }),
      'token',
      'user-1'
    );
    expect(
      (service as any)._channelInteractionService.markAudienceMemberUnfollowed
    ).toHaveBeenCalledWith('org-a', 'channel-a', 'user-1');
  });

  it('routes the followed audience through weFollowedAt members', async () => {
    const followers = jest.fn();
    const service = createService([integration], {
      supported: { followers },
    });
    (
      service as any
    )._channelInteractionRepository.getAudienceFollowed.mockResolvedValue({
      items: [
        {
          externalId: 'followed-1',
          name: 'Followed One',
          username: 'followed',
          picture: null,
          profileUrl: null,
          bio: null,
          followersCount: null,
          followingCount: null,
          followedAt: null,
          weFollowedAt: new Date('2026-08-20T12:00:00.000Z'),
          accountCreatedAt: null,
        },
      ],
      hasMore: false,
    });

    await expect(
      service.getFollowers(org, user, 'channel-a', {
        limit: 24,
        audience: 'followed',
      })
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'followed-1',
          name: 'Followed One',
          weFollowedAt: '2026-08-20T12:00:00.000Z',
          isFollowed: true,
        }),
      ],
      hasMore: false,
    });
    expect(followers).not.toHaveBeenCalled();
    expect(
      (service as any)._channelInteractionRepository.getAudienceFollowed
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        integrationId: 'channel-a',
        direction: 'desc',
        limit: 24,
        ignoredVisibility: 'exclude',
      })
    );
  });
});
