jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: {
    createStorage: () => ({
      uploadFile: jest.fn(),
      uploadSimple: jest.fn(),
    }),
  },
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class SubscriptionService {} })
);
jest.mock('@gitroom/nestjs-libraries/openai/openai.service', () => ({
  OpenaiService: class OpenaiService {},
}));
jest.mock('@gitroom/nestjs-libraries/videos/video.manager', () => ({
  VideoManager: class VideoManager {},
}));
jest.mock('@gitroom/nestjs-libraries/giphy/giphy.service', () => ({
  GiphyService: class GiphyService {},
}));
jest.mock('./open.graph.repository', () => ({
  OpenGraphRepository: class OpenGraphRepository {},
}));
jest.mock('./media.repository', () => ({
  MediaRepository: class MediaRepository {},
}));
jest.mock(
  '@gitroom/backend/services/auth/permissions/permission.exception.class',
  () => ({
    AuthorizationActions: { Create: 'create' },
    Sections: { VIDEOS_PER_MONTH: 'videos_per_month', AI: 'ai' },
    SubscriptionException: class SubscriptionException extends Error {},
  }),
  { virtual: true }
);

import { HttpException } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { MediaService } from './media.service';
import { MediaRepository } from './media.repository';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import { GiphyService } from '@gitroom/nestjs-libraries/giphy/giphy.service';
import { OpenGraphRepository } from './open.graph.repository';

const org = { id: 'org-1' } as Organization;

const eligibleReferenceMedia = (path: string) => ({
  path,
  deletedAt: null,
  organizationId: 'org-1',
  type: 'image',
});

const imageMedia = {
  id: 'media-1',
  organizationId: 'org-1',
  path: 'https://cdn.example.com/photo.jpg',
  deletedAt: null,
  thumbnail: null,
  thumbnailTimestamp: null,
};

describe('MediaService.generateImage', () => {
  let getPipelineReferenceImages: jest.Mock;
  let generateImage: jest.Mock;
  let generatePromptForPicture: jest.Mock;
  let useCredit: jest.Mock;
  let service: MediaService;

  beforeEach(() => {
    getPipelineReferenceImages = jest.fn();
    generateImage = jest.fn().mockResolvedValue('aW1hZ2U=');
    generatePromptForPicture = jest.fn().mockResolvedValue('expanded prompt');
    useCredit = jest.fn(async (_organization, _type, func) => func());

    service = new MediaService(
      { getPipelineReferenceImages } as unknown as MediaRepository,
      {
        generateImage,
        generatePromptForPicture,
      } as unknown as OpenaiService,
      { useCredit } as unknown as SubscriptionService,
      {} as VideoManager,
      {} as GiphyService,
      {} as OpenGraphRepository
    );
  });

  it('uses prompt-only generation when no Pipeline is supplied', async () => {
    await expect(service.generateImage('A cat', org)).resolves.toBe('aW1hZ2U=');

    expect(getPipelineReferenceImages).not.toHaveBeenCalled();
    expect(generateImage).toHaveBeenCalledWith('A cat', false, []);
    expect(useCredit).toHaveBeenCalledTimes(1);
    expect(useCredit).toHaveBeenCalledWith(
      org,
      'ai_images',
      expect.any(Function)
    );
  });

  it('uses every Pipeline reference in stored order', async () => {
    getPipelineReferenceImages.mockResolvedValue({
      referenceImages: [
        {
          position: 0,
          media: eligibleReferenceMedia('https://cdn.example.com/first.jpg'),
        },
        {
          position: 1,
          media: eligibleReferenceMedia('https://cdn.example.com/second.jpg'),
        },
        {
          position: 2,
          media: eligibleReferenceMedia('https://cdn.example.com/third.jpg'),
        },
      ],
    });

    await service.generateImage('A cat', org, false, 'pipeline-1');

    expect(getPipelineReferenceImages).toHaveBeenCalledWith(
      'org-1',
      'pipeline-1'
    );
    expect(generateImage).toHaveBeenCalledWith('A cat', false, [
      'https://cdn.example.com/first.jpg',
      'https://cdn.example.com/second.jpg',
      'https://cdn.example.com/third.jpg',
    ]);
    expect(useCredit).toHaveBeenCalledTimes(1);
  });

  it('rejects missing, foreign, or deleted Pipelines without charging', async () => {
    getPipelineReferenceImages.mockResolvedValue(null);

    await expect(
      service.generateImage('A cat', org, false, 'foreign-pipeline')
    ).rejects.toMatchObject({ status: 404 });

    expect(useCredit).not.toHaveBeenCalled();
    expect(generateImage).not.toHaveBeenCalled();
  });

  it('honors an explicit reference opt-out', async () => {
    await service.generateImage('A cat', org, false, 'pipeline-1', false);

    expect(getPipelineReferenceImages).not.toHaveBeenCalled();
    expect(generateImage).toHaveBeenCalledWith('A cat', false, []);
  });

  it('uses prompt-only generation when a Pipeline has no reference images', async () => {
    getPipelineReferenceImages.mockResolvedValue({
      referenceImages: [],
    });

    await service.generateImage('A cat', org, false, 'pipeline-1');

    expect(generateImage).toHaveBeenCalledWith('A cat', false, []);
    expect(useCredit).toHaveBeenCalledTimes(1);
  });

  it('rejects soft-deleted Pipeline references before charging credits', async () => {
    getPipelineReferenceImages.mockResolvedValue({
      referenceImages: [
        {
          position: 0,
          media: {
            ...eligibleReferenceMedia('https://cdn.example.com/deleted.jpg'),
            deletedAt: new Date(),
          },
        },
      ],
    });

    await expect(
      service.generateImage('A cat', org, false, 'pipeline-1')
    ).rejects.toMatchObject({ status: 400 });

    expect(useCredit).not.toHaveBeenCalled();
    expect(generateImage).not.toHaveBeenCalled();
  });

  it('rejects mixed valid and deleted references without calling OpenAI', async () => {
    getPipelineReferenceImages.mockResolvedValue({
      referenceImages: [
        {
          position: 0,
          media: eligibleReferenceMedia('https://cdn.example.com/valid.jpg'),
        },
        {
          position: 1,
          media: {
            ...eligibleReferenceMedia('https://cdn.example.com/deleted.jpg'),
            deletedAt: new Date(),
          },
        },
      ],
    });

    await expect(
      service.generateImage('A cat', org, false, 'pipeline-1')
    ).rejects.toMatchObject({ status: 400 });

    expect(useCredit).not.toHaveBeenCalled();
    expect(generateImage).not.toHaveBeenCalled();
  });

  it('rejects foreign, non-image, and excess Pipeline references before charging', async () => {
    getPipelineReferenceImages.mockResolvedValue({
      referenceImages: [
        {
          position: 0,
          media: {
            ...eligibleReferenceMedia('https://cdn.example.com/foreign.jpg'),
            organizationId: 'org-other',
          },
        },
      ],
    });

    await expect(
      service.generateImage('A cat', org, false, 'pipeline-1')
    ).rejects.toMatchObject({ status: 400 });
    expect(useCredit).not.toHaveBeenCalled();

    getPipelineReferenceImages.mockResolvedValue({
      referenceImages: [
        {
          position: 0,
          media: {
            ...eligibleReferenceMedia('https://cdn.example.com/clip.mp4'),
            type: 'video',
          },
        },
      ],
    });

    await expect(
      service.generateImage('A cat', org, false, 'pipeline-1')
    ).rejects.toMatchObject({ status: 400 });
    expect(useCredit).not.toHaveBeenCalled();

    getPipelineReferenceImages.mockResolvedValue({
      referenceImages: Array.from({ length: 4 }, (_, position) => ({
        position,
        media: eligibleReferenceMedia(
          `https://cdn.example.com/${position}.jpg`
        ),
      })),
    });

    await expect(
      service.generateImage('A cat', org, false, 'pipeline-1')
    ).rejects.toMatchObject({ status: 400 });
    expect(useCredit).not.toHaveBeenCalled();
    expect(generateImage).not.toHaveBeenCalled();
  });

  it('rewrites prompts before reference-aware generation', async () => {
    getPipelineReferenceImages.mockResolvedValue({
      referenceImages: [
        {
          position: 0,
          media: eligibleReferenceMedia('https://cdn.example.com/cat.jpg'),
        },
      ],
    });

    await service.generateImage('A cat', org, true, 'pipeline-1');

    expect(generatePromptForPicture).toHaveBeenCalledWith('A cat');
    expect(generateImage).toHaveBeenCalledWith('expanded prompt', false, [
      'https://cdn.example.com/cat.jpg',
    ]);
  });
});

describe('MediaService.generateAlt', () => {
  const originalStripe = process.env.STRIPE_PUBLISHABLE_KEY;
  let getMediaById: jest.Mock;
  let saveMediaInformation: jest.Mock;
  let generateAltText: jest.Mock;
  let checkCredits: jest.Mock;
  let useCredit: jest.Mock;
  let service: MediaService;

  beforeEach(() => {
    process.env.STRIPE_PUBLISHABLE_KEY = originalStripe;
    getMediaById = jest.fn().mockResolvedValue(imageMedia);
    saveMediaInformation = jest.fn().mockResolvedValue({
      ...imageMedia,
      alt: 'A cat sitting on a windowsill',
    });
    generateAltText = jest
      .fn()
      .mockResolvedValue('A cat sitting on a windowsill');
    checkCredits = jest.fn().mockResolvedValue({ credits: 5 });
    useCredit = jest.fn(async (_organization, _type, func) => func());

    service = new MediaService(
      {
        getMediaById,
        saveMediaInformation,
      } as unknown as MediaRepository,
      { generateAltText } as unknown as OpenaiService,
      { checkCredits, useCredit } as unknown as SubscriptionService,
      {} as VideoManager,
      {} as GiphyService,
      {} as OpenGraphRepository
    );
  });

  afterAll(() => {
    process.env.STRIPE_PUBLISHABLE_KEY = originalStripe;
  });

  it('generates alt text, charges ai_images credits, and persists it on the same media row', async () => {
    const result = await service.generateAlt(org, 'media-1');

    expect(getMediaById).toHaveBeenCalledWith('media-1');
    expect(useCredit).toHaveBeenCalledWith(
      org,
      'ai_images',
      expect.any(Function)
    );
    expect(generateAltText).toHaveBeenCalledWith(imageMedia.path);
    expect(saveMediaInformation).toHaveBeenCalledWith('org-1', {
      id: 'media-1',
      alt: 'A cat sitting on a windowsill',
      thumbnail: undefined,
      thumbnailTimestamp: undefined,
    });
    expect(result).toEqual({
      ...imageMedia,
      alt: 'A cat sitting on a windowsill',
    });
  });

  it('rejects media that belongs to another organization', async () => {
    getMediaById.mockResolvedValue({
      ...imageMedia,
      organizationId: 'org-other',
    });

    await expect(service.generateAlt(org, 'media-1')).rejects.toMatchObject({
      status: 404,
    });
    expect(useCredit).not.toHaveBeenCalled();
    expect(generateAltText).not.toHaveBeenCalled();
  });

  it('rejects missing or deleted media', async () => {
    getMediaById.mockResolvedValueOnce(null);
    await expect(service.generateAlt(org, 'missing')).rejects.toBeInstanceOf(
      HttpException
    );

    getMediaById.mockResolvedValueOnce({
      ...imageMedia,
      deletedAt: new Date(),
    });
    await expect(service.generateAlt(org, 'media-1')).rejects.toMatchObject({
      status: 404,
    });
    expect(useCredit).not.toHaveBeenCalled();
  });

  it('rejects videos', async () => {
    getMediaById.mockResolvedValue({
      ...imageMedia,
      path: 'https://cdn.example.com/clip.mp4',
    });

    await expect(service.generateAlt(org, 'media-1')).rejects.toMatchObject({
      status: 400,
    });
    expect(useCredit).not.toHaveBeenCalled();
    expect(generateAltText).not.toHaveBeenCalled();
  });

  it('rejects generation when billing is enabled and no credits remain', async () => {
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
    checkCredits.mockResolvedValue({ credits: 0 });

    await expect(service.generateAlt(org, 'media-1')).rejects.toMatchObject({
      status: 400,
    });
    expect(useCredit).not.toHaveBeenCalled();
    expect(generateAltText).not.toHaveBeenCalled();
  });

  it('wraps OpenAI failures without leaving a persisted alt value', async () => {
    generateAltText.mockRejectedValue(new Error('upstream failed'));

    await expect(service.generateAlt(org, 'media-1')).rejects.toBeInstanceOf(
      HttpException
    );
    expect(saveMediaInformation).not.toHaveBeenCalled();
  });
});
