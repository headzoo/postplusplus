jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager { },
  socialIntegrationList: [],
}));

import { ChannelHotMaterializationActivity } from './channel-hot-materialization.activity';

describe('ChannelHotMaterializationActivity', () => {
  const hour = '2026-08-25T13';
  const candidate = {
    id: 'integration-1',
    organizationId: 'org-1',
    providerIdentifier: 'x',
  };

  const createActivity = (
    repository: {
      listHotMaterializeCandidates: jest.Mock;
    },
    channelInteractionService: {
      materializeHotPicksForIntegration: jest.Mock;
    },
    integrationService: {
      getIntegrationById: jest.Mock;
    },
    logs: {
      append: jest.Mock;
    } = { append: jest.fn().mockResolvedValue(undefined) }
  ) =>
    new ChannelHotMaterializationActivity(
      repository as any,
      channelInteractionService as any,
      integrationService as any,
      logs as any
    );

  it('lists one due candidate for the fixed hour and logs it', async () => {
    const logs = { append: jest.fn().mockResolvedValue(undefined) };
    const repository = {
      listHotMaterializeCandidates: jest.fn().mockResolvedValue({
        candidates: [candidate],
        next: undefined,
      }),
    };
    const activity = createActivity(
      repository,
      { materializeHotPicksForIntegration: jest.fn() },
      { getIntegrationById: jest.fn() },
      logs
    );

    const result = await activity.listDueCandidatesV1({ hour });

    expect(repository.listHotMaterializeCandidates).toHaveBeenCalledWith(
      undefined,
      8,
      hour
    );
    expect(result.candidates).toEqual([candidate]);
    expect(result.hour).toBe(hour);
    expect(logs.append).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleKey: 'hot-triage',
        message: `Found due channel ${candidate.id} for hot triage`,
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
      listHotMaterializeCandidates: jest.fn().mockResolvedValue({
        candidates: [],
        next: undefined,
      }),
    };
    const activity = createActivity(
      repository,
      { materializeHotPicksForIntegration: jest.fn() },
      { getIntegrationById: jest.fn() },
      logs
    );

    await activity.listDueCandidatesV1({ hour, after: 'prev-id' });

    expect(logs.append).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleKey: 'hot-triage',
        message: 'No due channels for hot triage',
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
      materializeHotPicksForIntegration: jest.fn(),
    };
    const activity = createActivity(
      { listHotMaterializeCandidates: jest.fn() },
      channelInteractionService,
      integrationService,
      logs
    );

    const result = await activity.materializeHotPicksV1({ hour, candidate });

    expect(result).toEqual({
      skipped: true,
      hour,
      pickCount: 0,
      candidateCount: 0,
    });
    expect(
      channelInteractionService.materializeHotPicksForIntegration
    ).not.toHaveBeenCalled();
    expect(logs.append).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleKey: 'hot-triage',
        message: `Skipped disabled/deleted channel ${candidate.id} for hot triage`,
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
      materializeHotPicksForIntegration: jest.fn().mockResolvedValue({
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
      { listHotMaterializeCandidates: jest.fn() },
      channelInteractionService,
      integrationService,
      logs
    );

    const result = await activity.materializeHotPicksV1({ hour, candidate });

    expect(
      channelInteractionService.materializeHotPicksForIntegration
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
        scheduleKey: 'hot-triage',
        message: `Hot picks for channel ${candidate.id}: stored=8 candidates=12 visible=8`,
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

  it('logs a hot visibility audit when stored picks are excluded at read time', async () => {
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
      materializeHotPicksForIntegration: jest.fn().mockResolvedValue({
        hour,
        skipped: false,
        candidateCount: 17,
        pickCount: 17,
        storedCount: 17,
        visibleCount: 3,
        excludedCount: 14,
        audit: {
          hour,
          storedCount: 17,
          visibleCount: 3,
          excludedCount: 14,
          excludedByReason: { dismissed: 14 },
          excluded: [
            {
              externalId: 'hot-1',
              username: 'one',
              reason: 'dismissed',
              relationshipTriage: 'hot_lead',
            },
          ],
        },
      }),
    };
    const activity = createActivity(
      { listHotMaterializeCandidates: jest.fn() },
      channelInteractionService,
      integrationService,
      logs
    );

    await activity.materializeHotPicksV1({ hour, candidate });

    expect(logs.append).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleKey: 'hot-triage',
        message: `Hot visibility audit for channel ${candidate.id}: stored=17 visible=3 excluded=14`,
        meta: expect.objectContaining({
          storedCount: 17,
          visibleCount: 3,
          excludedCount: 14,
          excludedByReason: { dismissed: 14 },
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
      materializeHotPicksForIntegration: jest.fn().mockResolvedValue({
        hour,
        skipped: 'near_full',
        visibleCount: 18,
      }),
    };
    const activity = createActivity(
      { listHotMaterializeCandidates: jest.fn() },
      channelInteractionService,
      integrationService,
      logs
    );

    const result = await activity.materializeHotPicksV1({ hour, candidate });

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
        scheduleKey: 'hot-triage',
        message: `Hot triage near-full for channel ${candidate.id}`,
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
      materializeHotPicksForIntegration: jest
        .fn()
        .mockRejectedValue(new Error('db unavailable')),
    };
    const activity = createActivity(
      { listHotMaterializeCandidates: jest.fn() },
      channelInteractionService,
      integrationService,
      logs
    );

    await expect(
      activity.materializeHotPicksV1({ hour, candidate })
    ).rejects.toThrow('db unavailable');
    expect(logs.append).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleKey: 'hot-triage',
        level: 'ERROR',
        message: `Hot materialization failed for channel ${candidate.id}`,
        meta: expect.objectContaining({ error: 'db unavailable' }),
      })
    );
  });
});
