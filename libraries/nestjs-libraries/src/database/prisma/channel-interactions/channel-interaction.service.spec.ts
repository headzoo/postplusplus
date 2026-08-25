import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import {
  applyPersonalRelationshipGrade,
  calculateBotGrade,
  calculateRelationshipGrade,
  ChannelInteractionService,
  getChannelInteractionScore,
  getRelationshipTriage,
  scoreToStars,
} from './channel-interaction.service';
import { calculateRelationshipGrade as calculateStrategyGrade } from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.scoring';
import { getChannelStrategy } from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.registry';
import { ChannelStrategyId } from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.types';
import { growAudienceStrategy } from '@gitroom/nestjs-libraries/channel-strategies/strategies/grow-audience.strategy';

jest.mock(
  '@gitroom/nestjs-libraries/integrations/integration.manager',
  () => ({ IntegrationManager: class IntegrationManager { } })
);

jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    scan: jest.fn().mockResolvedValue(['0', []]),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  },
}));

const growStrategy = {
  strategyId: 'grow_audience' as const,
  strategyVersion: 1,
};

const interactionCounts = (
  overrides: Record<string, { inbound?: number; outbound?: number }> = {}
) => ({
  like: { inbound: 0, outbound: 0 },
  mention: { inbound: 0, outbound: 0 },
  repost: { inbound: 0, outbound: 0 },
  reply: { inbound: 0, outbound: 0 },
  follow: { inbound: 0, outbound: 0 },
  ...Object.fromEntries(
    Object.entries(overrides).map(([kind, value]) => [
      kind,
      { inbound: 0, outbound: 0, ...value },
    ])
  ),
});

const strategyGrade = (
  strategyId: ChannelStrategyId,
  effortScore: number,
  reciprocationScore: number
) => {
  const strategy = getChannelStrategy(strategyId);
  return calculateStrategyGrade(
    { effortScore, reciprocationScore },
    strategy.id,
    strategy.version,
    strategy.getScoringProfile()
  );
};

const growGrade = (effortScore: number, reciprocationScore: number) =>
  strategyGrade('grow_audience', effortScore, reciprocationScore);

const interaction = (overrides: Record<string, any> = {}) => ({
  providerEventKey: 'provider-event-1',
  kind: 'like',
  direction: 'inbound',
  eventAt: '2026-08-12T12:00:00.000Z',
  counterparty: {
    externalId: 'person-1',
    name: 'Person',
    profileUrl: 'https://social.example/person-1',
  },
  eventType: 'like.create',
  normalizationVersion: 1,
  ...overrides,
});

const createRepository = () => ({
  recordNormalizedEvent: jest.fn().mockResolvedValue({ created: true }),
  recordPolledInboundLike: jest.fn().mockResolvedValue({ created: true }),
  applyMembershipUpdate: jest.fn().mockResolvedValue({}),
  beginFollowerSync: jest.fn().mockResolvedValue(undefined),
  applyFollowerSyncPage: jest.fn().mockResolvedValue(true),
  completeFollowerSync: jest.fn().mockResolvedValue(true),
  failFollowerSync: jest.fn().mockResolvedValue(true),
  getAudienceBotScoreInputs: jest.fn().mockResolvedValue(new Map()),
  getDueBotScoreBatch: jest.fn().mockResolvedValue({ members: [] }),
  updateBotScoreProjections: jest.fn().mockResolvedValue({ count: 0 }),
  hasDueBotScoreMembers: jest.fn().mockResolvedValue(false),
  listDueBotScoreCandidates: jest.fn().mockResolvedValue({ candidates: [] }),
  rebuildWindowSummary: jest.fn().mockResolvedValue({ itemCount: 0 }),
  getActiveIntegrationsForAccount: jest.fn().mockResolvedValue([]),
  getActiveIntegrationsForProvider: jest.fn().mockResolvedValue([]),
  requestSubscriptionReconciliation: jest.fn().mockResolvedValue(undefined),
  markSubscriptionsForRemoval: jest.fn().mockResolvedValue({ count: 0 }),
  getInteractionAuthorization: jest.fn().mockResolvedValue(null),
  saveInteractionAuthorization: jest.fn().mockResolvedValue({}),
  getDueRelationshipGradeBatch: jest.fn().mockResolvedValue({
    members: [],
    strategy: growStrategy,
  }),
  createRelationshipGradeSnapshots: jest.fn().mockResolvedValue({ count: 0 }),
  hasDueRelationshipGradeMembers: jest.fn().mockResolvedValue(false),
  getRelationshipScoresForMembers: jest.fn().mockResolvedValue({
    members: [],
    strategy: growStrategy,
  }),
  getCurrentRelationshipProjection: jest.fn().mockResolvedValue(null),
  updateCurrentRelationshipProjections: jest.fn().mockResolvedValue({ count: 0 }),
  upsertAudienceMemberGrade: jest.fn().mockResolvedValue({
    grade: 4.5,
    relationshipGrade: 4,
  }),
  addAudienceTriageIgnore: jest.fn().mockResolvedValue({ ok: true }),
  removeAudienceListMembers: jest.fn().mockResolvedValue({
    ok: true,
    removed: [],
    remaining: 0,
    hasMore: false,
  }),
  listCultivateCandidates: jest.fn().mockResolvedValue([]),
  rankCultivateCandidates: jest.fn().mockReturnValue([]),
  upsertCultivatePicks: jest.fn().mockResolvedValue({ count: 0 }),
  countVisibleHotPicks: jest.fn().mockResolvedValue(0),
  listHotRefreshExternalIds: jest.fn().mockResolvedValue([]),
  listHotRulesCandidates: jest.fn().mockResolvedValue([]),
  replaceHotPickBatch: jest.fn().mockResolvedValue({ count: 0 }),
  listUnscoredLeadExternalIds: jest.fn().mockResolvedValue([]),
  listUnscoredLeadCandidatesForIntegration: jest.fn().mockResolvedValue([]),
  listLeadFitFeedbackExamples: jest.fn().mockResolvedValue({
    rejected: [],
    accepted: [],
  }),
  updateAudienceLeadFit: jest.fn().mockResolvedValue({ count: 0 }),
  getStoredFollowerAudienceCounts: jest.fn().mockResolvedValue({
    categories: {},
    lists: [],
    listsTruncated: false,
  }),
});

describe('ChannelInteractionService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-12T12:05:00.000Z'));
  });

  afterEach(() => jest.useRealTimers());

  it('delegates bounded stored audience counts to the repository', async () => {
    const repository = createRepository();
    const service = new ChannelInteractionService(repository as any);

    await expect(
      service.getStoredFollowerAudienceCounts('org', 'integration')
    ).resolves.toEqual({
      categories: {},
      lists: [],
      listsTruncated: false,
    });
    expect(repository.getStoredFollowerAudienceCounts).toHaveBeenCalledWith(
      'org',
      'integration',
      20
    );
  });

  it('uses the fixed provider-neutral score matrix', () => {
    expect(getChannelInteractionScore('like', 'inbound')).toBe(2);
    expect(getChannelInteractionScore('like', 'outbound')).toBe(1);
    expect(getChannelInteractionScore('mention', 'inbound')).toBe(4);
    expect(getChannelInteractionScore('mention', 'outbound')).toBe(2);
    expect(getChannelInteractionScore('repost', 'inbound')).toBe(6);
    expect(getChannelInteractionScore('repost', 'outbound')).toBe(3);
    expect(getChannelInteractionScore('reply', 'inbound')).toBe(8);
    expect(getChannelInteractionScore('reply', 'outbound')).toBe(4);
    expect(getChannelInteractionScore('follow', 'inbound')).toBe(10);
    expect(getChannelInteractionScore('follow', 'outbound')).toBe(5);
  });

  it.each([
    [0, 0, null, null],
    [0, 8, 0, 2],
    [8, 0, 0, 1],
    [8, 6, 0.75, 2],
    [10, 10, 1, 3],
    [0, 40, 0, 5],
    [40, 0, 0, 1],
    [20, 20, 1, 5],
    [80, 40, 0.5, 5],
  ])(
    'calculates formula-v4 relationship grade for effort %i and reciprocation %i',
    (effortScore, reciprocationScore, reciprocity, grade) => {
      expect(calculateRelationshipGrade(effortScore, reciprocationScore)).toEqual({
        reciprocity,
        grade,
        formulaVersion: 4,
      });
    }
  );

  it.each([
    [0, 1],
    [5, 1.5],
    [20, 3],
    [40, 5],
    [80, 5],
  ])('converts capped scores to half stars', (score, stars) => {
    expect(scoreToStars(score)).toBe(stars);
  });

  it.each([
    [0, 0, 'quiet'],
    [7, 7, 'quiet'],
    [0, 3, 'hot_lead'],
    [0, 8, 'hot_lead'],
    [4, 12, 'hot_lead'],
    [5, 9, 'mutual'],
    [8, 12, 'mutual'],
    [8, 0, 'over_invested'],
    [12, 8, 'over_invested'],
    [8, 8, 'mutual'],
  ])(
    'classifies relationship triage for effort %i and reciprocation %i',
    (effortScore, reciprocationScore, triage) => {
      expect(getRelationshipTriage(effortScore, reciprocationScore)).toBe(triage);
    }
  );

  it('rejects invalid relationship scores', () => {
    expect(() => calculateRelationshipGrade(-1, 0)).toThrow(RangeError);
    expect(() => calculateRelationshipGrade(0.5, 0)).toThrow(RangeError);
    expect(() => scoreToStars(-1)).toThrow(RangeError);
    expect(() => scoreToStars(0.5)).toThrow(RangeError);
  });

  it('skips inbound like sync when the provider has no postLikers', async () => {
    const repository = createRepository();
    const manager = {
      getSocialIntegration: jest.fn().mockReturnValue({}),
    };
    const service = new ChannelInteractionService(
      repository as any,
      manager as any
    );

    await expect(
      service.syncInboundLikesFromPosts(
        {
          id: 'integration',
          organizationId: 'org',
          providerIdentifier: 'x',
          token: 'token',
        } as any,
        ['tweet-1']
      )
    ).resolves.toEqual({ created: 0, duplicates: 0, skipped: true, rateLimited: false });

    expect(repository.recordPolledInboundLike).not.toHaveBeenCalled();
  });

  it('records polled inbound likes from postLikers', async () => {
    const repository = createRepository();
    repository.recordPolledInboundLike
      .mockResolvedValueOnce({ created: true })
      .mockResolvedValueOnce({ created: false });
    const postLikers = jest.fn().mockResolvedValue([
      {
        id: 'person-1',
        name: 'One',
        username: 'one',
        picture: 'https://example.com/1.jpg',
        profileUrl: 'https://x.com/one',
      },
      { id: 'person-2', name: 'Two', username: 'two' },
    ]);
    const manager = {
      getSocialIntegration: jest.fn().mockReturnValue({ postLikers }),
    };
    const service = new ChannelInteractionService(
      repository as any,
      manager as any
    );
    const syncedAt = new Date('2026-08-17T12:00:00.000Z');

    await expect(
      service.syncInboundLikesFromPosts(
        {
          id: 'integration',
          organizationId: 'org',
          providerIdentifier: 'x',
          token: 'token',
        } as any,
        ['tweet-1', 'tweet-1', 'missing', ''],
        syncedAt
      )
    ).resolves.toEqual({ created: 1, duplicates: 1, skipped: false });

    expect(postLikers).toHaveBeenCalledTimes(1);
    expect(postLikers).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'integration' }),
      'token',
      'tweet-1'
    );
    expect(repository.recordPolledInboundLike).toHaveBeenNthCalledWith(
      1,
      'org',
      'integration',
      'tweet-1',
      {
        externalId: 'person-1',
        name: 'One',
        username: 'one',
        picture: 'https://example.com/1.jpg',
        profileUrl: 'https://x.com/one',
      },
      syncedAt
    );
    expect(repository.recordPolledInboundLike).toHaveBeenNthCalledWith(
      2,
      'org',
      'integration',
      'tweet-1',
      {
        externalId: 'person-2',
        name: 'Two',
        username: 'two',
      },
      syncedAt
    );
  });

  it('keeps syncing inbound likes after a non-rate-limit liker error', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    try {
      const repository = createRepository();
      const postLikers = jest
        .fn()
        .mockRejectedValueOnce(new Error('not found'))
        .mockResolvedValueOnce([{ id: 'person-2', name: 'Two' }]);
      const manager = {
        getSocialIntegration: jest.fn().mockReturnValue({ postLikers }),
      };
      const service = new ChannelInteractionService(
        repository as any,
        manager as any
      );

      await expect(
        service.syncInboundLikesFromPosts(
          {
            id: 'integration',
            organizationId: 'org',
            providerIdentifier: 'x',
            token: 'token',
          } as any,
          ['tweet-1', 'tweet-2']
        )
      ).resolves.toEqual({ created: 1, duplicates: 0, skipped: false });

      expect(postLikers).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenCalledWith(
        'Failed to load likers for x post tweet-1: not found'
      );
      expect(log.mock.calls.every((call) => call.length === 1)).toBe(true);
    } finally {
      log.mockRestore();
    }
  });

  it('stops inbound like sync after a rate-limit error', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000_000_000);
    try {
      const repository = createRepository();
      const resetUnixSeconds = 1_000_000_900;
      const rateLimit = Object.assign(new Error('Request failed with code 429'), {
        code: 429,
        rateLimit: { limit: 75, remaining: 0, reset: resetUnixSeconds },
      });
      const postLikers = jest
        .fn()
        .mockRejectedValueOnce(rateLimit)
        .mockResolvedValueOnce([{ id: 'person-2', name: 'Two' }]);
      const manager = {
        getSocialIntegration: jest.fn().mockReturnValue({ postLikers }),
      };
      const service = new ChannelInteractionService(
        repository as any,
        manager as any
      );

      await expect(
        service.syncInboundLikesFromPosts(
          {
            id: 'integration',
            organizationId: 'org',
            providerIdentifier: 'x',
            token: 'token',
          } as any,
          ['tweet-1', 'tweet-2', 'tweet-3']
        )
      ).resolves.toEqual({
        created: 0,
        duplicates: 0,
        skipped: false,
        rateLimited: true,
      });

      expect(postLikers).toHaveBeenCalledTimes(1);
      expect(repository.recordPolledInboundLike).not.toHaveBeenCalled();
      expect(ioRedis.set).toHaveBeenCalledWith(
        'channel-interaction-liker-sync:integration',
        '1',
        'EX',
        900
      );
      expect(log).toHaveBeenCalledWith(
        `Rate limited loading likers for x; paused until ${new Date(
          resetUnixSeconds * 1000
        ).toISOString()}`
      );
      expect(log.mock.calls.flat()).not.toContain(rateLimit);
    } finally {
      nowSpy.mockRestore();
      log.mockRestore();
    }
  });

  it('skips inbound like sync while a rate-limit pause is active', async () => {
    (ioRedis.get as jest.Mock).mockResolvedValueOnce('1');
    const repository = createRepository();
    const postLikers = jest.fn().mockResolvedValue([{ id: 'person-1' }]);
    const manager = {
      getSocialIntegration: jest.fn().mockReturnValue({ postLikers }),
    };
    const service = new ChannelInteractionService(
      repository as any,
      manager as any
    );

    await expect(
      service.syncInboundLikesFromPosts(
        {
          id: 'integration',
          organizationId: 'org',
          providerIdentifier: 'x',
          token: 'token',
        } as any,
        ['tweet-1']
      )
    ).resolves.toEqual({
      created: 0,
      duplicates: 0,
      skipped: true,
      rateLimited: true,
    });

    expect(postLikers).not.toHaveBeenCalled();
    expect(repository.recordPolledInboundLike).not.toHaveBeenCalled();
  });

  it('skips a second inbound like sync after a rate-limit pause is set', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    try {
      const repository = createRepository();
      const rateLimit = Object.assign(new Error('Request failed with code 429'), {
        code: 429,
        rateLimit: { limit: 75, remaining: 0, reset: 1_787_237_965 },
      });
      const postLikers = jest.fn().mockRejectedValueOnce(rateLimit);
      const manager = {
        getSocialIntegration: jest.fn().mockReturnValue({ postLikers }),
      };
      const service = new ChannelInteractionService(
        repository as any,
        manager as any
      );
      const integration = {
        id: 'integration',
        organizationId: 'org',
        providerIdentifier: 'x',
        token: 'token',
      } as any;

      await expect(
        service.syncInboundLikesFromPosts(integration, ['tweet-1'])
      ).resolves.toEqual({
        created: 0,
        duplicates: 0,
        skipped: false,
        rateLimited: true,
      });

      (ioRedis.get as jest.Mock).mockResolvedValueOnce('1');

      await expect(
        service.syncInboundLikesFromPosts(integration, ['tweet-2'])
      ).resolves.toEqual({
        created: 0,
        duplicates: 0,
        skipped: true,
        rateLimited: true,
      });

      expect(postLikers).toHaveBeenCalledTimes(1);
      expect(ioRedis.set).toHaveBeenCalledWith(
        'channel-interaction-liker-sync:integration',
        '1',
        'EX',
        expect.any(Number)
      );
    } finally {
      log.mockRestore();
    }
  });

  it('applies a personal grade as a half-star offset around a 3-star neutral', () => {
    expect(applyPersonalRelationshipGrade(4, null)).toBe(4);
    expect(applyPersonalRelationshipGrade(4, 3)).toBe(4);
    expect(applyPersonalRelationshipGrade(4, 5)).toBe(5);
    expect(applyPersonalRelationshipGrade(4, 1)).toBe(2);
    expect(applyPersonalRelationshipGrade(3.5, 4.5)).toBe(5);
    expect(applyPersonalRelationshipGrade(null, 5)).toBe(5);
    expect(applyPersonalRelationshipGrade(null, null)).toBeNull();
    expect(() => applyPersonalRelationshipGrade(4, 2.25)).toThrow(RangeError);
  });

  it('creates zero-activity snapshots through the repository batch operation', async () => {
    const repository = createRepository();
    repository.getDueRelationshipGradeBatch.mockResolvedValue({
      strategy: growStrategy,
      members: [
        { externalId: 'quiet-follower', interactionCounts: interactionCounts() },
      ],
    });
    const service = new ChannelInteractionService(repository as any);
    const snapshotAt = new Date('2026-08-12T12:00:00.000Z');

    await expect(
      service.buildRelationshipGradeSnapshotBatch('org', 'integration', snapshotAt)
    ).resolves.toEqual({ snapshotAt, processed: 1, hasMore: false });
    expect(repository.createRelationshipGradeSnapshots).toHaveBeenCalledWith(
      'org',
      'integration',
      snapshotAt,
      [{
        externalId: 'quiet-follower',
        effortScore: 0,
        reciprocationScore: 0,
        ...growGrade(0, 0),
      }]
    );
  });

  it('scores a scheduled batch with the strategy selected for the channel', async () => {
    const repository = createRepository();
    repository.getDueRelationshipGradeBatch.mockResolvedValue({
      strategy: { strategyId: 'lead_capture', strategyVersion: 1 },
      members: [
        {
          externalId: 'person-1',
          interactionCounts: interactionCounts({ reply: { inbound: 1 } }),
        },
      ],
    });
    const service = new ChannelInteractionService(repository as any);
    const snapshotAt = new Date('2026-08-12T12:00:00.000Z');

    await service.buildRelationshipGradeSnapshotBatch(
      'org',
      'integration',
      snapshotAt
    );

    const [snapshot] =
      repository.createRelationshipGradeSnapshots.mock.calls[0][3];
    const leadWeight = getChannelStrategy('lead_capture').getScoringProfile()
      .interactionWeights.reply.inbound;
    expect(snapshot).toEqual({
      externalId: 'person-1',
      effortScore: 0,
      reciprocationScore: leadWeight,
      ...strategyGrade('lead_capture', 0, leadWeight),
    });
    expect(snapshot.strategyId).toBe('lead_capture');
    expect(snapshot.strategyVersion).toBe(1);
  });

  it('resolves the strategy and scoring profile once for a whole batch', async () => {
    const repository = createRepository();
    repository.getDueRelationshipGradeBatch.mockResolvedValue({
      strategy: growStrategy,
      members: ['a', 'b', 'c'].map((externalId) => ({
        externalId,
        interactionCounts: interactionCounts({ like: { inbound: 2 } }),
      })),
    });
    const profileSpy = jest.spyOn(growAudienceStrategy, 'getScoringProfile');
    const service = new ChannelInteractionService(repository as any);

    await service.buildRelationshipGradeSnapshotBatch(
      'org',
      'integration',
      new Date('2026-08-12T12:00:00.000Z')
    );

    expect(repository.createRelationshipGradeSnapshots.mock.calls[0][3]).toHaveLength(3);
    expect(profileSpy).toHaveBeenCalledTimes(1);
    profileSpy.mockRestore();
  });

  it('falls back to grow audience when a channel stores an unknown strategy', async () => {
    const repository = createRepository();
    repository.getDueRelationshipGradeBatch.mockResolvedValue({
      strategy: { strategyId: 'retired_strategy', strategyVersion: 9 },
      members: [
        {
          externalId: 'person-1',
          interactionCounts: interactionCounts({ follow: { inbound: 1 } }),
        },
      ],
    });
    const service = new ChannelInteractionService(repository as any);

    await service.buildRelationshipGradeSnapshotBatch(
      'org',
      'integration',
      new Date('2026-08-12T12:00:00.000Z')
    );

    expect(
      repository.createRelationshipGradeSnapshots.mock.calls[0][3][0]
    ).toEqual({
      externalId: 'person-1',
      effortScore: 0,
      reciprocationScore: 10,
      ...growGrade(0, 10),
    });
  });

  it('records normalized events and reports duplicate deliveries', async () => {
    const repository = createRepository();
    repository.recordNormalizedEvent
      .mockResolvedValueOnce({ created: true })
      .mockResolvedValueOnce({ created: false });
    const service = new ChannelInteractionService(repository as any);

    const result = await service.recordNormalizedDelivery('org', 'integration', [
      interaction(),
      interaction({ providerEventKey: 'provider-event-2' }),
    ] as any);

    expect(result).toEqual({ created: 1, duplicates: 1, membershipOnly: 0 });
    expect(repository.recordNormalizedEvent).toHaveBeenNthCalledWith(
      1,
      'org',
      'integration',
      expect.objectContaining({
        kind: 'LIKE',
        direction: 'INBOUND',
        score: 2,
      })
    );
  });

  it('refreshes unique counterparties after newly created webhook events', async () => {
    const repository = createRepository();
    repository.getRelationshipScoresForMembers.mockResolvedValue({
      strategy: growStrategy,
      members: [
        {
          externalId: 'person-1',
          interactionCounts: interactionCounts({
            reply: { outbound: 1 },
            like: { inbound: 1 },
          }),
        },
      ],
    });
    const service = new ChannelInteractionService(repository as any);

    await service.recordNormalizedDelivery('org', 'integration', [
      interaction(),
      interaction({
        providerEventKey: 'provider-event-2',
        kind: 'reply',
        direction: 'outbound',
      }),
    ] as any);

    expect(repository.getRelationshipScoresForMembers).toHaveBeenCalledWith(
      'org',
      'integration',
      ['person-1'],
      new Date('2026-08-12T12:05:00.000Z')
    );
    expect(repository.updateCurrentRelationshipProjections).toHaveBeenCalledWith(
      'org',
      'integration',
      new Date('2026-08-12T12:05:00.000Z'),
      [{
        externalId: 'person-1',
        effortScore: 4,
        reciprocationScore: 2,
        ...growGrade(4, 2),
      }]
    );
  });

  it('writes live webhook refreshes with the newly selected strategy', async () => {
    const repository = createRepository();
    repository.getRelationshipScoresForMembers.mockResolvedValue({
      strategy: { strategyId: 'customer_support', strategyVersion: 1 },
      members: [
        {
          externalId: 'person-1',
          interactionCounts: interactionCounts({ reply: { inbound: 1 } }),
        },
      ],
    });
    const service = new ChannelInteractionService(repository as any);

    await service.recordNormalizedDelivery('org', 'integration', [
      interaction(),
    ] as any);

    const [projection] =
      repository.updateCurrentRelationshipProjections.mock.calls[0][3];
    expect(projection.strategyId).toBe('customer_support');
    expect(projection.strategyVersion).toBe(1);
    expect(projection.reciprocationScore).toBe(
      getChannelStrategy('customer_support').getScoringProfile()
        .interactionWeights.reply.inbound
    );
  });

  it('does not refresh relationship projections for duplicate-only deliveries', async () => {
    const repository = createRepository();
    repository.recordNormalizedEvent.mockResolvedValue({ created: false });
    const service = new ChannelInteractionService(repository as any);

    await service.recordNormalizedDelivery('org', 'integration', [
      interaction(),
    ] as any);

    expect(repository.getRelationshipScoresForMembers).not.toHaveBeenCalled();
    expect(repository.updateCurrentRelationshipProjections).not.toHaveBeenCalled();
  });

  it('does not refresh relationship projections for unfollow-only deliveries', async () => {
    const repository = createRepository();
    const service = new ChannelInteractionService(repository as any);

    await service.recordNormalizedDelivery('org', 'integration', [
      interaction({
        kind: 'follow',
        membershipUpdate: 'not_follower',
      }),
    ] as any);

    expect(repository.getRelationshipScoresForMembers).not.toHaveBeenCalled();
    expect(repository.updateCurrentRelationshipProjections).not.toHaveBeenCalled();
  });

  it('swallows relationship projection refresh failures after recording events', async () => {
    const repository = createRepository();
    repository.getRelationshipScoresForMembers.mockRejectedValue(new Error('refresh failed'));
    const service = new ChannelInteractionService(repository as any);

    await expect(
      service.recordNormalizedDelivery('org', 'integration', [interaction()] as any)
    ).resolves.toEqual({ created: 1, duplicates: 0, membershipOnly: 0 });
  });

  it('applies unfollow membership immediately without logging a positive event', async () => {
    const repository = createRepository();
    const service = new ChannelInteractionService(repository as any);

    const result = await service.recordNormalizedDelivery('org', 'integration', [
      interaction({
        kind: 'follow',
        membershipUpdate: 'not_follower',
      }),
    ] as any);

    expect(result).toEqual({ created: 0, duplicates: 0, membershipOnly: 1 });
    expect(repository.applyMembershipUpdate).toHaveBeenCalledWith(
      'org',
      'integration',
      expect.objectContaining({ externalId: 'person-1' }),
      'NOT_FOLLOWER'
    );
    expect(repository.recordNormalizedEvent).not.toHaveBeenCalled();
  });

  it('stamps followedAt from inbound follow webhook event time', async () => {
    const repository = createRepository();
    const service = new ChannelInteractionService(repository as any);

    await service.recordNormalizedDelivery('org', 'integration', [
      interaction({
        kind: 'follow',
        membershipUpdate: 'follower',
        eventAt: '2026-08-12T11:30:00.000Z',
      }),
    ] as any);

    expect(repository.recordNormalizedEvent).toHaveBeenCalledWith(
      'org',
      'integration',
      expect.objectContaining({
        kind: 'FOLLOW',
        membershipUpdate: 'FOLLOWER',
        counterparty: expect.objectContaining({
          externalId: 'person-1',
          followedAt: new Date('2026-08-12T11:30:00.000Z'),
        }),
      })
    );
  });

  it('does not let an unknown membership signal demote a known follower', async () => {
    const repository = createRepository();
    const service = new ChannelInteractionService(repository as any);

    await service.recordNormalizedDelivery('org', 'integration', [
      interaction({ membershipUpdate: 'unknown' }),
    ] as any);

    expect(repository.recordNormalizedEvent).toHaveBeenCalledWith(
      'org',
      'integration',
      expect.objectContaining({ membershipUpdate: undefined })
    );
  });

  it('validates a complete batch before performing any writes', async () => {
    const repository = createRepository();
    const service = new ChannelInteractionService(repository as any);

    await expect(
      service.recordNormalizedDelivery('org', 'integration', [
        interaction(),
        interaction({ providerEventKey: '', kind: 'invented' }),
      ] as any)
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.recordNormalizedEvent).not.toHaveBeenCalled();
  });

  it('rejects unsafe metadata, URLs, and future timestamps', async () => {
    const repository = createRepository();
    const service = new ChannelInteractionService(repository as any);

    await expect(
      service.recordNormalizedDelivery('org', 'integration', [
        interaction({ metadata: { secret: 'x'.repeat(2049) } }),
      ] as any)
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.recordNormalizedDelivery('org', 'integration', [
        interaction({ counterparty: { externalId: 'p', picture: 'file:///etc/passwd' } }),
      ] as any)
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.recordNormalizedDelivery('org', 'integration', [
        interaction({ eventAt: '2026-08-12T13:00:00.000Z' }),
      ] as any)
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects stale follower generations without completing or applying them', async () => {
    const repository = createRepository();
    repository.applyFollowerSyncPage.mockResolvedValue(false);
    repository.completeFollowerSync.mockResolvedValue(false);
    const service = new ChannelInteractionService(repository as any);

    await expect(
      service.applyFollowerSync('org', 'integration', 'stale', [])
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.completeFollowerSync('org', 'integration', 'stale')
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('scores new followers with zero engagement so first sync matches stored zeros', async () => {
    const repository = createRepository();
    repository.getAudienceBotScoreInputs.mockResolvedValue(new Map());
    const service = new ChannelInteractionService(repository as any);

    await service.applyFollowerSync('org', 'integration', 'generation-1', [
      {
        id: 'person-1',
        name: 'Ada Lovelace',
        username: 'ada',
        picture: 'https://example.com/ada.jpg',
        bio: 'Mathematician and writer with a long public history.',
        followersCount: 12000,
        followingCount: 400,
      },
    ] as any);

    expect(repository.applyFollowerSyncPage).toHaveBeenCalledWith(
      'org',
      'integration',
      'generation-1',
      [
        expect.objectContaining({
          externalId: 'person-1',
          botGrade: expect.any(Number),
          isBot: expect.anything(),
          botConfidence: expect.any(Number),
          botFormulaVersion: expect.any(Number),
          botGradedAt: expect.any(Date),
        }),
      ]
    );
    const [scored] = repository.applyFollowerSyncPage.mock.calls[0][3];
    const expected = calculateBotGrade({
      name: 'Ada Lovelace',
      username: 'ada',
      picture: 'https://example.com/ada.jpg',
      bio: 'Mathematician and writer with a long public history.',
      followersCount: 12000,
      followingCount: 400,
      inboundInteractionCount: 0,
      noteCount: 0,
      likesCount: 0,
      relationshipEffortScore: null,
      relationshipReciprocationScore: null,
      now: scored.botGradedAt,
    });
    expect(scored.botGrade).toBe(expected.botGrade);
    expect(scored.isBot).toBe(expected.isBot);
    expect(scored.botConfidence).toBe(expected.botConfidence);
  });

  it('uses exact inclusive UTC-instant cutoffs for all rolling windows', async () => {
    const repository = createRepository();
    const service = new ChannelInteractionService(repository as any);
    const computedAt = new Date('2026-08-12T18:30:00.000Z');

    for (const [window, cutoff] of [
      ['week', '2026-08-05T18:30:00.000Z'],
      ['month', '2026-07-13T18:30:00.000Z'],
      ['90_day', '2026-05-14T18:30:00.000Z'],
      ['year', '2025-08-12T18:30:00.000Z'],
    ] as const) {
      await service.rebuildWindowSummary('org', 'integration', window, computedAt);
      expect(repository.rebuildWindowSummary).toHaveBeenLastCalledWith(
        'org',
        'integration',
        expect.any(String),
        expect.any(String),
        new Date(cutoff),
        computedAt
      );
    }
  });

  it('fans a verified delivery out to every active matching integration', async () => {
    const repository = createRepository();
    repository.getActiveIntegrationsForAccount.mockResolvedValue([
      { id: 'integration-a', organizationId: 'org-a' },
      { id: 'integration-b', organizationId: 'org-b' },
    ]);
    const capability = {
      verifyAndNormalizeDelivery: jest.fn().mockResolvedValue({
        accepted: true,
        connectedAccountId: 'account-1',
        events: [interaction()],
      }),
    };
    const manager = {
      getSocialIntegration: jest.fn().mockReturnValue({
        channelInteractionWebhooks: capability,
      }),
    };
    const service = new ChannelInteractionService(repository as any, manager as any);
    const record = jest.spyOn(service, 'recordNormalizedDelivery').mockResolvedValue({
      created: 1,
      duplicates: 0,
      membershipOnly: 0,
    });

    await expect(
      service.handleDelivery('provider', {
        rawBody: Buffer.from('{}'),
        headers: {},
      })
    ).resolves.toEqual(expect.objectContaining({ accepted: true }));
    expect(repository.getActiveIntegrationsForAccount).toHaveBeenCalledWith(
      'provider',
      'account-1'
    );
    expect(record).toHaveBeenCalledWith('org-a', 'integration-a', [interaction()]);
    expect(record).toHaveBeenCalledWith('org-b', 'integration-b', [interaction()]);
  });

  it('imports calendar content events after recording interactions', async () => {
    const repository = createRepository();
    repository.getActiveIntegrationsForAccount.mockResolvedValue([
      { id: 'integration-a', organizationId: 'org-a' },
    ]);
    const postsRepository = {
      importPlatformPost: jest.fn().mockResolvedValue({ created: true }),
      markPlatformDeleted: jest.fn().mockResolvedValue({ updated: true }),
    };
    const manager = {
      getSocialIntegration: jest.fn().mockReturnValue({
        channelInteractionWebhooks: {
          verifyAndNormalizeDelivery: jest.fn().mockResolvedValue({
            accepted: true,
            connectedAccountId: 'account-1',
            events: [interaction()],
            contentEvents: [
              {
                type: 'post.upsert',
                externalId: 'tweet-1',
                url: 'https://x.com/i/status/tweet-1',
                content: 'Hello from X',
                publishedAt: '2026-08-12T12:00:00.000Z',
              },
              {
                type: 'post.delete',
                externalId: 'tweet-2',
                deletedAt: '2026-08-12T12:01:00.000Z',
              },
            ],
          }),
        },
      }),
    };
    const service = new ChannelInteractionService(
      repository as any,
      manager as any,
      undefined,
      postsRepository as any
    );
    jest.spyOn(service, 'recordNormalizedDelivery').mockResolvedValue({
      created: 1,
      duplicates: 0,
      membershipOnly: 0,
    });

    await service.handleDelivery('x', {
      rawBody: Buffer.from('{}'),
      headers: {},
    });

    expect(postsRepository.importPlatformPost).toHaveBeenCalledWith({
      organizationId: 'org-a',
      integrationId: 'integration-a',
      providerIdentifier: 'x',
      externalId: 'tweet-1',
      url: 'https://x.com/i/status/tweet-1',
      content: 'Hello from X',
      publishedAt: new Date('2026-08-12T12:00:00.000Z'),
    });
    expect(postsRepository.markPlatformDeleted).toHaveBeenCalledWith(
      'org-a',
      'integration-a',
      'tweet-2',
      new Date('2026-08-12T12:01:00.000Z')
    );
  });

  it('scores inbound follower mentions without changing the score matrix', async () => {
    const repository = createRepository();
    const service = new ChannelInteractionService(repository as any);

    await service.recordNormalizedDelivery('org', 'integration', [
      interaction({
        kind: 'mention',
        direction: 'inbound',
        counterparty: { externalId: 'follower-1', name: 'Follower' },
      }),
    ] as any);

    expect(repository.recordNormalizedEvent).toHaveBeenCalledWith(
      'org',
      'integration',
      expect.objectContaining({
        kind: 'MENTION',
        direction: 'INBOUND',
        score: 4,
        counterparty: expect.objectContaining({ externalId: 'follower-1' }),
      })
    );
  });

  it('writes an inbound webhook log for each resolved organization', async () => {
    const repository = createRepository();
    repository.getActiveIntegrationsForAccount.mockResolvedValue([
      {
        id: 'integration-a',
        organizationId: 'org-a',
        name: 'My X',
        profile: 'me',
      },
      {
        id: 'integration-a2',
        organizationId: 'org-a',
        name: 'My X alt',
        profile: 'me2',
      },
      {
        id: 'integration-b',
        organizationId: 'org-b',
        name: 'Org B X',
        profile: 'orgb',
      },
    ]);
    const logsService = {
      logInboundWebhook: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      getSocialIntegration: jest.fn().mockReturnValue({
        channelInteractionWebhooks: {
          verifyAndNormalizeDelivery: jest.fn().mockResolvedValue({
            accepted: true,
            connectedAccountId: 'account-1',
            events: [interaction()],
          }),
        },
      }),
    };
    const service = new ChannelInteractionService(
      repository as any,
      manager as any,
      logsService as any
    );
    jest.spyOn(service, 'recordNormalizedDelivery').mockResolvedValue({
      created: 1,
      duplicates: 0,
      membershipOnly: 0,
    });

    await service.handleDelivery('provider', {
      rawBody: Buffer.from('{"ok":true}'),
      headers: { 'x-twitter-webhooks-signature': 'valid' },
    });

    expect(logsService.logInboundWebhook).toHaveBeenCalledTimes(2);
    expect(logsService.logInboundWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        method: 'POST',
        url: '/channel-webhooks/provider',
        statusCode: 200,
        sourceDisplayName: 'Person',
        targetDisplayName: 'My X',
        targetUsername: 'me',
        eventType: 'like.create',
      })
    );
    expect(logsService.logInboundWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-b',
        method: 'POST',
        url: '/channel-webhooks/provider',
        statusCode: 200,
        sourceDisplayName: 'Person',
        targetDisplayName: 'Org B X',
        targetUsername: 'orgb',
        eventType: 'like.create',
      })
    );
  });

  it('flips source and target for outbound channel interaction events', async () => {
    const repository = createRepository();
    repository.getActiveIntegrationsForAccount.mockResolvedValue([
      {
        id: 'integration-a',
        organizationId: 'org-a',
        name: 'My X',
        profile: 'me',
      },
    ]);
    const logsService = {
      logInboundWebhook: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      getSocialIntegration: jest.fn().mockReturnValue({
        channelInteractionWebhooks: {
          verifyAndNormalizeDelivery: jest.fn().mockResolvedValue({
            accepted: true,
            connectedAccountId: 'account-1',
            events: [
              interaction({
                direction: 'outbound',
                counterparty: { name: 'Bob', username: 'bob' },
              }),
            ],
          }),
        },
      }),
    };
    const service = new ChannelInteractionService(
      repository as any,
      manager as any,
      logsService as any
    );
    jest.spyOn(service, 'recordNormalizedDelivery').mockResolvedValue({
      created: 1,
      duplicates: 0,
      membershipOnly: 0,
    });

    await service.handleDelivery('provider', {
      rawBody: Buffer.from('{"ok":true}'),
      headers: {},
    });

    expect(logsService.logInboundWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        sourceDisplayName: 'My X',
        sourceUsername: 'me',
        targetDisplayName: 'Bob',
        targetUsername: 'bob',
        eventType: 'like.create',
      })
    );
  });

  it('logs outbound post.create replies as post.reply.create', async () => {
    const repository = createRepository();
    repository.getActiveIntegrationsForAccount.mockResolvedValue([
      {
        id: 'integration-a',
        organizationId: 'org-a',
        name: 'My X',
        profile: 'me',
      },
    ]);
    const logsService = {
      logInboundWebhook: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      getSocialIntegration: jest.fn().mockReturnValue({
        channelInteractionWebhooks: {
          verifyAndNormalizeDelivery: jest.fn().mockResolvedValue({
            accepted: true,
            connectedAccountId: 'account-1',
            events: [
              interaction({
                kind: 'reply',
                direction: 'outbound',
                eventType: 'post.create',
                counterparty: { name: 'Bob', username: 'bob' },
              }),
            ],
          }),
        },
      }),
    };
    const service = new ChannelInteractionService(
      repository as any,
      manager as any,
      logsService as any
    );
    jest.spyOn(service, 'recordNormalizedDelivery').mockResolvedValue({
      created: 1,
      duplicates: 0,
      membershipOnly: 0,
    });

    await service.handleDelivery('provider', {
      rawBody: Buffer.from('{"ok":true}'),
      headers: {},
    });

    expect(logsService.logInboundWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        sourceDisplayName: 'My X',
        targetDisplayName: 'Bob',
        eventType: 'post.reply.create',
      })
    );
  });

  it('logs a verified delivery to the sole org when the account is unknown locally', async () => {
    const repository = createRepository();
    repository.getActiveIntegrationsForAccount.mockResolvedValue([]);
    repository.getActiveIntegrationsForProvider.mockResolvedValue([
      { id: 'integration-x', organizationId: 'org-only' },
    ]);
    const logsService = {
      logInboundWebhook: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      getSocialIntegration: jest.fn().mockReturnValue({
        channelInteractionWebhooks: {
          verifyAndNormalizeDelivery: jest.fn().mockResolvedValue({
            accepted: true,
            connectedAccountId: 'missing-account',
            events: [interaction()],
          }),
        },
      }),
    };
    const service = new ChannelInteractionService(
      repository as any,
      manager as any,
      logsService as any
    );
    const record = jest.spyOn(service, 'recordNormalizedDelivery');

    await service.handleDelivery('x', {
      rawBody: Buffer.from('{"data":{"filter":{"user_id":"missing-account"}}}'),
      headers: {},
    });

    expect(record).not.toHaveBeenCalled();
    expect(logsService.logInboundWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-only',
        method: 'POST',
        url: '/channel-webhooks/x',
        statusCode: 200,
      })
    );
  });

  it('logs a rejected delivery when the payload names a connected account', async () => {
    const repository = createRepository();
    repository.getActiveIntegrationsForAccount.mockResolvedValue([
      { id: 'integration-a', organizationId: 'org-a' },
    ]);
    const logsService = {
      logInboundWebhook: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      getSocialIntegration: jest.fn().mockReturnValue({
        channelInteractionWebhooks: {
          verifyAndNormalizeDelivery: jest.fn().mockResolvedValue({
            accepted: false,
            statusCode: 401,
          }),
        },
      }),
    };
    const service = new ChannelInteractionService(
      repository as any,
      manager as any,
      logsService as any
    );

    await service.handleDelivery('x', {
      rawBody: Buffer.from(
        JSON.stringify({ data: { filter: { user_id: '42' } } })
      ),
      headers: { 'x-twitter-webhooks-signature': 'invalid' },
    });

    expect(logsService.logInboundWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        method: 'POST',
        statusCode: 401,
        error: 'Channel webhook delivery rejected',
      })
    );
    expect(repository.getActiveIntegrationsForAccount).toHaveBeenCalledWith(
      'x',
      '42'
    );
  });

  it('logs an inbound attempt using a peeked connected account', async () => {
    const repository = createRepository();
    repository.getActiveIntegrationsForAccount.mockResolvedValue([
      { id: 'integration-a', organizationId: 'org-a' },
    ]);
    const logsService = {
      logInboundWebhook: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ChannelInteractionService(
      repository as any,
      undefined,
      logsService as any
    );

    await service.logInboundAttempt({
      providerIdentifier: 'x',
      method: 'POST',
      requestHeaders: {},
      requestBody: Buffer.from(
        JSON.stringify({ data: { filter: { user_id: '42' } } })
      ),
      statusCode: 400,
      error: 'Missing raw webhook body',
    });

    expect(logsService.logInboundWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        method: 'POST',
        statusCode: 400,
        error: 'Missing raw webhook body',
        url: '/channel-webhooks/x',
      })
    );
    expect(repository.getActiveIntegrationsForAccount).toHaveBeenCalledWith(
      'x',
      '42'
    );
  });

  it('returns logged true after writing an inbound webhook log', async () => {
    const repository = createRepository();
    repository.getActiveIntegrationsForAccount.mockResolvedValue([
      { id: 'integration-a', organizationId: 'org-a' },
    ]);
    const logsService = {
      logInboundWebhook: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      getSocialIntegration: jest.fn().mockReturnValue({
        channelInteractionWebhooks: {
          verifyAndNormalizeDelivery: jest.fn().mockResolvedValue({
            accepted: false,
            statusCode: 401,
          }),
        },
      }),
    };
    const service = new ChannelInteractionService(
      repository as any,
      manager as any,
      logsService as any
    );

    await expect(
      service.handleDelivery('x', {
        rawBody: Buffer.from(
          JSON.stringify({ data: { filter: { user_id: '42' } } })
        ),
        headers: {},
      })
    ).resolves.toEqual(expect.objectContaining({ accepted: false, logged: true }));
  });

  it('logs a challenge against the sole org that owns the provider', async () => {
    const repository = createRepository();
    repository.getActiveIntegrationsForProvider.mockResolvedValue([
      {
        id: 'integration-x',
        organizationId: 'org-only',
        name: 'Solo X',
        profile: 'solo',
      },
    ]);
    const logsService = {
      logInboundWebhook: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      getSocialIntegration: jest.fn().mockReturnValue({
        channelInteractionWebhooks: {
          verifyChallenge: jest.fn().mockResolvedValue({
            accepted: true,
            responseBody: { response_token: 'sha256=challenge' },
          }),
        },
      }),
    };
    const service = new ChannelInteractionService(
      repository as any,
      manager as any,
      logsService as any
    );

    await service.handleChallenge('x', { query: { crc_token: 'challenge' } });

    expect(logsService.logInboundWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-only',
        method: 'GET',
        url: '/channel-webhooks/x',
        statusCode: 200,
        targetDisplayName: 'Solo X',
        targetUsername: 'solo',
      })
    );
  });

  it('does not fan an unmatched payload to every org on a shared provider', async () => {
    const repository = createRepository();
    repository.getActiveIntegrationsForAccount.mockResolvedValue([]);
    repository.getActiveIntegrationsForProvider.mockResolvedValue([
      { id: 'integration-a', organizationId: 'org-a' },
      { id: 'integration-b', organizationId: 'org-b' },
    ]);
    const logsService = {
      logInboundWebhook: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      getSocialIntegration: jest.fn().mockReturnValue({
        channelInteractionWebhooks: {
          verifyAndNormalizeDelivery: jest.fn().mockResolvedValue({
            accepted: true,
            connectedAccountId: 'missing-account',
            events: [],
          }),
        },
      }),
    };
    const service = new ChannelInteractionService(
      repository as any,
      manager as any,
      logsService as any
    );

    await service.handleDelivery('x', {
      rawBody: Buffer.from('{}'),
      headers: {},
    });

    expect(logsService.logInboundWebhook).not.toHaveBeenCalled();
  });

  it('acknowledges a verified delivery for an unknown local account', async () => {
    const repository = createRepository();
    const manager = {
      getSocialIntegration: jest.fn().mockReturnValue({
        channelInteractionWebhooks: {
          verifyAndNormalizeDelivery: jest.fn().mockResolvedValue({
            accepted: true,
            connectedAccountId: 'missing-account',
            events: [],
          }),
        },
      }),
    };
    const service = new ChannelInteractionService(repository as any, manager as any);

    await expect(
      service.handleDelivery('provider', {
        rawBody: Buffer.from('{}'),
        headers: {},
      })
    ).resolves.toEqual(expect.objectContaining({ accepted: true }));
    expect(repository.getActiveIntegrationsForAccount).toHaveBeenCalledWith(
      'provider',
      'missing-account'
    );
  });

  it('requests provisioning on reconnect and removal on disable/delete', async () => {
    const repository = createRepository();
    const manager = {
      getSocialIntegration: jest.fn().mockReturnValue({
        channelInteractionWebhooks: {
          getDesiredSubscriptions: jest.fn().mockReturnValue([
            { eventKey: 'like', direction: 'inbound' },
          ]),
        },
      }),
    };
    const service = new ChannelInteractionService(repository as any, manager as any);
    const integration = {
      id: 'integration-a',
      organizationId: 'org-a',
      providerIdentifier: 'provider',
      type: 'social',
    };

    await expect(
      service.requestReconciliation(integration as any)
    ).resolves.toBe(true);
    expect(repository.requestSubscriptionReconciliation).toHaveBeenCalledWith(
      'org-a',
      'integration-a',
      [{ eventKey: 'like', direction: 'INBOUND' }]
    );

    await expect(
      service.requestSubscriptionRemoval(integration as any)
    ).resolves.toBe(true);
    expect(repository.markSubscriptionsForRemoval).toHaveBeenCalledWith(
      'org-a',
      'integration-a'
    );
  });

  it('upserts a valid personal grade and rejects invalid values', async () => {
    const repository = createRepository();
    const service = new ChannelInteractionService(repository as any);

    await expect(
      service.upsertFollowerGrade('org', 'integration', 'follower-a', 'user-a', 4.5)
    ).resolves.toEqual({ grade: 4.5, adjustedGrade: 5 });
    expect(repository.upsertAudienceMemberGrade).toHaveBeenCalledWith(
      'org',
      'integration',
      'follower-a',
      'user-a',
      4.5
    );

    repository.upsertAudienceMemberGrade.mockResolvedValue({
      grade: 4.5,
      relationshipGrade: null,
    });
    await expect(
      service.upsertFollowerGrade('org', 'integration', 'follower-a', 'user-a', 4.5)
    ).resolves.toEqual({ grade: 4.5, adjustedGrade: 4.5 });

    await expect(
      service.upsertFollowerGrade('org', 'integration', 'follower-a', 'user-a', 2.25)
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ignores a follower triage badge for an existing member', async () => {
    const repository = createRepository();
    const service = new ChannelInteractionService(repository as any);

    await expect(
      service.ignoreFollowerTriage(
        'org',
        'integration',
        'follower-a',
        'hot_lead',
        'user-a'
      )
    ).resolves.toBeUndefined();
    expect(repository.addAudienceTriageIgnore).toHaveBeenCalledWith(
      'org',
      'integration',
      'follower-a',
      'hot_lead',
      'user-a',
      undefined,
      undefined
    );

    await expect(
      service.ignoreFollowerTriage(
        'org',
        'integration',
        'follower-a',
        'lead',
        'user-a',
        ['wrong_topic']
      )
    ).resolves.toBeUndefined();
    expect(repository.addAudienceTriageIgnore).toHaveBeenCalledWith(
      'org',
      'integration',
      'follower-a',
      'lead',
      'user-a',
      ['wrong_topic'],
      undefined
    );

    await expect(
      service.ignoreFollowerTriage(
        'org',
        'integration',
        'follower-a',
        'cultivate',
        'user-a'
      )
    ).resolves.toBeUndefined();
    expect(repository.addAudienceTriageIgnore).toHaveBeenCalledWith(
      'org',
      'integration',
      'follower-a',
      'cultivate',
      'user-a',
      undefined,
      undefined
    );
  });

  it('snoozes a follower triage badge without lead dismiss reasons', async () => {
    const repository = createRepository();
    const service = new ChannelInteractionService(repository as any);

    await expect(
      service.ignoreFollowerTriage(
        'org',
        'integration',
        'follower-a',
        'lead',
        'user-a',
        undefined,
        { snooze: true }
      )
    ).resolves.toBeUndefined();
    expect(repository.addAudienceTriageIgnore).toHaveBeenCalledWith(
      'org',
      'integration',
      'follower-a',
      'lead',
      'user-a',
      undefined,
      { snooze: true }
    );
  });

  it('requires reasons when dismissing a lead triage badge', async () => {
    const repository = createRepository();
    const service = new ChannelInteractionService(repository as any);

    await expect(
      service.ignoreFollowerTriage(
        'org',
        'integration',
        'follower-a',
        'lead',
        'user-a'
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.addAudienceTriageIgnore).not.toHaveBeenCalled();
  });

  it('accepts engaged-not-yet triage ignores and rejects invalid values', async () => {
    const repository = createRepository();
    const service = new ChannelInteractionService(repository as any);

    await expect(
      service.ignoreFollowerTriage(
        'org',
        'integration',
        'follower-a',
        'engaged_not_yet',
        'user-a'
      )
    ).resolves.toBeUndefined();
    expect(repository.addAudienceTriageIgnore).toHaveBeenCalledWith(
      'org',
      'integration',
      'follower-a',
      'engaged_not_yet',
      'user-a',
      undefined,
      undefined
    );

    await expect(
      service.ignoreFollowerTriage(
        'org',
        'integration',
        'follower-a',
        'invalid',
        'user-a'
      )
    ).rejects.toBeInstanceOf(BadRequestException);

    repository.addAudienceTriageIgnore.mockResolvedValue({ missing: 'member' });
    await expect(
      service.ignoreFollowerTriage(
        'org',
        'integration',
        'missing',
        'hot_lead',
        'user-a'
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removes following list members through a bounded batch', async () => {
    const repository = createRepository();
    repository.removeAudienceListMembers.mockResolvedValue({
      ok: true,
      removed: [
        { externalId: 'person-1', name: 'Alex', username: 'alex' },
      ],
      remaining: 3,
      hasMore: true,
    });
    const service = new ChannelInteractionService(repository as any);

    await expect(
      service.removeFollowerListMembers('org', 'integration', 'list-1', {
        onlyFollowing: true,
      })
    ).resolves.toEqual({
      removed: [{ id: 'person-1', name: 'Alex', username: 'alex' }],
      remaining: 3,
      hasMore: true,
    });
    expect(repository.removeAudienceListMembers).toHaveBeenCalledWith(
      'org',
      'integration',
      'list-1',
      { onlyFollowing: true }
    );
  });

  it('rejects invalid removeFollowerListMembers option combinations', async () => {
    const repository = createRepository();
    const service = new ChannelInteractionService(repository as any);

    await expect(
      service.removeFollowerListMembers('org', 'integration', 'list-1', {})
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.removeFollowerListMembers('org', 'integration', 'list-1', {
        onlyFollowing: true,
        externalIds: ['person-1'],
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.removeFollowerListMembers('org', 'integration', 'list-1', {
        externalIds: ['person-1', 'person-1'],
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.removeAudienceListMembers).not.toHaveBeenCalled();
  });

  it('refreshes one score direction and keeps the other projected score', async () => {
    const repository = createRepository();
    repository.getCurrentRelationshipProjection.mockResolvedValue({
      externalId: 'follower-a',
      relationshipEffortScore: 10,
      relationshipReciprocationScore: 5,
    });
    repository.getRelationshipScoresForMembers.mockResolvedValue({
      strategy: growStrategy,
      members: [
        {
          externalId: 'follower-a',
          interactionCounts: interactionCounts({
            reply: { outbound: 5 },
            follow: { inbound: 3 },
          }),
        },
      ],
    });
    const service = new ChannelInteractionService(repository as any);
    const snapshotAt = new Date('2026-08-12T12:05:00.000Z');

    await expect(
      service.refreshFollowerRelationshipScore(
        'org',
        'integration',
        'follower-a',
        'their',
        snapshotAt
      )
    ).resolves.toEqual({
      externalId: 'follower-a',
      effortScore: 10,
      reciprocationScore: 30,
      ...growGrade(10, 30),
      snapshotAt,
    });
    expect(repository.updateCurrentRelationshipProjections).toHaveBeenCalledWith(
      'org',
      'integration',
      snapshotAt,
      [{
        externalId: 'follower-a',
        effortScore: 10,
        reciprocationScore: 30,
        ...growGrade(10, 30),
      }],
      { force: true }
    );
    expect(repository.createRelationshipGradeSnapshots).not.toHaveBeenCalled();

    await expect(
      service.refreshFollowerRelationshipScore(
        'org',
        'integration',
        'follower-a',
        'your',
        snapshotAt
      )
    ).resolves.toEqual({
      externalId: 'follower-a',
      effortScore: 20,
      reciprocationScore: 5,
      ...growGrade(20, 5),
      snapshotAt,
    });
  });

  it('refreshes one member with the strategy the channel now uses', async () => {
    const repository = createRepository();
    repository.getCurrentRelationshipProjection.mockResolvedValue({
      externalId: 'follower-a',
      relationshipEffortScore: 10,
      relationshipReciprocationScore: 5,
    });
    repository.getRelationshipScoresForMembers.mockResolvedValue({
      strategy: { strategyId: 'brand_awareness', strategyVersion: 1 },
      members: [
        {
          externalId: 'follower-a',
          interactionCounts: interactionCounts({ repost: { inbound: 2 } }),
        },
      ],
    });
    const service = new ChannelInteractionService(repository as any);
    const brandRepost = getChannelStrategy('brand_awareness')
      .getScoringProfile().interactionWeights.repost.inbound;

    await expect(
      service.refreshFollowerRelationshipScore(
        'org',
        'integration',
        'follower-a',
        'their',
        new Date('2026-08-12T12:05:00.000Z')
      )
    ).resolves.toMatchObject({
      effortScore: 10,
      reciprocationScore: brandRepost * 2,
      strategyId: 'brand_awareness',
      strategyVersion: 1,
    });
  });

  it('returns not found when refreshing a missing follower score', async () => {
    const repository = createRepository();
    const service = new ChannelInteractionService(repository as any);

    await expect(
      service.refreshFollowerRelationshipScore(
        'org',
        'integration',
        'missing',
        'their'
      )
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.getRelationshipScoresForMembers).not.toHaveBeenCalled();
    expect(repository.updateCurrentRelationshipProjections).not.toHaveBeenCalled();
  });

  it('stores a tracking grant and reuses it until it expires', async () => {
    const repository = createRepository();
    const authorization = {
      scopes: ['like.read'],
      generateAuthUrl: jest.fn(),
      authenticate: jest.fn().mockResolvedValue({
        accessToken: 'granted',
        refreshToken: 'renew',
        expiresIn: 7200,
        scopes: ['like.read', 'offline.access'],
      }),
      refreshToken: jest.fn(),
    };
    const manager = {
      getSocialIntegration: jest.fn().mockReturnValue({
        channelInteractionWebhooks: { authorization },
      }),
    };
    const service = new ChannelInteractionService(
      repository as any,
      manager as any
    );
    const integration = {
      id: 'integration',
      organizationId: 'org',
      providerIdentifier: 'x',
    } as any;

    await service.completeInteractionAuthorization(integration, {
      code: 'code',
      codeVerifier: 'verifier',
    });

    expect(repository.saveInteractionAuthorization).toHaveBeenCalledWith(
      'org',
      'integration',
      {
        token: 'granted',
        refreshToken: 'renew',
        tokenExpiration: new Date('2026-08-12T14:05:00.000Z'),
        scopes: 'like.read offline.access',
      }
    );

    repository.getInteractionAuthorization.mockResolvedValue({
      token: 'granted',
      refreshToken: 'renew',
      tokenExpiration: new Date('2026-08-12T14:05:00.000Z'),
    });
    await expect(
      service.getInteractionAuthorizationToken(integration)
    ).resolves.toBe('granted');
    expect(authorization.refreshToken).not.toHaveBeenCalled();
  });

  it('renews an expired tracking grant and reports missing ones', async () => {
    const repository = createRepository();
    const authorization = {
      scopes: ['like.read'],
      generateAuthUrl: jest.fn(),
      authenticate: jest.fn(),
      refreshToken: jest.fn().mockResolvedValue({
        accessToken: 'renewed',
        refreshToken: 'renew-2',
        expiresIn: 7200,
      }),
    };
    const manager = {
      getSocialIntegration: jest.fn().mockReturnValue({
        channelInteractionWebhooks: { authorization },
      }),
    };
    const service = new ChannelInteractionService(
      repository as any,
      manager as any
    );
    const integration = {
      id: 'integration',
      organizationId: 'org',
      providerIdentifier: 'x',
    } as any;

    await expect(
      service.getInteractionAuthorizationToken(integration)
    ).resolves.toBeUndefined();

    repository.getInteractionAuthorization.mockResolvedValue({
      token: 'expired',
      refreshToken: 'renew',
      tokenExpiration: new Date('2026-08-12T12:00:00.000Z'),
    });
    await expect(
      service.getInteractionAuthorizationToken(integration)
    ).resolves.toBe('renewed');
    expect(authorization.refreshToken).toHaveBeenCalledWith('renew');

    authorization.refreshToken.mockRejectedValue(new Error('revoked'));
    await expect(
      service.getInteractionAuthorizationToken(integration)
    ).resolves.toBeUndefined();
  });

  it('does not renew a grant another reconciliation pass is already renewing', async () => {
    const repository = createRepository();
    repository.getInteractionAuthorization
      .mockResolvedValueOnce({
        token: 'expired',
        refreshToken: 'renew',
        tokenExpiration: new Date('2026-08-12T12:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        token: 'renewed-elsewhere',
        refreshToken: 'renew-2',
        tokenExpiration: new Date('2026-08-12T14:05:00.000Z'),
      });
    const authorization = {
      generateAuthUrl: jest.fn(),
      authenticate: jest.fn(),
      refreshToken: jest.fn(),
    };
    const manager = {
      getSocialIntegration: jest.fn().mockReturnValue({
        channelInteractionWebhooks: { authorization },
      }),
    };
    (ioRedis.set as jest.Mock).mockResolvedValueOnce(null);
    const service = new ChannelInteractionService(
      repository as any,
      manager as any
    );

    await expect(
      service.getInteractionAuthorizationToken({
        id: 'integration',
        organizationId: 'org',
        providerIdentifier: 'x',
      } as any)
    ).resolves.toBe('renewed-elsewhere');
    expect(authorization.refreshToken).not.toHaveBeenCalled();
  });

  it('materializes rules-only cultivate picks without calling AI', async () => {
    const repository = createRepository();
    repository.listCultivateCandidates.mockResolvedValue([
      {
        externalId: 'warm-1',
        username: 'warm',
        name: 'Warm',
        relationshipGrade: 4,
        relationshipTriage: 'mutual',
        lastOutboundAt: null,
      },
    ]);
    repository.rankCultivateCandidates.mockReturnValue([
      {
        externalId: 'warm-1',
        username: 'warm',
        name: 'Warm',
        relationshipGrade: 4,
        relationshipTriage: 'mutual',
        lastOutboundAt: null,
        rulesRank: 1,
        finalRank: 1,
        rulesReason: 'No outbound attention yet · mutual relationship',
      },
    ]);
    repository.upsertCultivatePicks.mockResolvedValue({ count: 1 });
    const service = new ChannelInteractionService(repository as any);

    await expect(
      service.materializeCultivatePicksForIntegration('org', 'integration')
    ).resolves.toEqual({
      day: '2026-08-12',
      candidateCount: 1,
      pickCount: 1,
    });
    expect(repository.upsertCultivatePicks).toHaveBeenCalledWith({
      organizationId: 'org',
      integrationId: 'integration',
      day: '2026-08-12',
      picks: [
        {
          counterpartyExternalId: 'warm-1',
          rulesRank: 1,
          finalRank: 1,
          rulesReason: 'No outbound attention yet · mutual relationship',
          source: 'rules',
        },
      ],
    });
  });

  it('skips near-full Hot batches before refresh or AI, but refreshes a just-below-threshold batch before selecting candidates', async () => {
    const repository = createRepository();
    repository.countVisibleHotPicks.mockResolvedValueOnce(18).mockResolvedValueOnce(17);
    repository.listHotRefreshExternalIds.mockResolvedValue(['hot-1']);
    repository.listHotRulesCandidates.mockResolvedValue([
      {
        externalId: 'hot-1',
        name: 'Hot One',
        username: 'hotone',
        bio: null,
        relationshipNetGap: 12,
        relationshipReciprocationScore: 18,
        lastInboundAt: new Date('2026-08-12T11:00:00.000Z'),
      },
    ]);
    repository.replaceHotPickBatch.mockResolvedValue({ count: 1 });
    const service = new ChannelInteractionService(repository as any);

    await expect(
      service.materializeHotPicksForIntegration('org', 'integration')
    ).resolves.toEqual({
      hour: '2026-08-12T12',
      skipped: 'near_full',
      visibleCount: 18,
    });
    expect(repository.listHotRefreshExternalIds).not.toHaveBeenCalled();
    expect(repository.replaceHotPickBatch).not.toHaveBeenCalled();

    await service.materializeHotPicksForIntegration('org', 'integration');

    expect(
      repository.getRelationshipScoresForMembers.mock.invocationCallOrder[1]
    ).toBeLessThan(
      repository.listHotRulesCandidates.mock.invocationCallOrder[0]
    );
    expect(repository.updateCurrentRelationshipProjections).toHaveBeenCalledWith(
      'org',
      'integration',
      expect.any(Date),
      [],
      { force: true }
    );
  });

  it('passes the complete Hot rules pool to AI and persists only its validated reordered subset', async () => {
    const previousEnabled = process.env.TRIAGE_AI_RERANK_ENABLED;
    const previousApiKey = process.env.OPENAI_API_KEY;
    process.env.TRIAGE_AI_RERANK_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';
    try {
      const repository = createRepository();
      repository.listHotRulesCandidates.mockResolvedValue([
        {
          externalId: 'hot-1',
          name: 'Hot One',
          username: 'hotone',
          bio: null,
          relationshipNetGap: 10,
          relationshipReciprocationScore: 10,
          lastInboundAt: null,
        },
        {
          externalId: 'hot-2',
          name: 'Hot Two',
          username: 'hottwo',
          bio: null,
          relationshipNetGap: 20,
          relationshipReciprocationScore: 20,
          lastInboundAt: null,
        },
      ]);
      repository.replaceHotPickBatch.mockResolvedValue({ count: 1 });
      const openaiService = {
        rerankTriageCandidates: jest.fn().mockResolvedValue([
          {
            externalId: 'hot-2',
            reason: 'More recent reciprocal attention',
            suggestedAction: 'Reply to their recent post.',
          },
        ]),
      };
      const contextDocumentService = {
        listAttachedDocumentsForIntegration: jest.fn().mockResolvedValue([]),
      };
      const service = new ChannelInteractionService(
        repository as any,
        undefined,
        undefined,
        undefined,
        openaiService as any,
        contextDocumentService as any
      );

      await service.materializeHotPicksForIntegration('org', 'integration');

      expect(openaiService.rerankTriageCandidates).toHaveBeenCalledWith(
        expect.objectContaining({
          triage: 'hot',
          candidates: expect.arrayContaining([
            expect.objectContaining({ externalId: 'hot-1' }),
            expect.objectContaining({ externalId: 'hot-2' }),
          ]),
        })
      );
      expect(repository.replaceHotPickBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'ai',
          picks: [
            expect.objectContaining({
              counterpartyExternalId: 'hot-2',
              rulesRank: 2,
              finalRank: 1,
              aiRank: 1,
              source: 'ai',
            }),
          ],
        })
      );
    } finally {
      if (previousEnabled === undefined) {
        delete process.env.TRIAGE_AI_RERANK_ENABLED;
      } else {
        process.env.TRIAGE_AI_RERANK_ENABLED = previousEnabled;
      }
      if (previousApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousApiKey;
      }
    }
  });

  it('falls back to rules when Hot AI is invalid or errors, and completes an empty AI batch', async () => {
    const previousEnabled = process.env.TRIAGE_AI_RERANK_ENABLED;
    const previousApiKey = process.env.OPENAI_API_KEY;
    process.env.TRIAGE_AI_RERANK_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';
    try {
      const repository = createRepository();
      repository.listHotRulesCandidates.mockResolvedValue([
        {
          externalId: 'hot-1',
          name: 'Hot One',
          username: 'hotone',
          bio: null,
          relationshipNetGap: 10,
          relationshipReciprocationScore: 10,
          lastInboundAt: null,
        },
      ]);
      repository.replaceHotPickBatch.mockResolvedValue({ count: 1 });
      const openaiService = {
        rerankTriageCandidates: jest
          .fn()
          .mockResolvedValueOnce([
            {
              externalId: 'unknown',
              reason: 'Not in the rules pool',
              suggestedAction: 'Do something.',
            },
          ])
          .mockRejectedValueOnce(new Error('timeout'))
          .mockResolvedValueOnce([]),
      };
      const service = new ChannelInteractionService(
        repository as any,
        undefined,
        undefined,
        undefined,
        openaiService as any,
        {
          listAttachedDocumentsForIntegration: jest.fn().mockResolvedValue([]),
        } as any
      );

      await service.materializeHotPicksForIntegration('org', 'integration');
      await service.materializeHotPicksForIntegration('org', 'integration');
      repository.replaceHotPickBatch.mockResolvedValueOnce({ count: 0 });
      await service.materializeHotPicksForIntegration('org', 'integration');

      expect(repository.replaceHotPickBatch.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          source: 'rules',
          picks: [expect.objectContaining({ counterpartyExternalId: 'hot-1' })],
        })
      );
      expect(repository.replaceHotPickBatch.mock.calls[1][0]).toEqual(
        expect.objectContaining({ source: 'rules' })
      );
      expect(repository.replaceHotPickBatch.mock.calls[2][0]).toEqual(
        expect.objectContaining({ source: 'ai', picks: [] })
      );
    } finally {
      if (previousEnabled === undefined) {
        delete process.env.TRIAGE_AI_RERANK_ENABLED;
      } else {
        process.env.TRIAGE_AI_RERANK_ENABLED = previousEnabled;
      }
      if (previousApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousApiKey;
      }
    }
  });

  it('records AI provenance on Cultivate picks', async () => {
    const previousEnabled = process.env.TRIAGE_AI_RERANK_ENABLED;
    const previousApiKey = process.env.OPENAI_API_KEY;
    process.env.TRIAGE_AI_RERANK_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';
    try {
      const repository = createRepository();
      repository.listCultivateCandidates.mockResolvedValue([
        {
          externalId: 'warm-1',
          name: 'n'.repeat(161),
          username: 'u'.repeat(161),
          bio: 'b'.repeat(1_001),
        },
      ]);
      repository.rankCultivateCandidates.mockReturnValue([
        {
          externalId: 'warm-1',
          name: 'n'.repeat(161),
          username: 'u'.repeat(161),
          bio: 'b'.repeat(1_001),
          rulesRank: 1,
          finalRank: 1,
          rulesReason: 'r'.repeat(501),
        },
      ]);
      repository.upsertCultivatePicks.mockResolvedValue({ count: 1 });
      const openaiService = {
        rerankTriageCandidates: jest.fn().mockResolvedValue([
          {
            externalId: 'warm-1',
            reason: 'A warm mutual relationship needs attention',
            suggestedAction: 'Reply to their latest update.',
          },
        ]),
      };
      const service = new ChannelInteractionService(
        repository as any,
        undefined,
        undefined,
        undefined,
        openaiService as any,
        {
          listAttachedDocumentsForIntegration: jest.fn().mockResolvedValue([]),
        } as any
      );

      await service.materializeCultivatePicksForIntegration('org', 'integration');

      expect(openaiService.rerankTriageCandidates).toHaveBeenCalledWith(
        expect.objectContaining({
          candidates: [
            {
              externalId: 'warm-1',
              name: 'n'.repeat(160),
              username: 'u'.repeat(160),
              bio: 'b'.repeat(1_000),
              rulesReason: 'r'.repeat(500),
            },
          ],
        })
      );
      expect(repository.upsertCultivatePicks).toHaveBeenCalledWith(
        expect.objectContaining({
          picks: [
            expect.objectContaining({
              counterpartyExternalId: 'warm-1',
              aiRank: 1,
              aiReason: 'A warm mutual relationship needs attention',
              suggestedAction: 'Reply to their latest update.',
              source: 'ai',
            }),
          ],
        })
      );
    } finally {
      if (previousEnabled === undefined) {
        delete process.env.TRIAGE_AI_RERANK_ENABLED;
      } else {
        process.env.TRIAGE_AI_RERANK_ENABLED = previousEnabled;
      }
      if (previousApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousApiKey;
      }
    }
  });

  it('scores unscored leads from attached channel documents', async () => {
    const repository = createRepository();
    repository.listUnscoredLeadExternalIds.mockResolvedValue([
      {
        externalId: 'lead-1',
        name: 'Lead One',
        username: 'leadone',
        bio: 'Builds developer tools',
        followersCount: 1200,
        followingCount: 80,
        leadBridgesAsLead: [
          {
            bridgeRelationshipGrade: 4.2,
            bridgeMember: { username: 'warmbridge' },
          },
        ],
      },
    ]);
    const openaiService = {
      scoreLeadFit: jest.fn().mockResolvedValue({
        score: 81,
        reason: 'Strong tech overlap',
        concerns: [],
        matchedTopics: ['developer tools'],
        model: 'gpt-4.1',
        version: 2,
      }),
    };
    const contextDocumentService = {
      listAttachedDocumentsForIntegration: jest.fn().mockResolvedValue([
        { name: 'audience.md', content: 'We serve software founders.' },
      ]),
    };
    repository.listLeadFitFeedbackExamples.mockResolvedValue({
      rejected: [
        {
          counterpartyExternalId: 'reject-1',
          name: 'Rejected',
          username: 'rej',
          bio: 'NFT coach',
          reasons: ['bio_wording'],
        },
      ],
      accepted: [
        {
          counterpartyExternalId: 'accept-1',
          name: 'Accepted',
          username: 'acc',
          bio: 'Open source maintainer',
          reasons: [],
        },
      ],
    });
    const service = new ChannelInteractionService(
      repository as any,
      undefined,
      undefined,
      undefined,
      openaiService as any,
      contextDocumentService as any
    );

    await expect(
      service.scoreLeadFitBatch({
        organizationId: 'org',
        integrationId: 'integration',
        externalIds: ['lead-1', 'lead-2'],
      })
    ).resolves.toEqual({ scored: 1, skipped: 1 });
    expect(openaiService.scoreLeadFit).toHaveBeenCalledWith(
      expect.objectContaining({
        channelDocuments: [
          { name: 'audience.md', content: 'We serve software founders.' },
        ],
        candidate: expect.objectContaining({
          username: 'leadone',
          bio: 'Builds developer tools',
        }),
        rejectedExamples: [
          expect.objectContaining({
            bio: 'NFT coach',
            reasons: ['bio_wording'],
          }),
        ],
        acceptedExamples: [
          expect.objectContaining({
            bio: 'Open source maintainer',
          }),
        ],
      })
    );
    expect(repository.updateAudienceLeadFit).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: 'lead-1',
        leadFitScore: 81,
        leadFitReason: 'Strong tech overlap',
        leadFitModel: 'gpt-4.1',
        leadFitVersion: 2,
      })
    );
  });

  it('leaves leads unscored when AI scoring fails', async () => {
    const repository = createRepository();
    repository.listUnscoredLeadExternalIds.mockResolvedValue([
      {
        externalId: 'lead-1',
        name: 'Lead One',
        username: 'leadone',
        bio: null,
        followersCount: null,
        followingCount: null,
        leadBridgesAsLead: [],
      },
    ]);
    const openaiService = {
      scoreLeadFit: jest.fn().mockRejectedValue(new Error('timeout')),
    };
    const contextDocumentService = {
      listAttachedDocumentsForIntegration: jest.fn().mockResolvedValue([]),
    };
    const service = new ChannelInteractionService(
      repository as any,
      undefined,
      undefined,
      undefined,
      openaiService as any,
      contextDocumentService as any
    );

    await expect(
      service.scoreLeadFitBatch({
        organizationId: 'org',
        integrationId: 'integration',
        externalIds: ['lead-1'],
      })
    ).resolves.toEqual({ scored: 0, skipped: 1 });
    expect(repository.updateAudienceLeadFit).not.toHaveBeenCalled();
  });

  it('scores backlog leads for an integration regardless of a provided id list', async () => {
    const repository = createRepository();
    repository.listUnscoredLeadCandidatesForIntegration.mockResolvedValue([
      {
        externalId: 'inbound-1',
        name: 'Inbound One',
        username: 'inboundone',
        bio: 'Anti-MAGA atheist maker',
        followersCount: 300,
        followingCount: 120,
        leadBridgesAsLead: [],
      },
    ]);
    const openaiService = {
      scoreLeadFit: jest.fn().mockResolvedValue({
        score: 12,
        reason: 'Directly opposes the channel stance',
        concerns: ['political mismatch'],
        matchedTopics: [],
        model: 'gpt-4.1',
        version: 2,
      }),
    };
    const contextDocumentService = {
      listAttachedDocumentsForIntegration: jest
        .fn()
        .mockResolvedValue([{ name: 'audience.md', content: 'Atheist, anti-MAGA.' }]),
    };
    const service = new ChannelInteractionService(
      repository as any,
      undefined,
      undefined,
      undefined,
      openaiService as any,
      contextDocumentService as any
    );

    await expect(
      service.scoreUnscoredLeadsForIntegration({
        organizationId: 'org',
        integrationId: 'integration',
      })
    ).resolves.toEqual({ scored: 1, candidates: 1 });
    expect(
      repository.listUnscoredLeadCandidatesForIntegration
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org',
        integrationId: 'integration',
      })
    );
    expect(repository.updateAudienceLeadFit).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: 'inbound-1', leadFitScore: 12 })
    );
  });

  it('does not score when no attached documents and no backlog exist', async () => {
    const repository = createRepository();
    repository.listUnscoredLeadCandidatesForIntegration.mockResolvedValue([]);
    const openaiService = { scoreLeadFit: jest.fn() };
    const contextDocumentService = {
      listAttachedDocumentsForIntegration: jest.fn(),
    };
    const service = new ChannelInteractionService(
      repository as any,
      undefined,
      undefined,
      undefined,
      openaiService as any,
      contextDocumentService as any
    );

    await expect(
      service.scoreUnscoredLeadsForIntegration({
        organizationId: 'org',
        integrationId: 'integration',
      })
    ).resolves.toEqual({ scored: 0, candidates: 0 });
    expect(openaiService.scoreLeadFit).not.toHaveBeenCalled();
  });

  it('clears discovered leads and matching redis crawl keys for an admin burst', async () => {
    const repository = createRepository();
    repository.clearAllDiscoveredLeads = jest.fn().mockResolvedValue({
      bridgesDeleted: 4,
      orphansDeleted: 2,
      integrationIds: ['integration-a'],
    });
    (ioRedis.scan as jest.Mock)
      .mockResolvedValueOnce([
        '0',
        ['lead-bridge-crawl:integration-a:2026-08-22'],
      ])
      .mockResolvedValueOnce(['0', ['lead-bridge-cursor:integration-a']]);
    (ioRedis.del as jest.Mock)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    const service = new ChannelInteractionService(repository as any);

    await expect(
      service.clearAllDiscoveredLeadsForAdminBurst()
    ).resolves.toEqual({
      bridgesDeleted: 4,
      orphansDeleted: 2,
      integrationIds: ['integration-a'],
      redisKeysDeleted: 2,
    });
    expect(ioRedis.scan).toHaveBeenCalledWith(
      '0',
      'MATCH',
      'lead-bridge-crawl:*',
      'COUNT',
      100
    );
    expect(ioRedis.del).toHaveBeenCalledWith(
      'lead-bridge-crawl:integration-a:2026-08-22'
    );
    expect(ioRedis.del).toHaveBeenCalledWith(
      'lead-bridge-cursor:integration-a'
    );
  });

  it('ignores the daily crawl cap during an admin burst crawl', async () => {
    const repository = createRepository();
    repository.getNextWarmFollowerForLeadBridge = jest.fn().mockResolvedValue({
      externalId: 'warm-1',
      relationshipGrade: 4.2,
    });
    repository.applyLeadBridgeDiscoveries = jest.fn().mockResolvedValue({
      applied: 20,
      skipped: 0,
      appliedExternalIds: Array.from({ length: 20 }, (_, i) => `lead-${i}`),
    });
    (ioRedis.get as jest.Mock).mockResolvedValue('5');
    const memberFollowers = jest.fn().mockResolvedValue({
      items: Array.from({ length: 25 }, (_, i) => ({
        id: `lead-${i}`,
        name: `Lead ${i}`,
        bio: `bio-${i}`,
        followersCount: 100 - i,
      })),
    });
    const manager = {
      getSocialIntegration: jest.fn().mockReturnValue({ memberFollowers }),
    };
    const service = new ChannelInteractionService(
      repository as any,
      manager as any
    );

    await expect(
      service.crawlLeadBridgesForIntegration(
        {
          id: 'integration',
          organizationId: 'org',
          providerIdentifier: 'x',
          token: 'token',
        } as any,
        { ignoreDailyLimit: true, maxApplied: 20 }
      )
    ).resolves.toEqual(
      expect.objectContaining({
        skipped: false,
        processed: 1,
        applied: 20,
      })
    );
    expect(repository.applyLeadBridgeDiscoveries).toHaveBeenCalledWith(
      expect.objectContaining({ maxApplied: 20 })
    );
    expect(ioRedis.incr).not.toHaveBeenCalled();
  });
});
