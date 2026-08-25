jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
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
    }
  ) =>
    new ChannelHotMaterializationActivity(
      repository as any,
      channelInteractionService as any,
      integrationService as any
    );

  it('lists one due candidate for the fixed hour', async () => {
    const repository = {
      listHotMaterializeCandidates: jest.fn().mockResolvedValue({
        candidates: [candidate],
        next: undefined,
      }),
    };
    const activity = createActivity(
      repository,
      { materializeHotPicksForIntegration: jest.fn() },
      { getIntegrationById: jest.fn() }
    );

    const result = await activity.listDueCandidatesV1({ hour });

    expect(repository.listHotMaterializeCandidates).toHaveBeenCalledWith(
      undefined,
      8,
      hour
    );
    expect(result.candidates).toEqual([candidate]);
    expect(result.hour).toBe(hour);
  });

  it('skips disabled integrations without calling the service', async () => {
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
      integrationService
    );

    const result = await activity.materializeHotPicksV1({ hour, candidate });

    expect(result).toEqual({
      skipped: true,
      hour,
      pickCount: 0,
      candidateCount: 0,
    });
    expect(channelInteractionService.materializeHotPicksForIntegration).not.toHaveBeenCalled();
  });

  it('materializes picks for an enabled integration', async () => {
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
      }),
    };
    const activity = createActivity(
      { listHotMaterializeCandidates: jest.fn() },
      channelInteractionService,
      integrationService
    );

    const result = await activity.materializeHotPicksV1({ hour, candidate });

    expect(channelInteractionService.materializeHotPicksForIntegration).toHaveBeenCalledWith(
      candidate.organizationId,
      candidate.id,
      new Date(`${hour}:00:00.000Z`)
    );
    expect(result).toEqual({
      skipped: false,
      hour,
      candidateCount: 12,
      pickCount: 8,
    });
  });

  it('returns a structured near-full skip result', async () => {
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
      integrationService
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
  });
});
