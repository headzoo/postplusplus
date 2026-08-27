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

const imageMedia = {
  id: 'media-1',
  organizationId: 'org-1',
  path: 'https://cdn.example.com/photo.jpg',
  deletedAt: null,
  thumbnail: null,
  thumbnailTimestamp: null,
};

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
