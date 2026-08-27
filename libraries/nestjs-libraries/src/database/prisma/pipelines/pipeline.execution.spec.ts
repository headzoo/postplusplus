jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
}));

import { PipelineExecutionRepository } from './pipeline.execution.repository';
import { PipelinePlugRepository } from './pipeline.plug.repository';
import { PipelinePlugService } from './pipeline.plug.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const scheduledFor = '2026-08-10T10:00:00.000Z';
const request = {
  pipelineId: 'pipeline',
  scheduleRevision: 3,
  scheduledFor,
  nowUtc: '2026-08-10T10:01:00.000Z',
};

const pipeline = (overrides: Record<string, unknown> = {}) => ({
  id: 'pipeline',
  active: true,
  deletedAt: null,
  timezone: 'UTC',
  scheduleRevision: 3,
  updatedAt: new Date('2026-08-09T00:00:00.000Z'),
  scheduleSlots: [{ dayOfWeek: 1, minuteOfDay: 600 }],
  integrations: [
    {
      integrationId: 'integration',
      integration: {
        id: 'integration',
        disabled: false,
        deletedAt: null,
      },
    },
  ],
  ...overrides,
});

const queueItem = () => ({
  id: 'item-1',
  posts: [
    {
      id: 'post-1',
      organizationId: 'org',
      integrationId: 'integration',
      parentPostId: null,
      state: 'DRAFT',
      integration: { providerIdentifier: 'x-twitter' },
    },
  ],
});

describe('Pipeline execution', () => {
  const plugMetadata = {
    getAllPlugs: () => [
      {
        identifier: 'x',
        plugs: [
          {
            methodName: 'autoRepostPost',
            runEveryMilliseconds: 1000,
            totalRuns: 3,
            fields: [{ name: 'likesAmount' }],
          },
        ],
      },
    ],
  };

  it('uses Pipeline plugs exclusively when a post retains Pipeline provenance', async () => {
    const pipelinePlugs = {
      getPostPipelineScope: jest.fn().mockResolvedValue({
        organizationId: 'org',
        pipelineQueueItem: { pipelineId: 'pipeline' },
      }),
      getActiveForExecution: jest
        .fn()
        .mockResolvedValue([
          { id: 'pipeline-plug', plugFunction: 'autoRepostPost' },
        ]),
    };
    const channelPlugs = { getPlugs: jest.fn() };
    const service = new PipelinePlugService(
      pipelinePlugs as any,
      channelPlugs as any,
      plugMetadata as any
    );

    await expect(
      service.resolveGlobalPlugs('post', 'integration', 'x')
    ).resolves.toEqual([
      {
        type: 'global',
        source: 'pipeline',
        plugId: 'pipeline-plug',
        delay: 1000,
        totalRuns: 3,
      },
    ]);
    expect(channelPlugs.getPlugs).not.toHaveBeenCalled();

    pipelinePlugs.getActiveForExecution.mockResolvedValueOnce([]);
    await expect(
      service.resolveGlobalPlugs('post', 'integration', 'x')
    ).resolves.toEqual([]);
    expect(channelPlugs.getPlugs).not.toHaveBeenCalled();
  });

  it('falls back to channel plugs only for posts without Pipeline provenance', async () => {
    const pipelinePlugs = {
      getPostPipelineScope: jest.fn().mockResolvedValue({
        organizationId: 'org',
        pipelineQueueItem: null,
      }),
    };
    const channelPlugs = {
      getPlugs: jest
        .fn()
        .mockResolvedValue([
          { id: 'channel-plug', plugFunction: 'autoRepostPost' },
        ]),
    };
    const service = new PipelinePlugService(
      pipelinePlugs as any,
      channelPlugs as any,
      plugMetadata as any
    );

    await expect(
      service.resolveGlobalPlugs('post', 'integration', 'x')
    ).resolves.toEqual([
      expect.objectContaining({ source: 'channel', plugId: 'channel-plug' }),
    ]);
    expect(channelPlugs.getPlugs).toHaveBeenCalledWith('org', 'integration');
  });

  it('requires configured integrations and exact provider field definitions', async () => {
    const pipelinePlugs = {
      getPipelineIntegration: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue({
          integrations: [{ integration: { providerIdentifier: 'x' } }],
        }),
      upsert: jest.fn(),
    };
    const service = new PipelinePlugService(
      pipelinePlugs as any,
      {} as any,
      plugMetadata as any
    );

    await expect(
      service.upsert('org', 'pipeline', 'integration', {
        func: 'autoRepostPost',
        fields: [{ name: 'likesAmount', value: '10' }],
      })
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.upsert('org', 'pipeline', 'integration', {
        func: 'unknown',
        fields: [],
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.upsert('org', 'pipeline', 'integration', {
        func: 'autoRepostPost',
        fields: [{ name: 'unknown', value: '10' }],
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(pipelinePlugs.upsert).not.toHaveBeenCalled();
  });

  it('does not retain a Pipeline plug when membership is removed during an upsert', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: 'pipeline' })
      .mockResolvedValueOnce(null);
    const upsert = jest.fn().mockResolvedValue({
      id: 'plug',
      activated: true,
    });
    let attempt = 0;
    const repository = new PipelinePlugRepository(
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      {
        model: {
          $transaction: jest.fn(async (callback: any, options: any) => {
            expect(options.isolationLevel).toBe('Serializable');
            const result = await callback({
              pipeline: { findFirst },
              pipelinePlug: { upsert },
            });
            attempt++;
            if (attempt === 1) {
              throw { code: 'P2034' };
            }
            return result;
          }),
        },
      } as any
    );

    await expect(
      repository.upsert('org', 'pipeline', 'integration', {
        func: 'autoRepostPost',
        fields: [{ name: 'likesAmount', value: '10' }],
      })
    ).resolves.toBeNull();

    expect(findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'pipeline',
        organizationId: 'org',
        deletedAt: null,
        integrations: { some: { integrationId: 'integration' } },
      },
      select: { id: true },
    });
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('returns not found when Pipeline membership is lost during an upsert', async () => {
    const pipelinePlugs = {
      getPipelineIntegration: jest.fn().mockResolvedValue({
        integrations: [{ integration: { providerIdentifier: 'x' } }],
      }),
      upsert: jest.fn().mockResolvedValue(null),
    };
    const service = new PipelinePlugService(
      pipelinePlugs as any,
      {} as any,
      plugMetadata as any
    );

    await expect(
      service.upsert('org', 'pipeline', 'integration', {
        func: 'autoRepostPost',
        fields: [{ name: 'likesAmount', value: '10' }],
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('activates plugs only through a current non-deleted Pipeline assignment', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      integrationId: 'integration',
    });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const repository = new PipelinePlugRepository(
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      {
        model: {
          $transaction: jest.fn(async (callback: any, options: any) => {
            expect(options.isolationLevel).toBe('Serializable');
            return callback({
              pipelinePlug: { findFirst, updateMany },
            });
          }),
        },
      } as any
    );

    await expect(
      repository.activate('org', 'pipeline', 'plug', false)
    ).resolves.toEqual({
      count: 1,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'plug',
        pipelineId: 'pipeline',
        organizationId: 'org',
        pipeline: {
          is: {
            id: 'pipeline',
            organizationId: 'org',
            deletedAt: null,
          },
        },
      },
      select: { integrationId: true },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'plug',
        pipelineId: 'pipeline',
        integrationId: 'integration',
        organizationId: 'org',
        pipeline: {
          is: {
            id: 'pipeline',
            organizationId: 'org',
            deletedAt: null,
            integrations: { some: { integrationId: 'integration' } },
          },
        },
      },
      data: { activated: false },
    });
  });

  it.each([
    'cross-organization plug',
    'soft-deleted Pipeline',
    'removed Pipeline integration',
  ])('reports %s activation attempts as not found', async () => {
    const updateMany = jest.fn();
    const repository = new PipelinePlugRepository(
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      {
        model: {
          $transaction: jest.fn((callback: any) =>
            callback({
              pipelinePlug: {
                findFirst: jest.fn().mockResolvedValue(null),
                updateMany,
              },
            })
          ),
        },
      } as any
    );
    const service = new PipelinePlugService(
      repository,
      {} as any,
      plugMetadata as any
    );

    await expect(
      service.activate('org', 'pipeline', 'plug', false)
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('claims one logical item once when two claims race', async () => {
    let execution: any;
    const item = queueItem();
    const tx = {
      pipeline: { findUnique: jest.fn().mockResolvedValue(pipeline()) },
      pipelineSlotExecution: {
        findUnique: jest.fn(async () =>
          execution ? { ...execution, pipelineQueueItem: item } : null
        ),
        create: jest.fn(async ({ data }) => {
          execution = { id: 'execution', ...data };
          return execution;
        }),
      },
      pipelineQueueItem: {
        findFirst: jest.fn().mockResolvedValue(item),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      post: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    let lock = Promise.resolve();
    const transaction = {
      model: {
        $transaction: jest.fn((run: (value: any) => any) => {
          const result = lock.then(() => run(tx));
          lock = result.then(
            () => undefined,
            () => undefined
          );
          return result;
        }),
      },
    };
    const repository = new PipelineExecutionRepository(
      { model: {} } as any,
      transaction as any
    );

    const [first, second] = await Promise.all([
      repository.claimSlot(request),
      repository.claimSlot(request),
    ]);

    expect(first.outcome).toBe('CLAIMED');
    expect(second).toMatchObject({
      outcome: 'CLAIMED',
      executionId: 'execution',
      replayed: true,
    });
    expect(tx.pipelineQueueItem.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.pipelineSlotExecution.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['paused', pipeline({ active: false }), 'INACTIVE'],
    ['stale revision', pipeline({ scheduleRevision: 4 }), 'STALE_REVISION'],
    [
      'configuration changed after the slot',
      pipeline({ updatedAt: new Date('2026-08-10T10:00:30.000Z') }),
      'STALE_REVISION',
    ],
  ])(
    'skips %s candidates without reading the queue',
    async (_, value, reason) => {
      const tx = {
        pipeline: { findUnique: jest.fn().mockResolvedValue(value) },
        pipelineSlotExecution: {
          upsert: jest.fn().mockResolvedValue({ id: 'skipped' }),
        },
        pipelineQueueItem: { findFirst: jest.fn() },
      };
      const repository = new PipelineExecutionRepository(
        { model: {} } as any,
        {
          model: {
            $transaction: (run: (value: any) => any) => run(tx),
          },
        } as any
      );

      await expect(repository.claimSlot(request)).resolves.toMatchObject({
        outcome: 'SKIPPED',
        reason,
      });
      expect(tx.pipelineQueueItem.findFirst).not.toHaveBeenCalled();
    }
  );

  it('records an empty slot without consuming content', async () => {
    const tx = {
      pipeline: { findUnique: jest.fn().mockResolvedValue(pipeline()) },
      pipelineSlotExecution: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'empty-slot' }),
      },
      pipelineQueueItem: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const repository = new PipelineExecutionRepository(
      { model: {} } as any,
      { model: { $transaction: (run: (value: any) => any) => run(tx) } } as any
    );

    await expect(repository.claimSlot(request)).resolves.toMatchObject({
      outcome: 'SKIPPED',
      reason: 'EMPTY',
    });
  });

  it('does not discover occurrences beyond the outage grace window', async () => {
    const findMany = jest.fn().mockResolvedValue([pipeline()]);
    const repository = new PipelineExecutionRepository(
      { model: { pipeline: { findMany } } } as any,
      {} as any,
      {
        model: {
          pipelineSlotExecution: { findMany: jest.fn().mockResolvedValue([]) },
        },
      } as any
    );

    await expect(
      repository.discoverDueSlots({
        nowUtc: '2026-08-10T10:02:01.000Z',
        maximumCandidates: 100,
      })
    ).resolves.toEqual({ candidates: [] });
  });

  it('projects each current weekly slot in chronological order without catch-up', async () => {
    const repository = new PipelineExecutionRepository(
      {
        model: {
          pipeline: {
            findMany: jest.fn().mockResolvedValue([
              pipeline({
                id: 'later',
                scheduleSlots: [{ dayOfWeek: 1, minuteOfDay: 601 }],
              }),
              pipeline({
                id: 'first',
                scheduleSlots: [{ dayOfWeek: 1, minuteOfDay: 600 }],
              }),
            ]),
          },
        },
      } as any,
      {} as any,
      {
        model: {
          pipelineSlotExecution: { findMany: jest.fn().mockResolvedValue([]) },
        },
      } as any
    );

    await expect(
      repository.discoverDueSlots({
        nowUtc: '2026-08-10T10:01:00.000Z',
        maximumCandidates: 100,
      })
    ).resolves.toEqual({
      candidates: [
        {
          occurrenceId: 'pipeline:first:3:2026-08-10T10:00:00.000Z',
          pipelineId: 'first',
          scheduleRevision: 3,
          scheduledFor: '2026-08-10T10:00:00.000Z',
        },
        {
          occurrenceId: 'pipeline:later:3:2026-08-10T10:01:00.000Z',
          pipelineId: 'later',
          scheduleRevision: 3,
          scheduledFor: '2026-08-10T10:01:00.000Z',
        },
      ],
    });
  });

  it('excludes dispatched slots and pages remaining simultaneous candidates', async () => {
    const pipelines = Array.from({ length: 102 }, (_, index) =>
      pipeline({ id: `pipeline-${String(index).padStart(3, '0')}` })
    );
    const findMany = jest.fn().mockResolvedValue(pipelines);
    const repository = new PipelineExecutionRepository(
      { model: { pipeline: { findMany } } } as any,
      {} as any,
      {
        model: {
          pipelineSlotExecution: {
            findMany: jest.fn().mockResolvedValue([
              {
                pipelineId: 'pipeline-000',
                scheduledFor: new Date(scheduledFor),
              },
            ]),
          },
        },
      } as any
    );

    const first = await repository.discoverDueSlots({
      nowUtc: '2026-08-10T10:01:00.000Z',
      maximumCandidates: 100,
    });
    const second = await repository.discoverDueSlots({
      nowUtc: '2026-08-10T10:01:00.000Z',
      maximumCandidates: 100,
      after: first.next,
    });

    expect(first.candidates).toHaveLength(100);
    expect(first.candidates[0].pipelineId).toBe('pipeline-001');
    expect(first.next).toEqual({
      pipelineId: 'pipeline-100',
      scheduledFor,
    });
    expect(second.candidates).toMatchObject([
      { pipelineId: 'pipeline-101', scheduledFor },
    ]);
  });

  it('fails before provider execution when an integration is disabled', async () => {
    const item = queueItem();
    const tx = {
      pipeline: {
        findUnique: jest.fn().mockResolvedValue(
          pipeline({
            integrations: [
              {
                integrationId: 'integration',
                integration: { disabled: true, deletedAt: null },
              },
            ],
          })
        ),
      },
      pipelineSlotExecution: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'failed-execution' }),
      },
      pipelineQueueItem: {
        findFirst: jest.fn().mockResolvedValue(item),
        update: jest.fn().mockResolvedValue(item),
      },
    };
    const repository = new PipelineExecutionRepository(
      { model: {} } as any,
      { model: { $transaction: (run: (value: any) => any) => run(tx) } } as any
    );

    await expect(repository.claimSlot(request)).resolves.toMatchObject({
      outcome: 'FAILED',
      roots: [],
    });
  });

  it('finalizes partial multi-channel failure and remains retry-safe', async () => {
    const execution = {
      id: 'execution',
      status: 'CLAIMED',
      pipelineQueueItemId: 'item',
      pipelineQueueItem: {
        posts: [
          { state: 'PUBLISHED', error: null },
          { state: 'ERROR', error: 'Provider rejected the post' },
        ],
      },
    };
    const tx = {
      pipelineSlotExecution: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(execution)
          .mockResolvedValueOnce({ ...execution, status: 'FAILED' }),
        update: jest.fn().mockResolvedValue({}),
      },
      pipelineQueueItem: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repository = new PipelineExecutionRepository(
      { model: {} } as any,
      { model: { $transaction: (run: (value: any) => any) => run(tx) } } as any
    );

    await expect(repository.finalizeSlot('execution')).resolves.toEqual({
      outcome: 'FAILED',
      reason: 'Provider rejected the post',
    });
    await expect(repository.finalizeSlot('execution')).resolves.toEqual({
      outcome: 'NOOP',
    });
  });

  it('claims every channel root but preserves thread children for the post workflow', async () => {
    const item = {
      id: 'item',
      posts: [
        queueItem().posts[0],
        {
          ...queueItem().posts[0],
          id: 'thread-child',
          parentPostId: 'post-1',
        },
        {
          ...queueItem().posts[0],
          id: 'post-2',
          integrationId: 'integration-2',
          integration: { providerIdentifier: 'linkedin-page' },
        },
      ],
    };
    const tx = {
      pipeline: {
        findUnique: jest.fn().mockResolvedValue(
          pipeline({
            integrations: [
              {
                integrationId: 'integration',
                integration: { disabled: false, deletedAt: null },
              },
              {
                integrationId: 'integration-2',
                integration: { disabled: false, deletedAt: null },
              },
            ],
          })
        ),
      },
      pipelineSlotExecution: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'execution' }),
      },
      pipelineQueueItem: {
        findFirst: jest.fn().mockResolvedValue(item),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      post: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
    };
    const repository = new PipelineExecutionRepository(
      { model: {} } as any,
      { model: { $transaction: (run: (value: any) => any) => run(tx) } } as any
    );

    await expect(repository.claimSlot(request)).resolves.toMatchObject({
      outcome: 'CLAIMED',
      roots: [
        { postId: 'post-1', taskQueue: 'x' },
        { postId: 'post-2', taskQueue: 'linkedin' },
      ],
    });
    expect(tx.post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: 'QUEUE',
          publishDate: new Date(scheduledFor),
        }),
      })
    );
  });

  it('fails changed queue content before dispatching any roots', async () => {
    const tx = {
      pipeline: { findUnique: jest.fn().mockResolvedValue(pipeline()) },
      pipelineSlotExecution: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'failed-execution' }),
      },
      pipelineQueueItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'item',
          posts: [
            { ...queueItem().posts[0], integrationId: 'different-channel' },
          ],
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      post: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const repository = new PipelineExecutionRepository(
      { model: {} } as any,
      { model: { $transaction: (run: (value: any) => any) => run(tx) } } as any
    );

    await expect(repository.claimSlot(request)).resolves.toMatchObject({
      outcome: 'FAILED',
      roots: [],
      reason:
        'Pipeline queue content no longer matches its configured integrations',
    });
  });
});
