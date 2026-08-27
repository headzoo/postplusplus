jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class PostsService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class IntegrationService {} })
);

import { AutopostService } from './autopost.service';

const pipelineFeed = {
  id: 'feed',
  organizationId: 'org',
  pipelineId: 'pipeline',
  active: true,
  url: 'https://example.com/rss.xml',
  lastUrl: 'previous-url',
  integrations: '[]',
  content: 'Template',
  generateContent: false,
  addPicture: false,
};

const pipeline = {
  id: 'pipeline',
  active: true,
  integrations: [
    {
      integration: {
        id: 'linkedin',
        organizationId: 'org',
        providerIdentifier: 'linkedin',
      },
    },
    {
      integration: {
        id: 'twitter',
        organizationId: 'org',
        providerIdentifier: 'twitter',
      },
    },
  ],
};

describe('AutopostService feed processing', () => {
  const createService = (feed: any = pipelineFeed) => {
    const repository = {
      getAutopostForWorkflow: jest.fn().mockResolvedValue(feed),
      getPipeline: jest.fn().mockResolvedValue(pipeline),
      updateUrl: jest.fn().mockResolvedValue(undefined),
    };
    const posts = {
      findFreeDateTime: jest.fn().mockResolvedValue('2026-08-16T12:00:00'),
      createPost: jest.fn().mockResolvedValue(undefined),
    };
    const pipelineManager = {
      enqueue: jest.fn().mockResolvedValue({ id: 'queue-item' }),
    };
    const service = new AutopostService(
      repository as any,
      {} as any,
      { getIntegrationsList: jest.fn().mockResolvedValue([]) } as any,
      posts as any,
      pipelineManager as any
    );
    jest.spyOn(service, 'loadXML').mockResolvedValue({
      success: true,
      date: '2026-08-16',
      url: 'new-url',
      description: 'RSS entry',
    });
    return { service, repository, posts, pipelineManager };
  };

  it('enqueues one grouped Pipeline item for every enabled channel then checkpoints', async () => {
    const { service, repository, pipelineManager, posts } = createService();

    await service.startAutopost('feed');

    expect(pipelineManager.enqueue).toHaveBeenCalledWith(
      'org',
      expect.objectContaining({
        pipelineId: 'pipeline',
        post: expect.objectContaining({
          posts: [
            expect.objectContaining({ integration: { id: 'linkedin' } }),
            expect.objectContaining({ integration: { id: 'twitter' } }),
          ],
        }),
      }),
      'AUTOPOST',
      'autopost:feed:new-url'
    );
    expect(posts.findFreeDateTime).not.toHaveBeenCalled();
    expect(repository.updateUrl).toHaveBeenCalledWith('feed', 'new-url');
  });

  it('does not checkpoint when Pipeline enqueue fails', async () => {
    const { service, repository, pipelineManager } = createService();
    pipelineManager.enqueue.mockRejectedValue(new Error('queue unavailable'));

    await expect(service.startAutopost('feed')).rejects.toThrow(
      'queue unavailable'
    );

    expect(repository.updateUrl).not.toHaveBeenCalled();
  });

  it('reuses the same queue idempotency key when checkpointing retries', async () => {
    const { service, repository, pipelineManager } = createService();
    repository.updateUrl
      .mockRejectedValueOnce(new Error('checkpoint unavailable'))
      .mockResolvedValueOnce(undefined);

    await expect(service.startAutopost('feed')).rejects.toThrow(
      'checkpoint unavailable'
    );
    await service.startAutopost('feed');

    expect(pipelineManager.enqueue).toHaveBeenCalledTimes(2);
    expect(pipelineManager.enqueue).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.anything(),
      'AUTOPOST',
      'autopost:feed:new-url'
    );
    expect(pipelineManager.enqueue).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.anything(),
      'AUTOPOST',
      'autopost:feed:new-url'
    );
  });

  it('enqueues and checkpoints while the Pipeline is paused', async () => {
    const { service, repository, pipelineManager } = createService();
    repository.getPipeline.mockResolvedValue({ ...pipeline, active: false });

    await service.startAutopost('feed');

    expect(pipelineManager.enqueue).toHaveBeenCalled();
    expect(repository.updateUrl).toHaveBeenCalledWith('feed', 'new-url');
  });

  it.each([
    ['duplicate RSS item', { ...pipelineFeed, lastUrl: 'new-url' }, pipeline],
    ['inactive feed', { ...pipelineFeed, active: false }, pipeline],
    ['deleted feed', null, pipeline],
    ['missing Pipeline', pipelineFeed, null],
    [
      'Pipeline without enabled integrations',
      pipelineFeed,
      { ...pipeline, integrations: [] },
    ],
  ])('does nothing for a %s', async (_reason, feed, feedPipeline) => {
    const { service, repository, pipelineManager } = createService(feed);
    repository.getPipeline.mockResolvedValue(feedPipeline);

    await service.startAutopost('feed');

    expect(pipelineManager.enqueue).not.toHaveBeenCalled();
    expect(repository.updateUrl).not.toHaveBeenCalled();
  });

  it('keeps global feed scheduling behavior', async () => {
    const globalFeed = {
      ...pipelineFeed,
      pipelineId: null,
      integrations: JSON.stringify([{ id: 'linkedin' }]),
    };
    const { service, repository, posts, pipelineManager } =
      createService(globalFeed);
    (service as any)._integrationService.getIntegrationsList.mockResolvedValue([
      pipeline.integrations[0].integration,
    ]);

    await service.startAutopost('feed');

    expect(posts.createPost).toHaveBeenCalledWith(
      'org',
      expect.objectContaining({
        type: 'draft',
        posts: [expect.objectContaining({ integration: { id: 'linkedin' } })],
      }),
      'AUTOPOST'
    );
    expect(pipelineManager.enqueue).not.toHaveBeenCalled();
    expect(repository.updateUrl).toHaveBeenCalledWith('feed', 'new-url');
  });
});
