jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
  socialIntegrationList: [],
}));

jest.mock('@sentry/nestjs', () => ({
  metrics: { count: jest.fn() },
}));

jest.mock('@gitroom/nestjs-libraries/dtos/posts/create.post.dto', () => ({
  CreatePostDto: class CreatePostDto {},
}));

jest.mock('@gitroom/helpers/utils/strip.html.validation', () => ({
  stripHtmlValidation: jest.fn((_: string, content: string) => content),
}));

jest.mock('@gitroom/helpers/utils/count.length', () => ({
  weightedLength: (value: string) => value.length,
}));

jest.mock('nestjs-temporal-core', () => ({
  TemporalService: class TemporalService {},
}));

jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({
    MediaService: class MediaService {},
  })
);

jest.mock('@gitroom/nestjs-libraries/openai/openai.service', () => ({
  OpenaiService: class OpenaiService {},
}));

jest.mock('@gitroom/nestjs-libraries/short-linking/short.link.service', () => ({
  ShortLinkService: class ShortLinkService {},
}));

jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));

jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({
    RefreshIntegrationService: class RefreshIntegrationService {},
  })
);

jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: { get: jest.fn(), set: jest.fn() },
}));

import { BadRequestException } from '@nestjs/common';
import { PostsService } from './posts.service';

const createService = ({
  repository,
  integrationManager,
  temporal,
}: {
  repository?: Record<string, jest.Mock>;
  integrationManager?: Record<string, jest.Mock>;
  temporal?: { start: jest.Mock };
}) => {
  const start = temporal?.start || jest.fn().mockResolvedValue(undefined);
  return new PostsService(
    {
      getPipelineQueueItemForGroup: jest.fn().mockResolvedValue(null),
      getPostById: jest.fn(),
      createOrUpdatePost: jest.fn(),
      ...repository,
    } as any,
    {
      getSocialIntegration: jest.fn(),
      ...integrationManager,
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {
      client: {
        getRawClient: () => ({
          workflow: { start },
        }),
      },
    } as any,
    {} as any,
    {
      isLikerSyncPausedForIntegration: jest.fn().mockResolvedValue(false),
    } as any,
    {
      prepareLeadCaptureLinks: jest.fn(
        async ({ values }: { values: { content: string }[] }) =>
          values.map(({ content }) => content)
      ),
    } as any
  );
};

describe('PostsService published post edits', () => {
  it('exposes canEdit from the provider supportsEdit contract', () => {
    const getSocialIntegration = jest.fn().mockReturnValue({
      supportsEdit: () => true,
    });
    const service = createService({
      integrationManager: { getSocialIntegration },
    });

    expect(
      service.publishedPostCanEdit({
        state: 'PUBLISHED',
        publishDate: new Date(),
        releaseId: 'tweet-1',
        integration: { providerIdentifier: 'x' },
      })
    ).toBe(true);
    expect(
      service.publishedPostCanEdit({
        state: 'QUEUE',
        publishDate: new Date(),
        releaseId: 'tweet-1',
        integration: { providerIdentifier: 'x' },
      })
    ).toBe(false);
  });

  it('rejects published updates when the channel cannot edit', async () => {
    const service = createService({
      repository: {
        getPostById: jest.fn().mockResolvedValue({
          id: 'post-1',
          state: 'PUBLISHED',
          publishDate: new Date(),
          releaseId: 'live-1',
          integration: { providerIdentifier: 'linkedin' },
        }),
      },
      integrationManager: {
        getSocialIntegration: jest.fn().mockReturnValue({}),
      },
    });

    await expect(
      service.createPost(
        'org',
        {
          type: 'update',
          date: '2026-08-19T12:00:00',
          shortLink: false,
          tags: [],
          posts: [
            {
              group: 'group-1',
              integration: { id: 'int-1' },
              settings: { __type: 'linkedin' },
              value: [{ id: 'post-1', content: 'Hello', delay: 0, image: [] }],
            },
          ],
        } as any,
        'WEB'
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('starts the edit workflow for a published post that can be edited', async () => {
    const start = jest.fn().mockResolvedValue(undefined);
    const service = createService({
      repository: {
        getPostById: jest.fn().mockResolvedValue({
          id: 'post-1',
          state: 'PUBLISHED',
          publishDate: new Date(),
          releaseId: 'tweet-1',
          integration: { providerIdentifier: 'x' },
        }),
        createOrUpdatePost: jest.fn().mockResolvedValue({
          posts: [{ id: 'post-1', state: 'PUBLISHED' }],
        }),
      },
      integrationManager: {
        getSocialIntegration: jest.fn().mockReturnValue({
          supportsEdit: () => true,
          stripLinks: () => false,
        }),
      },
      temporal: { start },
    });

    await service.createPost(
      'org',
      {
        type: 'update',
        date: '2026-08-19T12:00:00',
        shortLink: false,
        tags: [],
        posts: [
          {
            group: 'group-1',
            integration: { id: 'int-1' },
            settings: { __type: 'x' },
            value: [{ id: 'post-1', content: 'Hello', delay: 0, image: [] }],
          },
        ],
      } as any,
      'WEB'
    );

    await new Promise((resolve) => setImmediate(resolve));
    expect(start).toHaveBeenCalledWith(
      'postEditWorkflowV1',
      expect.objectContaining({
        workflowId: 'post_edit_post-1',
        args: [
          expect.objectContaining({
            taskQueue: 'x',
            postId: 'post-1',
            organizationId: 'org',
          }),
        ],
      })
    );
  });
});
