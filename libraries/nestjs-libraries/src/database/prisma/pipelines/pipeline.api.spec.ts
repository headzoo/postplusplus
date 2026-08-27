import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class PostsService {} })
);
jest.mock('@gitroom/nestjs-libraries/dtos/posts/create.post.dto', () => ({
  CreatePostDto: class CreatePostDto {},
}));
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  socialIntegrationList: [
    { identifier: 'x', editor: 'normal', stripLinks: () => false },
    { identifier: 'linkedin', editor: 'normal', stripLinks: () => false },
  ],
}));

import { PipelineManager } from './pipeline.manager';
import { PipelineRepository } from './pipeline.repository';
import { PipelineService } from './pipeline.service';
import {
  CreatePipelineDto,
  MovePipelineScheduleSlotDto,
} from '@gitroom/nestjs-libraries/dtos/pipelines/pipeline.dto';

describe('Pipeline API boundaries', () => {
  it('stops Pipeline feeds before soft-deleting a Pipeline', async () => {
    const repository = {
      getPipeline: jest.fn().mockResolvedValue({ id: 'pipeline' }),
      deletePipeline: jest.fn().mockResolvedValue({ id: 'pipeline' }),
    };
    const autopostService = {
      disablePipelineAutoposts: jest.fn().mockResolvedValue([]),
    };
    const service = new PipelineService(
      repository as any,
      {} as any,
      autopostService as any
    );

    await expect(service.deletePipeline('org', 'pipeline')).resolves.toEqual({
      id: 'pipeline',
      detached: true,
    });
    expect(autopostService.disablePipelineAutoposts).toHaveBeenCalledWith(
      'org',
      'pipeline'
    );
    expect(repository.deletePipeline).toHaveBeenCalledWith('org', 'pipeline');
  });

  it('returns credential-free composer data for every queued channel', async () => {
    const twitter = {
      id: 'twitter',
      name: 'Twitter',
      providerIdentifier: 'x',
      token: 'must-not-leak',
      refreshToken: 'must-not-leak',
      organizationId: 'organization',
      internalId: 'internal',
      disabled: false,
      inBetweenSteps: false,
      refreshNeeded: false,
      postingTimes: '[{"time":60}]',
      profile: 'Twitter profile',
      type: 'SOCIAL',
      picture: null,
      additionalSettings: '[]',
      customer: null,
    };
    const linkedin = {
      ...twitter,
      id: 'linkedin',
      name: 'LinkedIn',
      providerIdentifier: 'linkedin',
      postingTimes: 'not-json',
      profile: 'LinkedIn profile',
    };
    const repository = {
      getPipelines: jest.fn().mockResolvedValue([
        {
          id: 'pipeline',
          name: 'Weekly content',
          timezone: 'UTC',
          color: '#612BD3',
          active: true,
          scheduleRevision: 1,
          integrations: [{ integration: twitter }, { integration: linkedin }],
          contextDocuments: [
            {
              contextDocument: {
                id: 'doc-b',
                name: 'Brand guide',
                fileSize: 2048,
                updatedAt: new Date('2026-08-10T12:00:00.000Z'),
                content: 'must-not-leak',
              },
            },
            {
              contextDocument: {
                id: 'doc-a',
                name: 'Audience notes',
                fileSize: 1024,
                updatedAt: new Date('2026-08-09T12:00:00.000Z'),
                content: 'must-not-leak',
              },
            },
            {
              contextDocument: {
                id: 'legacy-skill',
                name: 'campaign-review.skill.md',
                fileSize: 4096,
                updatedAt: new Date('2026-08-11T12:00:00.000Z'),
                content: 'must-not-leak',
              },
            },
          ],
          scheduleSlots: [],
          _count: { queueItems: 1 },
        },
      ]),
      getPipeline: jest.fn().mockResolvedValue({
        id: 'pipeline',
        name: 'Weekly content',
        timezone: 'UTC',
        color: '#612BD3',
        active: true,
        scheduleRevision: 1,
        scheduleSlots: [],
        integrations: [{ integration: twitter }, { integration: linkedin }],
        contextDocuments: [
          {
            contextDocument: {
              id: 'doc-b',
              name: 'Brand guide',
              fileSize: 2048,
              updatedAt: new Date('2026-08-10T12:00:00.000Z'),
              content: 'must-not-leak',
            },
          },
          {
            contextDocument: {
              id: 'doc-a',
              name: 'Audience notes',
              fileSize: 1024,
              updatedAt: new Date('2026-08-09T12:00:00.000Z'),
              content: 'must-not-leak',
            },
          },
          {
            contextDocument: {
              id: 'legacy-skill',
              name: 'campaign-review.skill.md',
              fileSize: 4096,
              updatedAt: new Date('2026-08-11T12:00:00.000Z'),
              content: 'must-not-leak',
            },
          },
        ],
        queueItems: [
          {
            id: 'item',
            group: 'group',
            status: 'QUEUED',
            position: 1024,
            error: null,
            posts: [
              {
                id: 'twitter-root',
                parentPostId: null,
                content: 'Twitter root',
                delay: 0,
                state: 'DRAFT',
                intervalInDays: null,
                settings: '{"audience":"all"}',
                image: '[{"id":"media","path":"image.jpg"}]',
                tags: [],
                integration: twitter,
              },
              {
                id: 'twitter-thread',
                parentPostId: 'twitter-root',
                content: 'Twitter thread',
                delay: 5,
                state: 'DRAFT',
                intervalInDays: null,
                settings: '{"audience":"all"}',
                image: '[]',
                tags: [],
                integration: twitter,
              },
              {
                id: 'linkedin-root',
                parentPostId: null,
                content: 'LinkedIn root',
                delay: 0,
                state: 'DRAFT',
                intervalInDays: null,
                settings: '{}',
                image: '[]',
                tags: [],
                integration: linkedin,
              },
            ],
          },
        ],
      }),
    };
    const service = new PipelineService(repository as any, {} as any);
    const list = await service.getPipelines('organization');
    const detail = await service.getPipeline('organization', 'pipeline');

    expect(list[0]).toMatchObject({ color: '#612BD3' });
    expect(detail).toMatchObject({ color: '#612BD3' });
    expect(list[0].contextDocuments).toEqual([
      {
        id: 'doc-a',
        name: 'Audience notes',
        description: null,
        fileSize: 1024,
        updatedAt: new Date('2026-08-09T12:00:00.000Z'),
      },
      {
        id: 'doc-b',
        name: 'Brand guide',
        description: null,
        fileSize: 2048,
        updatedAt: new Date('2026-08-10T12:00:00.000Z'),
      },
    ]);
    expect(detail.contextDocuments).toEqual(list[0].contextDocuments);
    expect(detail.blockedContextDocuments).toEqual([
      {
        id: 'legacy-skill',
        name: 'campaign-review.skill.md',
        fileSize: 4096,
        updatedAt: new Date('2026-08-11T12:00:00.000Z'),
      },
    ]);
    expect(list[0].channels).toEqual([
      expect.objectContaining({ id: 'twitter', identifier: 'x' }),
      expect.objectContaining({ id: 'linkedin', identifier: 'linkedin' }),
    ]);
    expect(detail).toMatchObject({
      channels: [
        expect.objectContaining({
          id: 'twitter',
          identifier: 'x',
          editor: expect.any(String),
          time: [{ time: 60 }],
        }),
        expect.objectContaining({
          id: 'linkedin',
          identifier: 'linkedin',
          editor: expect.any(String),
          time: [],
        }),
      ],
      queueItems: [
        expect.objectContaining({
          posts: [
            expect.objectContaining({
              id: 'twitter-root',
              settings: { audience: 'all' },
              image: [{ id: 'media', path: 'image.jpg' }],
            }),
            expect.objectContaining({
              id: 'twitter-thread',
              parentPostId: 'twitter-root',
            }),
            expect.objectContaining({
              id: 'linkedin-root',
              parentPostId: null,
            }),
          ],
        }),
      ],
    });
    expect(JSON.stringify(list)).not.toContain('must-not-leak');
    expect(JSON.stringify(detail)).not.toContain('must-not-leak');
    expect(JSON.stringify(detail.contextDocuments)).not.toContain(
      'legacy-skill'
    );
    expect(JSON.stringify(detail)).not.toContain('"organizationId"');
    expect(JSON.stringify(detail)).not.toContain('"internalId"');
  });

  it('rejects skill documents before creating pipeline assignments', async () => {
    const repository = {
      getOwnedIntegrations: jest.fn().mockResolvedValue([{ id: 'channel' }]),
      getOwnedContextDocuments: jest
        .fn()
        .mockResolvedValue([{ id: 'skill', name: 'campaign-review.skill.md' }]),
      createPipeline: jest.fn(),
    };
    const service = new PipelineService(repository as any, {} as any);

    await expect(
      service.createPipeline('org', {
        name: 'Pipeline',
        timezone: 'UTC',
        integrations: [{ id: 'channel' }],
        contextDocumentIds: ['skill'],
      })
    ).rejects.toMatchObject({
      message: 'Agent skills cannot be attached as pipeline context documents',
    });
    expect(repository.createPipeline).not.toHaveBeenCalled();
  });

  it('projects the composer enqueue slot after queued items', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-09T00:00:00.000Z'));
    const scheduleSlots = [
      { dayOfWeek: 0, minuteOfDay: 60 },
      { dayOfWeek: 1, minuteOfDay: 60 },
    ];
    const pipeline = (id: string, queueCount: number, active = true) => ({
      id,
      name: id,
      timezone: 'UTC',
      color: '#612BD3',
      active,
      scheduleRevision: 1,
      integrations: [],
      contextDocuments: [],
      scheduleSlots,
      _count: { queueItems: queueCount },
    });
    const repository = {
      getPipelines: jest
        .fn()
        .mockResolvedValue([
          pipeline('empty', 0),
          pipeline('queued', 2),
          pipeline('paused', 2, false),
        ]),
    };
    const service = new PipelineService(repository as any, {} as any);

    await expect(service.getPipelines('org')).resolves.toEqual([
      expect.objectContaining({
        id: 'empty',
        queueCount: 0,
        nextSlot: new Date('2026-08-09T01:00:00.000Z'),
        projectedEnqueueFor: new Date('2026-08-09T01:00:00.000Z'),
      }),
      expect.objectContaining({
        id: 'queued',
        queueCount: 2,
        nextSlot: new Date('2026-08-09T01:00:00.000Z'),
        projectedEnqueueFor: new Date('2026-08-16T01:00:00.000Z'),
      }),
      expect.objectContaining({
        id: 'paused',
        queueCount: 2,
        nextSlot: undefined,
        projectedEnqueueFor: undefined,
      }),
    ]);
    jest.useRealTimers();
  });

  it('publishes a queue item only after every draft row is linked', async () => {
    const queueItem = { id: 'item', status: 'CREATING' };
    const drafts = [
      { id: 'root', parentPostId: null, integrationId: 'channel' },
      { id: 'thread-child', parentPostId: 'root', integrationId: 'channel' },
    ];
    let claimableDuringLink = false;
    const transaction = {
      model: {
        $transaction: jest.fn(async (callback: any, options: any) => {
          expect(options.isolationLevel).toBe('Serializable');
          return callback({
            pipeline: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'pipeline',
                integrations: [{ integrationId: 'channel' }],
              }),
            },
            pipelineQueueItem: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockImplementation(async () => queueItem),
              update: jest.fn().mockImplementation(async ({ data }) => {
                Object.assign(queueItem, data);
                return queueItem;
              }),
            },
            post: {
              findMany: jest.fn().mockResolvedValue(drafts),
              updateMany: jest.fn().mockImplementation(async () => {
                claimableDuringLink = queueItem.status === 'QUEUED';
                return { count: drafts.length };
              }),
            },
          });
        }),
      },
    };
    const repository = new PipelineRepository(
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      transaction as any
    );

    await expect(
      repository.publishQueueItem('org', 'pipeline', 'group')
    ).resolves.toMatchObject({
      id: 'item',
    });
    expect(claimableDuringLink).toBe(false);
    expect(queueItem.status).toBe('QUEUED');
  });

  it('rejects integration changes when queued content exists', async () => {
    const repository = {
      getOwnedIntegrations: jest.fn().mockResolvedValue([{ id: 'channel' }]),
      updatePipeline: jest.fn().mockResolvedValue(false),
    };
    const service = new PipelineService(repository as any, {} as any);

    await expect(
      service.updatePipeline('org', 'pipeline', {
        name: 'Pipeline',
        timezone: 'UTC',
        integrations: [{ id: 'channel' }],
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates Pipelines without schedule rows and preserves schedules during metadata updates', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'pipeline' });
    const update = jest
      .fn()
      .mockResolvedValue({ id: 'pipeline', scheduleRevision: 3 });
    const transaction = {
      model: {
        $transaction: jest.fn(async (callback: any) =>
          callback({
            pipeline: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'pipeline',
                integrations: [{ integrationId: 'channel' }],
              }),
              pipelineQueueItem: undefined,
              update,
            },
            pipelineQueueItem: { findFirst: jest.fn().mockResolvedValue(null) },
          })
        ),
      },
    };
    const repository = new PipelineRepository(
      { model: { pipeline: { create } } } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      transaction as any
    );
    const body = {
      name: 'Pipeline',
      timezone: 'UTC',
      integrations: [{ id: 'channel' }],
    };

    await repository.createPipeline('org', body);
    await repository.updatePipeline('org', 'pipeline', body);

    expect(create).toHaveBeenCalledWith({
      data: expect.not.objectContaining({ scheduleSlots: expect.anything() }),
    });
    expect(create.mock.calls[0][0].data).not.toHaveProperty('color');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'pipeline' },
      data: {
        name: 'Pipeline',
        timezone: 'UTC',
      },
    });
    expect(update.mock.calls[0][0].data).not.toHaveProperty('color');
  });

  it('persists supplied colors on create and update while preserving omitted updates', async () => {
    const create = jest
      .fn()
      .mockResolvedValue({ id: 'pipeline', color: '#FF5500' });
    const update = jest
      .fn()
      .mockResolvedValue({
        id: 'pipeline',
        color: '#00AAFF',
        scheduleRevision: 3,
      });
    const transaction = {
      model: {
        $transaction: jest.fn(async (callback: any) =>
          callback({
            pipeline: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'pipeline',
                integrations: [{ integrationId: 'channel' }],
              }),
              update,
            },
            pipelineQueueItem: { findFirst: jest.fn().mockResolvedValue(null) },
          })
        ),
      },
    };
    const repository = new PipelineRepository(
      { model: { pipeline: { create } } } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      transaction as any
    );
    const withColor = {
      name: 'Pipeline',
      timezone: 'UTC',
      integrations: [{ id: 'channel' }],
      color: '#FF5500',
    };
    const withoutColor = {
      name: 'Pipeline',
      timezone: 'UTC',
      integrations: [{ id: 'channel' }],
    };

    await repository.createPipeline('org', withColor);
    await repository.updatePipeline('org', 'pipeline', withColor);
    await repository.updatePipeline('org', 'pipeline', withoutColor);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ color: '#FF5500' }),
    });
    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: 'pipeline' },
      data: expect.objectContaining({ color: '#FF5500' }),
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: 'pipeline' },
      data: {
        name: 'Pipeline',
        timezone: 'UTC',
      },
    });
    expect(update.mock.calls[1][0].data).not.toHaveProperty('color');
  });

  it('rejects invalid pipeline color formats at the DTO boundary', () => {
    const invalidColors = [
      'purple',
      '#612',
      '#612BD3AA',
      'rgb(1,2,3)',
      '#GGGGGG',
    ];
    for (const color of invalidColors) {
      const dto = plainToInstance(CreatePipelineDto, {
        name: 'Pipeline',
        timezone: 'UTC',
        integrations: [{ id: 'channel' }],
        color,
      });
      const errors = validateSync(dto);
      expect(errors.some((error) => error.property === 'color')).toBe(true);
    }

    const validDto = plainToInstance(CreatePipelineDto, {
      name: 'Pipeline',
      timezone: 'UTC',
      integrations: [{ id: 'channel' }],
      color: '#aabbcc',
    });
    expect(validateSync(validDto)).toHaveLength(0);
  });

  it('does not increment scheduleRevision for color-only metadata updates', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'pipeline',
      color: '#FF5500',
      scheduleRevision: 3,
    });
    const transaction = {
      model: {
        $transaction: jest.fn(async (callback: any) =>
          callback({
            pipeline: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'pipeline',
                integrations: [{ integrationId: 'channel' }],
              }),
              update,
            },
            pipelineQueueItem: { findFirst: jest.fn().mockResolvedValue(null) },
          })
        ),
      },
    };
    const repository = new PipelineRepository(
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      transaction as any
    );

    await repository.updatePipeline('org', 'pipeline', {
      name: 'Pipeline',
      timezone: 'UTC',
      integrations: [{ id: 'channel' }],
      color: '#FF5500',
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'pipeline' },
      data: expect.objectContaining({
        color: '#FF5500',
        name: 'Pipeline',
        timezone: 'UTC',
      }),
    });
    expect(update.mock.calls[0][0].data).not.toHaveProperty('scheduleRevision');
    expect(update.mock.calls[0][0].data).not.toHaveProperty('scheduleSlots');
  });

  it('projects pipelineColor on calendar posts within the requested range', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-09T00:00:00.000Z'));
    const repository = {
      getActivePipelinesForCalendar: jest.fn().mockResolvedValue([
        {
          id: 'pipeline',
          color: '#FF5500',
          timezone: 'UTC',
          scheduleSlots: [{ dayOfWeek: 0, minuteOfDay: 60 }],
          queueItems: [
            {
              id: 'item',
              group: 'group',
              posts: [
                {
                  id: 'post',
                  content: 'Queued post',
                  state: 'DRAFT',
                  tags: [],
                  integration: {
                    id: 'channel',
                    providerIdentifier: 'x',
                    name: 'Twitter',
                    picture: null,
                    customer: null,
                  },
                },
              ],
            },
          ],
        },
      ]),
    };
    const service = new PipelineService(repository as any, {} as any);

    await expect(
      service.getCalendarPosts(
        'organization',
        '2026-08-09T00:00:00.000Z',
        '2026-08-10T00:00:00.000Z'
      )
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'post',
        pipelineId: 'pipeline',
        pipelineColor: '#FF5500',
        publishDate: '2026-08-09T01:00:00.000Z',
      }),
    ]);
    jest.useRealTimers();
  });

  it('replaces schedules once and rejects duplicate slots', async () => {
    const updatePipelineSchedule = jest.fn().mockResolvedValue({
      id: 'pipeline',
      scheduleRevision: 2,
      scheduleSlots: [],
    });
    const repository = {
      updatePipelineSchedule,
    };
    const service = new PipelineService(repository as any, {} as any);

    await expect(
      service.updatePipelineSchedule('org', 'pipeline', { scheduleSlots: [] })
    ).resolves.toMatchObject({ scheduleRevision: 2, scheduleSlots: [] });
    expect(updatePipelineSchedule).toHaveBeenCalledWith('org', 'pipeline', []);

    await expect(
      service.updatePipelineSchedule('org', 'pipeline', {
        scheduleSlots: [
          { dayOfWeek: 1, minuteOfDay: 60 },
          { dayOfWeek: 1, minuteOfDay: 60 },
        ],
      })
    ).rejects.toMatchObject({
      message: 'Pipeline schedule slots must be unique',
    });
  });

  it('atomically clears schedule rows while incrementing its revision once', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'pipeline',
      scheduleRevision: 2,
      scheduleSlots: [],
    });
    const transaction = {
      model: {
        $transaction: jest.fn(async (callback: any) =>
          callback({
            pipeline: {
              findFirst: jest.fn().mockResolvedValue({ id: 'pipeline' }),
              update,
            },
          })
        ),
      },
    };
    const repository = new PipelineRepository(
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      transaction as any
    );

    await expect(
      repository.updatePipelineSchedule('org', 'pipeline', [])
    ).resolves.toMatchObject({ scheduleRevision: 2, scheduleSlots: [] });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'pipeline' },
      data: {
        scheduleRevision: { increment: 1 },
        scheduleSlots: { deleteMany: {}, create: [] },
      },
      include: {
        scheduleSlots: {
          orderBy: [{ dayOfWeek: 'asc' }, { minuteOfDay: 'asc' }],
        },
      },
    });
  });

  it('strips persisted schedule slot fields before recreating rows', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'pipeline',
      scheduleRevision: 2,
      scheduleSlots: [{ dayOfWeek: 1, minuteOfDay: 610 }],
    });
    const transaction = {
      model: {
        $transaction: jest.fn(async (callback: any) =>
          callback({
            pipeline: {
              findFirst: jest.fn().mockResolvedValue({ id: 'pipeline' }),
              update,
            },
          })
        ),
      },
    };
    const repository = new PipelineRepository(
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      transaction as any
    );

    await repository.updatePipelineSchedule('org', 'pipeline', [
      {
        id: 'slot-id',
        pipelineId: 'pipeline',
        dayOfWeek: 3,
        minuteOfDay: 540,
        createdAt: '2026-08-10T13:23:42.960Z',
        updatedAt: '2026-08-10T13:23:42.960Z',
      } as any,
      { dayOfWeek: 1, minuteOfDay: 610 },
    ]);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'pipeline' },
      data: {
        scheduleRevision: { increment: 1 },
        scheduleSlots: {
          deleteMany: {},
          create: [
            { dayOfWeek: 3, minuteOfDay: 540 },
            { dayOfWeek: 1, minuteOfDay: 610 },
          ],
        },
      },
      include: {
        scheduleSlots: {
          orderBy: [{ dayOfWeek: 'asc' }, { minuteOfDay: 'asc' }],
        },
      },
    });
  });

  it('returns active and paused schedule occurrences only from the requested organization', async () => {
    const repository = {
      getPipelinesForSchedule: jest.fn().mockResolvedValue([
        {
          id: 'active-pipeline',
          name: 'Active Pipeline',
          timezone: 'UTC',
          color: '#FF5500',
          active: true,
          scheduleRevision: 3,
          scheduleSlots: [{ dayOfWeek: 0, minuteOfDay: 60 }],
        },
        {
          id: 'paused-pipeline',
          name: 'Paused Pipeline',
          timezone: 'America/New_York',
          color: '#00AAFF',
          active: false,
          scheduleRevision: 4,
          scheduleSlots: [{ dayOfWeek: 0, minuteOfDay: 9 * 60 }],
        },
      ]),
    };
    const service = new PipelineService(repository as any, {} as any);

    await expect(
      service.getPipelineSchedule('organization', {
        startDate: '2026-08-09T00:00:00.000Z',
        endDate: '2026-08-10T00:00:00.000Z',
      })
    ).resolves.toEqual([
      {
        id: 'active-pipeline:0:60:2026-08-09T01:00:00.000Z',
        pipelineId: 'active-pipeline',
        pipelineName: 'Active Pipeline',
        pipelineTimezone: 'UTC',
        pipelineColor: '#FF5500',
        active: true,
        scheduleRevision: 3,
        dayOfWeek: 0,
        minuteOfDay: 60,
        scheduledFor: '2026-08-09T01:00:00.000Z',
      },
      {
        id: 'paused-pipeline:0:540:2026-08-09T13:00:00.000Z',
        pipelineId: 'paused-pipeline',
        pipelineName: 'Paused Pipeline',
        pipelineTimezone: 'America/New_York',
        pipelineColor: '#00AAFF',
        active: false,
        scheduleRevision: 4,
        dayOfWeek: 0,
        minuteOfDay: 540,
        scheduledFor: '2026-08-09T13:00:00.000Z',
      },
    ]);
    expect(repository.getPipelinesForSchedule).toHaveBeenCalledWith(
      'organization'
    );
  });

  it('queries only non-deleted organization schedules without queue data', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new PipelineRepository(
      { model: { pipeline: { findMany } } } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any
    );

    await repository.getPipelinesForSchedule('organization');

    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: 'organization', deletedAt: null },
      select: {
        id: true,
        name: true,
        timezone: true,
        color: true,
        active: true,
        scheduleRevision: true,
        scheduleSlots: {
          select: { dayOfWeek: true, minuteOfDay: true },
          orderBy: [{ dayOfWeek: 'asc' }, { minuteOfDay: 'asc' }],
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  });

  it('rejects empty, reversed, and over-eight-day schedule ranges', async () => {
    const repository = { getPipelinesForSchedule: jest.fn() };
    const service = new PipelineService(repository as any, {} as any);

    await expect(
      service.getPipelineSchedule('org', {
        startDate: '2026-08-10T00:00:00.000Z',
        endDate: '2026-08-10T00:00:00.000Z',
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getPipelineSchedule('org', {
        startDate: '2026-08-11T00:00:00.000Z',
        endDate: '2026-08-10T00:00:00.000Z',
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getPipelineSchedule('org', {
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-09T00:00:00.001Z',
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.getPipelinesForSchedule).not.toHaveBeenCalled();
  });

  it('deletes exactly one slot and increments its revision once', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const update = jest.fn().mockResolvedValue({
      id: 'pipeline',
      scheduleRevision: 8,
    });
    const transaction = {
      model: {
        $transaction: jest.fn(async (callback: any, options: any) => {
          expect(options.isolationLevel).toBe('Serializable');
          return callback({
            pipeline: {
              findFirst: jest.fn().mockResolvedValue({ id: 'pipeline' }),
              update,
            },
            pipelineScheduleSlot: { deleteMany },
          });
        }),
      },
    };
    const repository = new PipelineRepository(
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      transaction as any
    );

    await expect(
      repository.deletePipelineScheduleSlot('org', 'pipeline', {
        dayOfWeek: 1,
        minuteOfDay: 60,
      })
    ).resolves.toEqual({ id: 'pipeline', scheduleRevision: 8 });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { pipelineId: 'pipeline', dayOfWeek: 1, minuteOfDay: 60 },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'pipeline' },
      data: { scheduleRevision: { increment: 1 } },
      select: { id: true, scheduleRevision: true },
    });
  });

  it('does not increment revision when a schedule slot is stale', async () => {
    const update = jest.fn();
    const transaction = {
      model: {
        $transaction: jest.fn(async (callback: any) =>
          callback({
            pipeline: {
              findFirst: jest.fn().mockResolvedValue({ id: 'pipeline' }),
              update,
            },
            pipelineScheduleSlot: {
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
          })
        ),
      },
    };
    const repository = new PipelineRepository(
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      transaction as any
    );
    const service = new PipelineService(
      {
        deletePipelineScheduleSlot:
          repository.deletePipelineScheduleSlot.bind(repository),
      } as any,
      {} as any
    );

    await expect(
      service.deletePipelineScheduleSlot('org', 'pipeline', {
        dayOfWeek: 1,
        minuteOfDay: 60,
      })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });

  it('validates recurring schedule slot moves at the DTO boundary', () => {
    const valid = plainToInstance(MovePipelineScheduleSlotDto, {
      sourceDayOfWeek: 0,
      sourceMinuteOfDay: 0,
      targetDayOfWeek: 6,
      targetMinuteOfDay: 1439,
      expectedScheduleRevision: 1,
    });
    expect(validateSync(valid)).toHaveLength(0);

    for (const body of [
      { ...valid, sourceDayOfWeek: -1 },
      { ...valid, sourceMinuteOfDay: 1440 },
      { ...valid, targetDayOfWeek: 7 },
      { ...valid, targetMinuteOfDay: -1 },
      { ...valid, expectedScheduleRevision: 0 },
      { ...valid, expectedScheduleRevision: 1.5 },
    ]) {
      expect(
        validateSync(plainToInstance(MovePipelineScheduleSlotDto, body)).length
      ).toBeGreaterThan(0);
    }
  });

  it('moves exactly one paused Pipeline slot and increments its revision once', async () => {
    const move = {
      sourceDayOfWeek: 1,
      sourceMinuteOfDay: 60,
      targetDayOfWeek: 2,
      targetMinuteOfDay: 120,
      expectedScheduleRevision: 4,
    };
    const slotUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const revisionUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'pipeline',
        scheduleRevision: 4,
        active: false,
      });
    const slotFindFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: 'source-slot' })
      .mockResolvedValueOnce(null);
    const transaction = {
      model: {
        $transaction: jest.fn((callback: any, options: any) => {
          expect(options.isolationLevel).toBe('Serializable');
          return callback({
            pipeline: { findFirst, updateMany: revisionUpdate },
            pipelineScheduleSlot: {
              findFirst: slotFindFirst,
              updateMany: slotUpdate,
            },
          });
        }),
      },
    };
    const repository = new PipelineRepository(
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      transaction as any
    );

    await expect(
      repository.movePipelineScheduleSlot('org', 'pipeline', move)
    ).resolves.toEqual({
      id: 'pipeline',
      scheduleRevision: 5,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'pipeline', organizationId: 'org', deletedAt: null },
      select: { id: true, scheduleRevision: true },
    });
    expect(slotUpdate).toHaveBeenCalledWith({
      where: {
        id: 'source-slot',
        pipelineId: 'pipeline',
        dayOfWeek: 1,
        minuteOfDay: 60,
      },
      data: { dayOfWeek: 2, minuteOfDay: 120 },
    });
    expect(revisionUpdate).toHaveBeenCalledWith({
      where: {
        id: 'pipeline',
        organizationId: 'org',
        deletedAt: null,
        scheduleRevision: 4,
      },
      data: { scheduleRevision: { increment: 1 } },
    });
  });

  it('returns a no-op without changing revision after verifying revision and source', async () => {
    const slotUpdate = jest.fn();
    const revisionUpdate = jest.fn();
    const transaction = {
      model: {
        $transaction: jest.fn((callback: any) =>
          callback({
            pipeline: {
              findFirst: jest
                .fn()
                .mockResolvedValue({ id: 'pipeline', scheduleRevision: 4 }),
              updateMany: revisionUpdate,
            },
            pipelineScheduleSlot: {
              findFirst: jest.fn().mockResolvedValue({ id: 'source-slot' }),
              updateMany: slotUpdate,
            },
          })
        ),
      },
    };
    const repository = new PipelineRepository(
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      transaction as any
    );

    await expect(
      repository.movePipelineScheduleSlot('org', 'pipeline', {
        sourceDayOfWeek: 1,
        sourceMinuteOfDay: 60,
        targetDayOfWeek: 1,
        targetMinuteOfDay: 60,
        expectedScheduleRevision: 4,
      })
    ).resolves.toEqual({ id: 'pipeline', scheduleRevision: 4 });
    expect(slotUpdate).not.toHaveBeenCalled();
    expect(revisionUpdate).not.toHaveBeenCalled();
  });

  it('maps move conflicts to distinct refresh and duplicate responses', async () => {
    const repository = {
      movePipelineScheduleSlot: jest
        .fn()
        .mockResolvedValueOnce('stale-revision')
        .mockResolvedValueOnce('missing-source')
        .mockResolvedValueOnce('occupied')
        .mockResolvedValueOnce('not-found'),
    };
    const service = new PipelineService(repository as any, {} as any);
    const move = {
      sourceDayOfWeek: 1,
      sourceMinuteOfDay: 60,
      targetDayOfWeek: 2,
      targetMinuteOfDay: 120,
      expectedScheduleRevision: 4,
    };

    await expect(
      service.movePipelineScheduleSlot('org', 'pipeline', move)
    ).rejects.toMatchObject({
      message: 'Pipeline schedule changed; refresh and try again',
    });
    await expect(
      service.movePipelineScheduleSlot('org', 'pipeline', move)
    ).rejects.toMatchObject({
      message:
        'Pipeline schedule source no longer exists; refresh and try again',
    });
    await expect(
      service.movePipelineScheduleSlot('org', 'pipeline', move)
    ).rejects.toMatchObject({
      message: 'Pipeline schedule target is already occupied',
    });
    await expect(
      service.movePipelineScheduleSlot('org', 'pipeline', move)
    ).rejects.toMatchObject({
      message: 'Pipeline not found',
    });
  });

  it('does not revise a missing source and classifies a target uniqueness race as occupied', async () => {
    const revisionUpdate = jest.fn();
    const staleTransaction = {
      model: {
        $transaction: jest.fn((callback: any) =>
          callback({
            pipeline: {
              findFirst: jest
                .fn()
                .mockResolvedValue({ id: 'pipeline', scheduleRevision: 4 }),
              updateMany: revisionUpdate,
            },
            pipelineScheduleSlot: {
              findFirst: jest.fn().mockResolvedValue(null),
            },
          })
        ),
      },
    };
    const staleRepository = new PipelineRepository(
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      staleTransaction as any
    );
    const move = {
      sourceDayOfWeek: 1,
      sourceMinuteOfDay: 60,
      targetDayOfWeek: 2,
      targetMinuteOfDay: 120,
      expectedScheduleRevision: 4,
    };

    await expect(
      staleRepository.movePipelineScheduleSlot('org', 'pipeline', move)
    ).resolves.toBe('missing-source');
    expect(revisionUpdate).not.toHaveBeenCalled();

    const occupiedRevisionUpdate = jest.fn();
    const occupiedRepository = new PipelineRepository(
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      {
        model: {
          $transaction: jest.fn((callback: any) =>
            callback({
              pipeline: {
                findFirst: jest
                  .fn()
                  .mockResolvedValue({ id: 'pipeline', scheduleRevision: 4 }),
                updateMany: occupiedRevisionUpdate,
              },
              pipelineScheduleSlot: {
                findFirst: jest
                  .fn()
                  .mockResolvedValueOnce({ id: 'source-slot' })
                  .mockResolvedValueOnce({ id: 'target-slot' }),
              },
            })
          ),
        },
      } as any
    );
    await expect(
      occupiedRepository.movePipelineScheduleSlot('org', 'pipeline', move)
    ).resolves.toBe('occupied');
    expect(occupiedRevisionUpdate).not.toHaveBeenCalled();

    const raceRepository = new PipelineRepository(
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      {
        model: {
          $transaction: jest.fn().mockRejectedValue({ code: 'P2002' }),
        },
      } as any
    );
    await expect(
      raceRepository.movePipelineScheduleSlot('org', 'pipeline', move)
    ).resolves.toBe('occupied');
  });

  it('rejects duplicate bulk queue IDs before attempting a reorder', async () => {
    const repository = { reorderQueuedItems: jest.fn() };
    const service = new PipelineService(repository as any, {} as any);

    await expect(
      service.reorderQueue('org', 'pipeline', {
        itemIds: ['item', 'item'],
      })
    ).rejects.toMatchObject({
      message: 'Pipeline queue item IDs must be unique',
    });
    expect(repository.reorderQueuedItems).not.toHaveBeenCalled();
  });

  it('uses only queued items for manual scheduling', async () => {
    const repository = {
      scheduleItem: jest.fn().mockResolvedValue({
        id: 'item',
        posts: [{ id: 'root-post', providerIdentifier: 'x' }],
      }),
    };
    const manager = {
      startScheduledPosts: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PipelineService(repository as any, manager as any);

    await expect(
      service.scheduleItem('org', 'item', '2026-08-10T12:00:00.000Z')
    ).resolves.toEqual({
      id: 'item',
      scheduledFor: '2026-08-10T12:00:00.000Z',
    });
    expect(repository.scheduleItem).toHaveBeenCalledWith(
      'org',
      'item',
      new Date('2026-08-10T12:00:00.000Z')
    );
    expect(manager.startScheduledPosts).toHaveBeenCalledWith('org', [
      { id: 'root-post', providerIdentifier: 'x' },
    ]);
  });

  it('projects queued items in order and hides projections while paused', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-09T00:00:00.000Z'));
    const repository = {
      getPipeline: jest.fn().mockResolvedValue({
        id: 'pipeline',
        active: true,
        timezone: 'UTC',
        integrations: [{ integration: { id: 'channel' } }],
        scheduleSlots: [
          { dayOfWeek: 0, minuteOfDay: 60 },
          { dayOfWeek: 1, minuteOfDay: 60 },
        ],
        queueItems: [
          { id: 'first', status: 'QUEUED' },
          { id: 'publishing', status: 'PUBLISHING' },
          { id: 'second', status: 'QUEUED' },
        ],
      }),
    };
    const service = new PipelineService(repository as any, {} as any);

    await expect(service.getPipeline('org', 'pipeline')).resolves.toMatchObject(
      {
        nextSlot: new Date('2026-08-09T01:00:00.000Z'),
        projections: [
          {
            itemId: 'first',
            projectedFor: new Date('2026-08-09T01:00:00.000Z'),
          },
          { itemId: 'publishing', projectedFor: undefined },
          {
            itemId: 'second',
            projectedFor: new Date('2026-08-10T01:00:00.000Z'),
          },
        ],
      }
    );

    repository.getPipeline.mockResolvedValueOnce({
      ...(await repository.getPipeline()),
      active: false,
    });
    await expect(service.getPipeline('org', 'pipeline')).resolves.toMatchObject(
      {
        nextSlot: undefined,
        projections: [
          { itemId: 'first', projectedFor: undefined },
          { itemId: 'publishing', projectedFor: undefined },
          { itemId: 'second', projectedFor: undefined },
        ],
      }
    );
    jest.useRealTimers();
  });

  it('schedules queued multi-channel content before publishing it now', async () => {
    const repository = {
      scheduleItem: jest.fn().mockResolvedValue({
        id: 'item',
        posts: [
          { id: 'x-root', providerIdentifier: 'x' },
          { id: 'linkedin-root', providerIdentifier: 'linkedin' },
        ],
      }),
    };
    const manager = {
      startScheduledPosts: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PipelineService(repository as any, manager as any);

    await service.publishNow('org', 'item');

    expect(repository.scheduleItem).toHaveBeenCalledWith(
      'org',
      'item',
      expect.any(Date)
    );
    expect(manager.startScheduledPosts).toHaveBeenCalledWith('org', [
      { id: 'x-root', providerIdentifier: 'x' },
      { id: 'linkedin-root', providerIdentifier: 'linkedin' },
    ]);
  });

  it('queues roots and thread children together before starting each root workflow', async () => {
    const linkedPosts = [
      {
        id: 'x-root',
        parentPostId: null,
        state: 'DRAFT',
        pipelineQueueItemId: 'item',
      },
      {
        id: 'x-thread-child',
        parentPostId: 'x-root',
        state: 'DRAFT',
        pipelineQueueItemId: 'item',
      },
      {
        id: 'linkedin-root',
        parentPostId: null,
        state: 'DRAFT',
        pipelineQueueItemId: 'item',
      },
    ];
    const postUpdateMany = jest.fn().mockImplementation(({ where, data }) => {
      linkedPosts
        .filter(
          (post) =>
            post.pipelineQueueItemId === where.pipelineQueueItemId &&
            post.state === 'DRAFT'
        )
        .forEach((post) => Object.assign(post, data));
      return { count: linkedPosts.length };
    });
    const queueItemUpdate = jest.fn().mockResolvedValue({
      id: 'item',
      status: 'REMOVED',
    });
    const transaction = {
      model: {
        $transaction: jest.fn(async (callback: any) =>
          callback({
            pipelineQueueItem: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'item',
                posts: [
                  {
                    id: 'x-root',
                    integration: { providerIdentifier: 'x' },
                  },
                  {
                    id: 'linkedin-root',
                    integration: { providerIdentifier: 'linkedin' },
                  },
                ],
              }),
              update: queueItemUpdate,
            },
            post: { updateMany: postUpdateMany },
          })
        ),
      },
    };
    const repository = new PipelineRepository(
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      transaction as any
    );
    const scheduledFor = new Date('2026-08-10T12:00:00.000Z');

    await expect(
      repository.scheduleItem('org', 'item', scheduledFor)
    ).resolves.toEqual({
      id: 'item',
      posts: [
        { id: 'x-root', providerIdentifier: 'x' },
        { id: 'linkedin-root', providerIdentifier: 'linkedin' },
      ],
    });
    expect(postUpdateMany).toHaveBeenCalledWith({
      where: {
        pipelineQueueItemId: 'item',
        organizationId: 'org',
        deletedAt: null,
      },
      data: {
        publishDate: scheduledFor,
        state: 'QUEUE',
        releaseId: null,
        releaseURL: null,
      },
    });
    expect(linkedPosts).toEqual([
      expect.objectContaining({
        id: 'x-root',
        parentPostId: null,
        state: 'QUEUE',
        pipelineQueueItemId: 'item',
        publishDate: scheduledFor,
      }),
      expect.objectContaining({
        id: 'x-thread-child',
        parentPostId: 'x-root',
        state: 'QUEUE',
        pipelineQueueItemId: 'item',
        publishDate: scheduledFor,
      }),
      expect.objectContaining({
        id: 'linkedin-root',
        parentPostId: null,
        state: 'QUEUE',
        pipelineQueueItemId: 'item',
        publishDate: scheduledFor,
      }),
    ]);
    expect(queueItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item' },
        data: expect.objectContaining({ status: 'REMOVED' }),
      })
    );
  });

  it('reports workflow-start failures after scheduling posts', async () => {
    const posts = {
      startWorkflow: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Temporal unavailable')),
    };
    const manager = new PipelineManager({} as any, posts as any);

    await expect(
      manager.startScheduledPosts('org', [
        { id: 'x-root', providerIdentifier: 'x' },
        { id: 'linkedin-root', providerIdentifier: 'linkedin' },
      ])
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        failedPostIds: ['linkedin-root'],
      }),
    });
    expect(posts.startWorkflow).toHaveBeenCalledWith(
      'x',
      'x-root',
      'org',
      'QUEUE',
      true
    );
    expect(posts.startWorkflow).toHaveBeenCalledWith(
      'linkedin',
      'linkedin-root',
      'org',
      'QUEUE',
      true
    );
  });

  it('creates grouped drafts for exactly the configured channels', async () => {
    const repository = {
      getPipeline: jest.fn().mockResolvedValue({
        id: 'pipeline',
        integrations: [
          { integrationId: 'linkedin' },
          { integrationId: 'twitter' },
        ],
      }),
      publishQueueItem: jest.fn().mockResolvedValue({ id: 'queue-item' }),
      discardUnlinkedDraftPosts: jest.fn(),
    };
    const posts = {
      validatePosts: jest.fn().mockResolvedValue([
        { valid: true, errors: true, emptyContent: false, tooLong: false },
        { valid: true, errors: true, emptyContent: false, tooLong: false },
      ]),
      mapTypeToPost: jest.fn().mockImplementation((body) => body),
      createPost: jest.fn().mockResolvedValue([]),
    };
    const manager = new PipelineManager(repository as any, posts as any);
    const body = {
      pipelineId: 'pipeline',
      post: {
        type: 'schedule',
        date: '2026-08-10T10:00:00.000Z',
        posts: [
          { integration: { id: 'twitter' }, value: [{ content: 'Twitter' }] },
          { integration: { id: 'linkedin' }, value: [{ content: 'LinkedIn' }] },
        ],
      },
    } as any;

    await expect(manager.enqueue('org', body)).resolves.toEqual(
      expect.objectContaining({ id: 'queue-item', group: expect.any(String) })
    );
    expect(posts.mapTypeToPost).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'draft',
        posts: [
          expect.objectContaining({ integration: { id: 'twitter' } }),
          expect.objectContaining({ integration: { id: 'linkedin' } }),
        ],
      }),
      'org'
    );
    expect(repository.publishQueueItem).toHaveBeenCalledWith(
      'org',
      'pipeline',
      expect.any(String)
    );
  });

  it('reuses an accepted queue item for an idempotency key', async () => {
    const repository = {
      getPipeline: jest.fn().mockResolvedValue({
        id: 'pipeline',
        integrations: [{ integrationId: 'linkedin' }],
      }),
      getQueueItemByIdempotencyKey: jest
        .fn()
        .mockResolvedValue({ id: 'queue-item', group: 'existing-group' }),
      publishQueueItem: jest.fn(),
      discardUnlinkedDraftPosts: jest.fn(),
    };
    const posts = {
      validatePosts: jest.fn(),
      mapTypeToPost: jest.fn(),
      createPost: jest.fn(),
    };
    const manager = new PipelineManager(repository as any, posts as any);
    const body = {
      pipelineId: 'pipeline',
      post: {
        posts: [
          { integration: { id: 'linkedin' }, value: [{ content: 'Content' }] },
        ],
      },
    } as any;

    await expect(
      manager.enqueue('org', body, 'AUTOPOST', 'autopost:feed:item-url')
    ).resolves.toEqual({ id: 'queue-item', group: 'existing-group' });

    expect(posts.createPost).not.toHaveBeenCalled();
    expect(repository.publishQueueItem).not.toHaveBeenCalled();
  });

  it('ignores soft-deleted Pipeline integrations during enqueue validation', async () => {
    const repository = {
      getPipeline: jest.fn().mockResolvedValue({
        id: 'pipeline',
        integrations: [
          {
            integrationId: 'linkedin',
            integration: { disabled: false, deletedAt: null },
          },
          {
            integrationId: 'twitter',
            integration: {
              disabled: false,
              deletedAt: new Date('2026-08-10T10:00:00.000Z'),
            },
          },
        ],
      }),
      publishQueueItem: jest.fn().mockResolvedValue({ id: 'queue-item' }),
      discardUnlinkedDraftPosts: jest.fn(),
    };
    const posts = {
      validatePosts: jest
        .fn()
        .mockResolvedValue([
          { valid: true, errors: true, emptyContent: false, tooLong: false },
        ]),
      mapTypeToPost: jest.fn().mockImplementation((body) => body),
      createPost: jest.fn().mockResolvedValue([]),
    };
    const manager = new PipelineManager(repository as any, posts as any);

    await expect(
      manager.enqueue('org', {
        pipelineId: 'pipeline',
        post: {
          type: 'schedule',
          date: '2026-08-10T10:00:00.000Z',
          posts: [
            {
              integration: { id: 'linkedin' },
              value: [{ content: 'LinkedIn' }],
            },
          ],
        },
      } as any)
    ).resolves.toEqual(
      expect.objectContaining({ id: 'queue-item', group: expect.any(String) })
    );
  });

  it('removes unlinked drafts when queue publication fails', async () => {
    const repository = {
      getPipeline: jest.fn().mockResolvedValue({
        id: 'pipeline',
        integrations: [{ integrationId: 'channel' }],
      }),
      publishQueueItem: jest.fn().mockResolvedValue(false),
      discardUnlinkedDraftPosts: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const posts = {
      validatePosts: jest
        .fn()
        .mockResolvedValue([
          { valid: true, errors: true, emptyContent: false, tooLong: false },
        ]),
      mapTypeToPost: jest.fn().mockImplementation((body) => body),
      createPost: jest.fn().mockResolvedValue([]),
    };
    const manager = new PipelineManager(repository as any, posts as any);

    await expect(
      manager.enqueue('org', {
        pipelineId: 'pipeline',
        post: {
          type: 'schedule',
          date: '2026-08-10T10:00:00.000Z',
          posts: [
            { integration: { id: 'channel' }, value: [{ content: 'Content' }] },
          ],
        },
      } as any)
    ).rejects.toMatchObject({
      message: 'Pipeline content no longer matches its configured integrations',
    });
    expect(repository.discardUnlinkedDraftPosts).toHaveBeenCalledWith(
      'org',
      expect.any(String)
    );
  });

  it('retries a serialization conflict instead of dropping a concurrent reorder', async () => {
    const firstAttempt = { code: 'P2034' };
    const transaction = {
      model: {
        $transaction: jest
          .fn()
          .mockRejectedValueOnce(firstAttempt)
          .mockImplementationOnce(async (callback: any) =>
            callback({
              pipelineQueueItem: {
                findFirst: jest.fn().mockResolvedValue({ id: 'item' }),
                findMany: jest.fn().mockResolvedValue([]),
                update: jest
                  .fn()
                  .mockResolvedValue({ id: 'item', position: 1024 }),
              },
            })
          ),
      },
    };
    const repository = new PipelineRepository(
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      transaction as any
    );

    await expect(
      repository.repositionItem('org', 'item', 'pipeline')
    ).resolves.toMatchObject({ id: 'item' });
    expect(transaction.model.$transaction).toHaveBeenCalledTimes(2);
  });

  it('keeps failed items recoverable through distinct remove and delete actions', async () => {
    const repository = {
      detachItem: jest
        .fn()
        .mockResolvedValue({ id: 'failed-item', status: 'REMOVED' }),
      deleteItem: jest
        .fn()
        .mockResolvedValue({ id: 'failed-item', status: 'REMOVED' }),
    };
    const service = new PipelineService(repository as any, {} as any);

    await expect(
      service.detachItem('org', 'failed-item')
    ).resolves.toMatchObject({
      id: 'failed-item',
    });
    await expect(
      service.deleteItem('org', 'failed-item')
    ).resolves.toMatchObject({
      id: 'failed-item',
    });
    expect(repository.detachItem).toHaveBeenCalledWith('org', 'failed-item');
    expect(repository.deleteItem).toHaveBeenCalledWith('org', 'failed-item');
  });

  it('deletes failed Pipeline content instead of detaching it', async () => {
    const postUpdateMany = jest.fn().mockResolvedValue({ count: 2 });
    const queueItemUpdate = jest.fn().mockResolvedValue({
      id: 'failed-item',
      status: 'REMOVED',
    });
    const transaction = {
      model: {
        $transaction: jest.fn(async (callback: any) =>
          callback({
            pipelineQueueItem: {
              findFirst: jest.fn().mockResolvedValue({ id: 'failed-item' }),
              update: queueItemUpdate,
            },
            post: { updateMany: postUpdateMany },
          })
        ),
      },
    };
    const repository = new PipelineRepository(
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      transaction as any
    );

    await expect(
      repository.deleteItem('org', 'failed-item')
    ).resolves.toMatchObject({
      id: 'failed-item',
    });
    expect(postUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          pipelineQueueItemId: 'failed-item',
          organizationId: 'org',
          deletedAt: null,
        },
        data: { deletedAt: expect.any(Date) },
      })
    );
  });

  it('creates pipelines with assigned context documents', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'pipeline' });
    const repository = new PipelineRepository(
      { model: { pipeline: { create } } } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any
    );

    await repository.createPipeline('org', {
      name: 'Pipeline',
      timezone: 'UTC',
      integrations: [{ id: 'channel' }],
      contextDocumentIds: ['doc-a', 'doc-b'],
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contextDocuments: {
          create: [
            { contextDocumentId: 'doc-a' },
            { contextDocumentId: 'doc-b' },
          ],
        },
      }),
    });
  });

  it('replaces context document assignments on update and preserves them when omitted', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'pipeline' });
    const contextDocumentFindMany = jest.fn(async ({ where }: any) =>
      (where.id?.in || []).map((id: string) => ({
        id,
        name: id === 'skill' ? 'campaign-review.skill.md' : `${id}.markdown`,
      }))
    );
    const transaction = {
      model: {
        $transaction: jest.fn(async (callback: any) =>
          callback({
            pipeline: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'pipeline',
                integrations: [{ integrationId: 'channel' }],
              }),
              update,
            },
            pipelineQueueItem: { findFirst: jest.fn().mockResolvedValue(null) },
            contextDocument: { findMany: contextDocumentFindMany },
          })
        ),
      },
    };
    const repository = new PipelineRepository(
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      transaction as any
    );
    const base = {
      name: 'Pipeline',
      timezone: 'UTC',
      integrations: [{ id: 'channel' }],
    };

    await repository.updatePipeline('org', 'pipeline', {
      ...base,
      contextDocumentIds: ['doc-a', 'doc-b'],
    });
    await repository.updatePipeline('org', 'pipeline', {
      ...base,
      contextDocumentIds: [],
    });
    await repository.updatePipeline('org', 'pipeline', base);
    await expect(
      repository.updatePipeline('org', 'pipeline', {
        ...base,
        contextDocumentIds: ['skill'],
      })
    ).resolves.toBe('skill-context-documents');

    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: 'pipeline' },
      data: expect.objectContaining({
        contextDocuments: {
          deleteMany: {},
          create: [
            { contextDocumentId: 'doc-a' },
            { contextDocumentId: 'doc-b' },
          ],
        },
      }),
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: 'pipeline' },
      data: expect.objectContaining({
        contextDocuments: { deleteMany: {}, create: [] },
      }),
    });
    expect(update).toHaveBeenNthCalledWith(3, {
      where: { id: 'pipeline' },
      data: {
        name: 'Pipeline',
        timezone: 'UTC',
      },
    });
    expect(update.mock.calls[2][0].data).not.toHaveProperty('contextDocuments');
    expect(update.mock.calls[2][0].data).not.toHaveProperty('scheduleRevision');
  });

  it('rejects duplicate and foreign context document ids before repository writes', async () => {
    const repository = {
      getOwnedIntegrations: jest.fn().mockResolvedValue([{ id: 'channel' }]),
      getOwnedContextDocuments: jest.fn().mockResolvedValue([{ id: 'doc-a' }]),
      createPipeline: jest.fn(),
      updatePipeline: jest.fn(),
    };
    const service = new PipelineService(repository as any, {} as any);
    const base = {
      name: 'Pipeline',
      timezone: 'UTC',
      integrations: [{ id: 'channel' }],
    };

    await expect(
      service.createPipeline('org', {
        ...base,
        contextDocumentIds: ['doc-a', 'doc-a'],
      })
    ).rejects.toMatchObject({
      message: 'Pipeline context document IDs must be unique',
    });
    await expect(
      service.createPipeline('org', {
        ...base,
        contextDocumentIds: ['doc-a', 'foreign-doc'],
      })
    ).rejects.toMatchObject({
      message: 'Pipeline context documents must belong to the organization',
    });
    expect(repository.createPipeline).not.toHaveBeenCalled();

    await expect(
      service.updatePipeline('org', 'pipeline', {
        ...base,
        contextDocumentIds: ['doc-a', 'doc-a'],
      })
    ).rejects.toMatchObject({
      message: 'Pipeline context document IDs must be unique',
    });
    await expect(
      service.updatePipeline('org', 'pipeline', {
        ...base,
        contextDocumentIds: ['doc-a', 'foreign-doc'],
      })
    ).rejects.toMatchObject({
      message: 'Pipeline context documents must belong to the organization',
    });
    expect(repository.updatePipeline).not.toHaveBeenCalled();
  });

  it('rolls back document replacement when ownership changes inside the update transaction', async () => {
    const update = jest.fn();
    const transaction = {
      model: {
        $transaction: jest.fn(async (callback: any) =>
          callback({
            pipeline: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'pipeline',
                integrations: [{ integrationId: 'channel' }],
              }),
              update,
            },
            pipelineQueueItem: { findFirst: jest.fn().mockResolvedValue(null) },
            contextDocument: {
              findMany: jest.fn().mockResolvedValue([{ id: 'doc-a' }]),
            },
          })
        ),
      },
    };
    const repository = new PipelineRepository(
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      transaction as any
    );
    const service = new PipelineService(
      {
        getOwnedIntegrations: jest.fn().mockResolvedValue([{ id: 'channel' }]),
        getOwnedContextDocuments: jest
          .fn()
          .mockResolvedValue([{ id: 'doc-a' }, { id: 'doc-b' }]),
        updatePipeline: repository.updatePipeline.bind(repository),
      } as any,
      {} as any
    );

    await expect(
      service.updatePipeline('org', 'pipeline', {
        name: 'Pipeline',
        timezone: 'UTC',
        integrations: [{ id: 'channel' }],
        contextDocumentIds: ['doc-a', 'doc-b'],
      })
    ).rejects.toMatchObject({
      message: 'Pipeline context documents must belong to the organization',
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('does not increment schedule revision when only context documents change', async () => {
    const update = jest
      .fn()
      .mockResolvedValue({ id: 'pipeline', scheduleRevision: 3 });
    const transaction = {
      model: {
        $transaction: jest.fn(async (callback: any) =>
          callback({
            pipeline: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'pipeline',
                integrations: [{ integrationId: 'channel' }],
              }),
              update,
            },
            pipelineQueueItem: { findFirst: jest.fn().mockResolvedValue(null) },
            contextDocument: {
              findMany: jest.fn().mockResolvedValue([{ id: 'doc-a' }]),
            },
          })
        ),
      },
    };
    const repository = new PipelineRepository(
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      transaction as any
    );

    await repository.updatePipeline('org', 'pipeline', {
      name: 'Pipeline',
      timezone: 'UTC',
      integrations: [{ id: 'channel' }],
      contextDocumentIds: ['doc-a'],
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'pipeline' },
      data: expect.objectContaining({
        contextDocuments: {
          deleteMany: {},
          create: [{ contextDocumentId: 'doc-a' }],
        },
      }),
    });
    expect(update.mock.calls[0][0].data).not.toHaveProperty('scheduleRevision');
    expect(update.mock.calls[0][0].data).not.toHaveProperty('scheduleSlots');
  });
});
