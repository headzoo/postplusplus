jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
  socialIntegrationList: [],
}));

import { ChannelCultivateActivity } from './channel-cultivate.activity';

describe('ChannelCultivateActivity', () => {
  const hour = '2026-08-25T13';
  const candidate = {
    id: 'integration-1',
    organizationId: 'org-1',
    providerIdentifier: 'x',
  };

  const createActivity = (
    repository: {
      listCultivateMaterializeCandidates: jest.Mock;
    },
    channelInteractionService: {
      materializeCultivatePicksForIntegration: jest.Mock;
    },
    integrationService: {
      getIntegrationById: jest.Mock;
    },
    logs: {
      append: jest.Mock;
    } = { append: jest.fn().mockResolvedValue(undefined) }
  ) =>
    new ChannelCultivateActivity(
      repository as any,
      channelInteractionService as any,
      integrationService as any,
      logs as any
    );

  it('lists one due candidate for the fixed hour and logs it', async () => {
    const logs = { append: jest.fn().mockResolvedValue(undefined) };
    const repository = {
      listCultivateMaterializeCandidates: jest.fn().mockResolvedValue({
        candidates: [candidate],
        next: undefined,
      }),
    };
    const activity = createActivity(
      repository,
      { materializeCultivatePicksForIntegration: jest.fn() },
      { getIntegrationById: jest.fn() },
      logs
    );

    const result = await activity.listDueCandidatesV2({ hour });

    expect(repository.listCultivateMaterializeCandidates).toHaveBeenCalledWith(
      undefined,
      8,
      hour
    );
    expect(result.candidates).toEqual([candidate]);
    expect(result.hour).toBe(hour);
    expect(logs.append).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleKey: 'follower-cultivate',
        message: `Found due channel ${candidate.id} for cultivate`,
        meta: {
          hour,
          after: null,
          candidateCount: 1,
          scanned: 1,
        },
      })
    );
  });

  it('logs when no due channels remain', async () => {
    const logs = { append: jest.fn().mockResolvedValue(undefined) };
    const repository = {
      listCultivateMaterializeCandidates: jest.fn().mockResolvedValue({
        candidates: [],
        next: undefined,
      }),
    };
    const activity = createActivity(
      repository,
      { materializeCultivatePicksForIntegration: jest.fn() },
      { getIntegrationById: jest.fn() },
      logs
    );

    await activity.listDueCandidatesV2({ hour, after: 'prev-id' });

    expect(logs.append).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleKey: 'follower-cultivate',
        message: 'No due channels for cultivate',
        meta: {
          hour,
          after: 'prev-id',
          candidateCount: 0,
          scanned: 0,
        },
      })
    );
  });

  it('skips disabled integrations without calling the service and logs', async () => {
    const logs = { append: jest.fn().mockResolvedValue(undefined) };
    const integrationService = {
      getIntegrationById: jest.fn().mockResolvedValue({
        id: candidate.id,
        organizationId: candidate.organizationId,
        disabled: true,
        deletedAt: null,
      }),
    };
    const channelInteractionService = {
      materializeCultivatePicksForIntegration: jest.fn(),
    };
    const activity = createActivity(
      { listCultivateMaterializeCandidates: jest.fn() },
      channelInteractionService,
      integrationService,
      logs
    );

    const result = await activity.materializeCultivatePicksV2({
      hour,
      candidate,
    });

    expect(result).toEqual({
      skipped: true,
      hour,
      pickCount: 0,
      candidateCount: 0,
    });
    expect(
      channelInteractionService.materializeCultivatePicksForIntegration
    ).not.toHaveBeenCalled();
    expect(logs.append).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleKey: 'follower-cultivate',
        message: `Skipped disabled/deleted channel ${candidate.id} for cultivate`,
      })
    );
  });

  it('materializes picks for an enabled integration and logs success', async () => {
    const logs = { append: jest.fn().mockResolvedValue(undefined) };
    const integrationService = {
      getIntegrationById: jest.fn().mockResolvedValue({
        id: candidate.id,
        organizationId: candidate.organizationId,
        disabled: false,
        deletedAt: null,
      }),
    };
    const channelInteractionService = {
      materializeCultivatePicksForIntegration: jest.fn().mockResolvedValue({
        hour,
        skipped: false,
        candidateCount: 12,
        pickCount: 8,
        storedCount: 8,
        visibleCount: 8,
        excludedCount: 0,
        audit: {
          hour,
          storedCount: 8,
          visibleCount: 8,
          excludedCount: 0,
          excludedByReason: {},
          excluded: [],
        },
      }),
    };
    const activity = createActivity(
      { listCultivateMaterializeCandidates: jest.fn() },
      channelInteractionService,
      integrationService,
      logs
    );

    const result = await activity.materializeCultivatePicksV2({
      hour,
      candidate,
    });

    expect(
      channelInteractionService.materializeCultivatePicksForIntegration
    ).toHaveBeenCalledWith(
      candidate.organizationId,
      candidate.id,
      new Date(`${hour}:00:00.000Z`)
    );
    expect(result).toEqual({
      skipped: false,
      hour,
      candidateCount: 12,
      pickCount: 8,
      visibleCount: 8,
      excludedCount: 0,
    });
    expect(logs.append).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleKey: 'follower-cultivate',
        message: `Cultivate picks for channel ${candidate.id}: stored=8 candidates=12 visible=8`,
        meta: expect.objectContaining({
          hour,
          integrationId: candidate.id,
          pickCount: 8,
          storedCount: 8,
          candidateCount: 12,
          visibleCount: 8,
          excludedCount: 0,
        }),
      })
    );
  });

  it('logs a cultivate visibility audit when stored picks are excluded at read time', async () => {
    const logs = { append: jest.fn().mockResolvedValue(undefined) };
    const integrationService = {
      getIntegrationById: jest.fn().mockResolvedValue({
        id: candidate.id,
        organizationId: candidate.organizationId,
        disabled: false,
        deletedAt: null,
      }),
    };
    const channelInteractionService = {
      materializeCultivatePicksForIntegration: jest.fn().mockResolvedValue({
        hour,
        skipped: false,
        candidateCount: 10,
        pickCount: 10,
        storedCount: 10,
        visibleCount: 2,
        excludedCount: 8,
        audit: {
          hour,
          storedCount: 10,
          visibleCount: 2,
          excludedCount: 8,
          excludedByReason: { recently_contacted: 8 },
          excluded: [
            {
              externalId: 'cult-1',
              username: 'one',
              reason: 'recently_contacted',
              relationshipTriage: 'mutual',
            },
          ],
        },
      }),
    };
    const activity = createActivity(
      { listCultivateMaterializeCandidates: jest.fn() },
      channelInteractionService,
      integrationService,
      logs
    );

    await activity.materializeCultivatePicksV2({ hour, candidate });

    expect(logs.append).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleKey: 'follower-cultivate',
        message: `Cultivate visibility audit for channel ${candidate.id}: stored=10 visible=2 excluded=8`,
        meta: expect.objectContaining({
          storedCount: 10,
          visibleCount: 2,
          excludedCount: 8,
          excludedByReason: { recently_contacted: 8 },
        }),
      })
    );
  });

  it('returns a structured near-full skip result and logs', async () => {
    const logs = { append: jest.fn().mockResolvedValue(undefined) };
    const integrationService = {
      getIntegrationById: jest.fn().mockResolvedValue({
        id: candidate.id,
        organizationId: candidate.organizationId,
        disabled: false,
        deletedAt: null,
      }),
    };
    const channelInteractionService = {
      materializeCultivatePicksForIntegration: jest.fn().mockResolvedValue({
        hour,
        skipped: 'near_full',
        visibleCount: 18,
      }),
    };
    const activity = createActivity(
      { listCultivateMaterializeCandidates: jest.fn() },
      channelInteractionService,
      integrationService,
      logs
    );

    const result = await activity.materializeCultivatePicksV2({
      hour,
      candidate,
    });

    expect(result).toEqual({
      skipped: true,
      reason: 'near_full',
      hour,
      visibleCount: 18,
      pickCount: 0,
      candidateCount: 0,
    });
    expect(logs.append).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleKey: 'follower-cultivate',
        message: `Cultivate near-full for channel ${candidate.id}`,
        meta: expect.objectContaining({
          reason: 'near_full',
          visibleCount: 18,
        }),
      })
    );
  });

  it('logs and rethrows when materialization fails', async () => {
    const logs = { append: jest.fn().mockResolvedValue(undefined) };
    const integrationService = {
      getIntegrationById: jest.fn().mockResolvedValue({
        id: candidate.id,
        organizationId: candidate.organizationId,
        disabled: false,
        deletedAt: null,
      }),
    };
    const channelInteractionService = {
      materializeCultivatePicksForIntegration: jest
        .fn()
        .mockRejectedValue(new Error('db unavailable')),
    };
    const activity = createActivity(
      { listCultivateMaterializeCandidates: jest.fn() },
      channelInteractionService,
      integrationService,
      logs
    );

    await expect(
      activity.materializeCultivatePicksV2({ hour, candidate })
    ).rejects.toThrow('db unavailable');
    expect(logs.append).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleKey: 'follower-cultivate',
        level: 'ERROR',
        message: `Cultivate materialization failed for channel ${candidate.id}`,
        meta: expect.objectContaining({ error: 'db unavailable' }),
      })
    );
  });
});
