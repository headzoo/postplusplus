import { PostsRepository } from './posts.repository';

const repository = (post: Record<string, jest.Mock>) =>
  new PostsRepository(
    { model: { post } } as any,
    { model: {} } as any,
    { model: {} } as any,
    { model: {} } as any,
    { model: {} } as any,
    { model: {} } as any
  );

describe('Posts repository scheduling regressions', () => {
  it('keeps queued Pipeline drafts out of calendar results while showing scheduled and published posts', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const posts = repository({ findMany });

    await posts.getPosts('org', {
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-08-31T23:59:59.999Z',
    } as any);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          parentPostId: null,
          NOT: {
            state: 'DRAFT',
            pipelineQueueItemId: { not: null },
          },
        }),
      })
    );
  });

  it('merges customer filter into integration without dropping org constraints', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const posts = repository({ findMany });

    await posts.getPosts('org', {
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-08-31T23:59:59.999Z',
      customer: 'customer-1',
    } as any);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          integration: {
            deletedAt: null,
            organizationId: 'org',
            customerId: 'customer-1',
          },
        }),
      })
    );
  });

  it('filters calendar posts by title or content when search is provided', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const posts = repository({ findMany });

    await posts.getPosts('org', {
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-08-31T23:59:59.999Z',
      search: '  hello world  ',
    } as any);

    const and = findMany.mock.calls[0][0].where.AND;
    expect(and).toEqual(
      expect.arrayContaining([
        {
          OR: [
            {
              title: {
                contains: 'hello world',
                mode: 'insensitive',
              },
            },
            {
              content: {
                contains: 'hello world',
                mode: 'insensitive',
              },
            },
          ],
        },
      ])
    );
  });

  it('filters list posts by title or content when search is provided', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const posts = repository({ findMany, count });

    await posts.getPostsList('org', {
      state: 'all',
      page: 0,
      search: 'launch',
    } as any);

    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        {
          OR: [
            {
              title: {
                contains: 'launch',
                mode: 'insensitive',
              },
            },
            {
              content: {
                contains: 'launch',
                mode: 'insensitive',
              },
            },
          ],
        },
      ])
    );
    // Search across all states should not apply the upcoming-only date filter.
    expect(where.publishDate).toBeUndefined();
    expect(findMany.mock.calls[0][0].orderBy).toEqual({
      publishDate: 'desc',
    });
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('omits title/content filter when search is blank', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const posts = repository({ findMany });

    await posts.getPosts('org', {
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-08-31T23:59:59.999Z',
      search: '   ',
    } as any);

    const and = findMany.mock.calls[0][0].where.AND;
    expect(and).toHaveLength(2);
  });

  it('scopes recurring posts to the visible window instead of expanding from origin', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'recurring',
        content: 'daily',
        publishDate: new Date('2025-01-01T10:00:00.000Z'),
        releaseURL: null,
        releaseId: null,
        state: 'QUEUE',
        intervalInDays: 1,
        group: 'g1',
        creationMethod: 'WEB',
        tags: [],
        integration: {
          id: 'i1',
          providerIdentifier: 'x',
          name: 'X',
          picture: '',
        },
      },
    ]);
    const posts = repository({ findMany });

    const result = await posts.getPosts('org', {
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-08-03T23:59:59.999Z',
    } as any);

    const whereOr = findMany.mock.calls[0][0].where.AND[1].OR;
    expect(whereOr).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          intervalInDays: { not: null },
          publishDate: { lte: expect.any(Date) },
        }),
      ])
    );

    // 3 days in window — not hundreds from the 2025 origin.
    expect(result).toHaveLength(3);
    expect(result.every((p: any) => p.id === 'recurring')).toBe(true);
    expect(result[0].actualDate).toEqual(new Date('2025-01-01T10:00:00.000Z'));
  });

  it('keeps published posts analytics-visible rather than applying the upcoming filter', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const posts = repository({ findMany, count });

    await posts.getPostsList('org', { state: 'published', page: 0 } as any);

    const where = findMany.mock.calls[0][0].where;
    expect(where.state).toBe('PUBLISHED');
    expect(where.publishDate).toBeUndefined();
    expect(where.NOT).toEqual({
      state: 'DRAFT',
      pipelineQueueItemId: { not: null },
    });
    expect(count).toHaveBeenCalledWith({ where });
  });

  it.each([
    ['draft', true, 'DRAFT'],
    ['manual schedule', false, 'QUEUE'],
  ])(
    'preserves %s state transitions when changing dates',
    async (_, isDraft, state) => {
      const update = jest.fn().mockResolvedValue({});
      const posts = repository({ update });

      await posts.changeDate(
        'org',
        'post',
        '2026-08-10T12:00:00.000Z',
        isDraft,
        'schedule'
      );

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org', id: 'post' },
          data: expect.objectContaining({
            state,
            releaseId: null,
            releaseURL: null,
          }),
        })
      );
    }
  );

  it('retains group/thread relationships when listing a post group', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const posts = repository({ findMany });

    await posts.getPostsByGroup('org', 'shared-group');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        group: 'shared-group',
        organizationId: 'org',
        deletedAt: null,
      },
      include: expect.objectContaining({
        integration: true,
      }),
    });
  });

  it('imports platform posts once per release id and marks platform deletes', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing' });
    const create = jest.fn().mockResolvedValue({ id: 'imported' });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const posts = repository({ findFirst, create, updateMany });

    await expect(
      posts.importPlatformPost({
        organizationId: 'org',
        integrationId: 'channel-a',
        providerIdentifier: 'x',
        externalId: 'tweet-1',
        url: 'https://x.com/i/status/tweet-1',
        content: 'Hello',
        publishedAt: new Date('2026-08-12T12:00:00.000Z'),
      })
    ).resolves.toEqual({ created: true });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        state: 'PUBLISHED',
        creationMethod: 'PLATFORM',
        releaseId: 'tweet-1',
        settings: JSON.stringify({ __type: 'x' }),
      }),
    });

    await expect(
      posts.importPlatformPost({
        organizationId: 'org',
        integrationId: 'channel-a',
        providerIdentifier: 'x',
        externalId: 'tweet-1',
        url: 'https://x.com/i/status/tweet-1',
        content: 'Hello',
        publishedAt: new Date('2026-08-12T12:00:00.000Z'),
      })
    ).resolves.toEqual({ created: false });
    expect(create).toHaveBeenCalledTimes(1);

    await expect(
      posts.markPlatformDeleted(
        'org',
        'channel-a',
        'tweet-1',
        new Date('2026-08-12T13:00:00.000Z')
      )
    ).resolves.toEqual({ updated: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'channel-a',
        releaseId: 'tweet-1',
        deletedAt: null,
        platformDeletedAt: null,
      },
      data: { platformDeletedAt: new Date('2026-08-12T13:00:00.000Z') },
    });
  });

  it('removes a platform import when a local publish claims the same release', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'local',
      organizationId: 'org',
      integrationId: 'channel-a',
    });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const posts = repository({ update, updateMany });

    await posts.updatePost(
      'local',
      'tweet-1',
      'https://x.com/i/status/tweet-1'
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: 'local' },
      data: {
        state: 'PUBLISHED',
        releaseURL: 'https://x.com/i/status/tweet-1',
        releaseId: 'tweet-1',
      },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'channel-a',
        releaseId: 'tweet-1',
        creationMethod: 'PLATFORM',
        id: { not: 'local' },
        deletedAt: null,
      },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('keeps replacement roots and comments linked to a queued Pipeline item', async () => {
    const upsert = jest
      .fn()
      .mockResolvedValueOnce({ id: 'root' })
      .mockResolvedValueOnce({ id: 'comment' });
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const posts = new PostsRepository(
      { model: { post: { upsert, updateMany, findFirst: jest.fn() } } } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: { tagsPosts: { deleteMany: jest.fn() } } } as any,
      { model: {} } as any
    );

    await posts.createOrUpdatePost(
      'draft',
      'org',
      '2026-08-10T12:00:00.000Z',
      {
        integration: { id: 'channel-a' },
        group: 'pipeline-group',
        settings: {},
        value: [
          { id: 'root', content: 'Root', image: [] },
          { id: 'comment', content: 'Comment', image: [] },
        ],
      } as any,
      [],
      'WEB' as any,
      undefined,
      true,
      'queue-item'
    );

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          pipelineQueueItem: { connect: { id: 'queue-item' } },
        }),
        update: expect.objectContaining({
          pipelineQueueItem: { connect: { id: 'queue-item' } },
        }),
      })
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        group: 'pipeline-group',
        deletedAt: null,
        pipelineQueueItemId: 'queue-item',
        integrationId: 'channel-a',
        id: { notIn: ['root', 'comment'] },
      },
      data: expect.objectContaining({ deletedAt: expect.any(Date) }),
    });
  });
});
