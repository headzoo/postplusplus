import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PostRulesService } from './post-rules.service';
import { PostRulesRepository } from './post-rules.repository';

jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
}));

describe('PostRulesService', () => {
  const baseRule = {
    id: 'rule-1',
    name: 'Remove low performers',
    enabled: true,
    action: 'REMOVE' as const,
    initialDelayHours: 24,
    evaluationIntervalHours: null,
    maxEvaluations: null,
    conditionMatch: 'ANY' as const,
    conditions: [
      { metric: 'LIKES' as const, operator: 'LT' as const, threshold: 5 },
    ],
    actionConfig: {},
    rescheduleConfig: null,
    maxRescheduleAttempts: null,
    integrations: [{ integrationId: 'channel-1' }],
    pipelines: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  const capabilities = {
    x: {
      actions: ['REMOVE', 'AUTO_REPOST', 'AUTO_PLUG', 'NOTIFY'],
      metrics: ['LIKES', 'REPLIES'],
    },
    linkedin: {
      actions: ['REMOVE'],
      metrics: ['LIKES'],
    },
  };

  const createService = () => {
    const repository = {
      list: jest.fn(),
      getById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      setEnabled: jest.fn(),
      replaceAssignments: jest.fn(),
      getIntegrationsForAssignment: jest.fn(),
      getPipelinesForAssignment: jest.fn(),
      getPipelineRescheduleTarget: jest.fn(),
      assertUniqueIds: PostRulesRepository.prototype.assertUniqueIds,
    };
    const integrationManager = {
      getPostRulesCapabilities: jest.fn().mockReturnValue(capabilities),
    };
    const service = new PostRulesService(
      repository as any,
      integrationManager as any
    );

    return { service, repository, integrationManager };
  };

  it('returns capability metadata for editors and pickers', () => {
    const { service } = createService();

    expect(service.getCapabilities()).toEqual({
      actions: [
        {
          key: 'REMOVE',
          label: 'Remove post',
          metrics: [
            { key: 'LIKES', label: 'Likes' },
            { key: 'REPLIES', label: 'Replies' },
          ],
        },
        {
          key: 'AUTO_REPOST',
          label: 'Auto repost',
          metrics: [
            { key: 'LIKES', label: 'Likes' },
            { key: 'REPLIES', label: 'Replies' },
          ],
        },
        {
          key: 'AUTO_PLUG',
          label: 'Auto plug',
          metrics: [
            { key: 'LIKES', label: 'Likes' },
            { key: 'REPLIES', label: 'Replies' },
          ],
        },
        {
          key: 'NOTIFY',
          label: 'Send notification',
          metrics: [
            { key: 'LIKES', label: 'Likes' },
            { key: 'REPLIES', label: 'Replies' },
          ],
        },
      ],
      providers: [
        {
          providerIdentifier: 'x',
          actions: ['REMOVE', 'AUTO_REPOST', 'AUTO_PLUG', 'NOTIFY'],
          metrics: ['LIKES', 'REPLIES'],
        },
        {
          providerIdentifier: 'linkedin',
          actions: ['REMOVE'],
          metrics: ['LIKES'],
        },
      ],
    });
  });

  it('includes assigned channel ids in list items', async () => {
    const { service, repository } = createService();
    repository.list.mockResolvedValue([
      {
        ...baseRule,
        integrations: [
          { integrationId: 'channel-1' },
          { integrationId: 'channel-2' },
        ],
        _count: { integrations: 2, pipelines: 0 },
      },
    ]);

    await expect(service.list('org-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'rule-1',
        integrationIds: ['channel-1', 'channel-2'],
        integrationCount: 2,
        pipelineCount: 0,
      }),
    ]);
  });

  it('rejects cross-organization rule access', async () => {
    const { service, repository } = createService();
    repository.getById.mockResolvedValue(null);

    await expect(service.getById('org-1', 'rule-1')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('rejects unsupported channel metrics during assignment replacement', async () => {
    const { service, repository } = createService();
    repository.getById.mockResolvedValue({
      ...baseRule,
      conditions: [{ metric: 'REPLIES', operator: 'LT', threshold: 1 }],
    });
    repository.getIntegrationsForAssignment.mockResolvedValue([
      {
        id: 'channel-1',
        providerIdentifier: 'linkedin',
        disabled: false,
        deletedAt: null,
      },
    ]);
    repository.getPipelinesForAssignment.mockResolvedValue([]);

    await expect(
      service.replaceAssignments('org-1', 'rule-1', {
        integrationIds: ['channel-1'],
        pipelineIds: [],
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects pipelines without eligible channels', async () => {
    const { service, repository } = createService();
    repository.getById.mockResolvedValue(baseRule);
    repository.getIntegrationsForAssignment.mockResolvedValue([]);
    repository.getPipelinesForAssignment.mockResolvedValue([
      {
        id: 'pipeline-1',
        active: true,
        deletedAt: null,
        integrations: [
          {
            integration: {
              id: 'channel-2',
              providerIdentifier: 'linkedin',
              disabled: true,
              deletedAt: null,
            },
          },
        ],
      },
    ]);

    await expect(
      service.replaceAssignments('org-1', 'rule-1', {
        integrationIds: [],
        pipelineIds: ['pipeline-1'],
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects updates that invalidate existing assignments', async () => {
    const { service, repository } = createService();
    repository.getById.mockResolvedValue(baseRule);
    repository.getIntegrationsForAssignment.mockResolvedValue([
      {
        id: 'channel-1',
        providerIdentifier: 'linkedin',
        disabled: false,
        deletedAt: null,
      },
    ]);
    repository.getPipelinesForAssignment.mockResolvedValue([]);

    await expect(
      service.update('org-1', 'rule-1', {
        ...baseRule,
        conditions: [{ metric: 'REPLIES', operator: 'LT', threshold: 1 }],
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows multiple same-action rules and toggles enabled state', async () => {
    const { service, repository } = createService();
    repository.setEnabled.mockResolvedValue({
      ...baseRule,
      enabled: false,
    });

    await expect(
      service.setEnabled('org-1', 'rule-1', { enabled: false })
    ).resolves.toMatchObject({
      id: 'rule-1',
      enabled: false,
    });
  });

  it('validates pipeline reschedule targets on create', async () => {
    const { service, repository } = createService();
    repository.getPipelineRescheduleTarget.mockResolvedValue(null);

    await expect(
      service.create('org-1', {
        name: 'Reschedule rule',
        action: 'REMOVE',
        initialDelayHours: 12,
        conditionMatch: 'ANY',
        conditions: [],
        rescheduleConfig: {
          mode: 'PIPELINE',
          pipelineId: 'missing',
        },
        maxRescheduleAttempts: 2,
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
