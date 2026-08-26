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

jest.mock('@gitroom/nestjs-libraries/database/prisma/media/media.service', () => ({
  MediaService: class MediaService {},
}));

jest.mock('@gitroom/nestjs-libraries/openai/openai.service', () => ({
  OpenaiService: class OpenaiService {},
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

import { PostsService } from './posts.service';
import { ShortLinkService } from '@gitroom/nestjs-libraries/short-linking/short.link.service';

const createService = ({
  integrationService,
  shortLinkService,
  integrationManager,
  repository,
}: {
  integrationService?: Record<string, jest.Mock>;
  shortLinkService?: Record<string, jest.Mock>;
  integrationManager?: Record<string, jest.Mock>;
  repository?: Record<string, jest.Mock>;
}) =>
  new PostsService(
    {
      getPipelineQueueItemForGroup: jest.fn().mockResolvedValue(null),
      getPostById: jest.fn(),
      createOrUpdatePost: jest.fn().mockResolvedValue({
        posts: [{ id: 'post-1', state: 'QUEUE' }],
      }),
      ...repository,
    } as any,
    {
      getSocialIntegration: jest.fn().mockReturnValue({}),
      ...integrationManager,
    } as any,
    {
      getIntegrationById: jest.fn().mockResolvedValue({
        utmParams: 'utm_campaign=spring&utm_track=33ed',
      }),
      ...integrationService,
    } as any,
    {} as any,
    {
      convertTextToShortLinks: jest.fn(async (_orgId, messages: string[]) =>
        messages.map((message) =>
          message.replace(
            'https://example.com/page?utm_campaign=spring&utm_track=33ed',
            'https://short.test/abc'
          )
        )
      ),
      ...shortLinkService,
    } as any,
    {} as any,
    { start: jest.fn().mockResolvedValue(undefined) } as any,
    {} as any,
    {} as any
  );

describe('PostsService channel utm params', () => {
  beforeEach(() => {
    Object.defineProperty(ShortLinkService, 'provider', {
      configurable: true,
      value: { shortLinkDomain: 'short.test' },
    });
  });

  it('appends channel utm params before shortlinking', async () => {
    const convertTextToShortLinks = jest.fn(async (_orgId, messages: string[]) =>
      messages.map(() => 'https://short.test/abc')
    );
    const service = createService({ shortLinkService: { convertTextToShortLinks } });

    await service.createPost(
      'org-a',
      {
        type: 'schedule',
        date: '2026-08-26T12:00:00',
        shortLink: true,
        posts: [
          {
            integration: { id: 'channel-a' },
            value: [{ content: 'Visit https://example.com/page today' }],
            settings: { __type: 'x-now' },
          },
        ],
      } as any,
      'WEB'
    );

    expect(convertTextToShortLinks).toHaveBeenCalledWith('org-a', [
      'Visit https://example.com/page?utm_campaign=spring&utm_track=33ed today',
    ]);
  });

  it('skips utm when the provider strips links', async () => {
    const convertTextToShortLinks = jest.fn(async (_orgId, messages: string[]) =>
      messages
    );
    const service = createService({
      integrationManager: {
        getSocialIntegration: jest.fn().mockReturnValue({
          stripLinks: () => true,
        }),
      },
      shortLinkService: { convertTextToShortLinks },
    });

    await service.createPost(
      'org-a',
      {
        type: 'schedule',
        date: '2026-08-26T12:00:00',
        shortLink: true,
        posts: [
          {
            integration: { id: 'channel-a' },
            value: [{ content: 'Visit https://example.com/page today' }],
            settings: { __type: 'x-now' },
          },
        ],
      } as any,
      'WEB'
    );

    expect(convertTextToShortLinks).toHaveBeenCalledWith('org-a', [
      'Visit https://example.com/page today',
    ]);
  });

  it('skips utm when the channel has no params configured', async () => {
    const convertTextToShortLinks = jest.fn(async (_orgId, messages: string[]) =>
      messages
    );
    const service = createService({
      integrationService: {
        getIntegrationById: jest.fn().mockResolvedValue({ utmParams: null }),
      },
      shortLinkService: { convertTextToShortLinks },
    });

    await service.createPost(
      'org-a',
      {
        type: 'schedule',
        date: '2026-08-26T12:00:00',
        shortLink: false,
        posts: [
          {
            integration: { id: 'channel-a' },
            value: [{ content: 'Visit https://example.com/page today' }],
            settings: { __type: 'x-now' },
          },
        ],
      } as any,
      'WEB'
    );

    expect(convertTextToShortLinks).not.toHaveBeenCalled();
  });
});
