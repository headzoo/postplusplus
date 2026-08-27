import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class MediaService {} })
);
import { ImgflipService } from './imgflip.service';
import type { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';

const validTemplate = {
  id: '123',
  name: 'Drake Hotline Bling',
  url: 'https://i.imgflip.com/30b1gx.jpg',
  width: 1200,
  height: 1200,
  box_count: 2,
};

const response = (body: unknown, ok = true) =>
  ({
    ok,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response);

describe('ImgflipService', () => {
  const originalFetch = global.fetch;
  const originalUsername = process.env.IMGFLIP_USERNAME;
  const originalPassword = process.env.IMGFLIP_PASSWORD;
  let fetchMock: jest.Mock;
  let uploadFromUrl: jest.Mock;
  let service: ImgflipService;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    uploadFromUrl = jest.fn().mockResolvedValue({ id: 'media-id' });
    service = new ImgflipService({ uploadFromUrl } as unknown as MediaService);
    process.env.IMGFLIP_USERNAME = 'username';
    process.env.IMGFLIP_PASSWORD = 'password';
  });

  afterAll(() => {
    global.fetch = originalFetch;
    process.env.IMGFLIP_USERNAME = originalUsername;
    process.env.IMGFLIP_PASSWORD = originalPassword;
  });

  it('normalizes valid templates and drops malformed records', async () => {
    fetchMock.mockResolvedValue(
      response({
        success: true,
        data: {
          memes: [
            validTemplate,
            { ...validTemplate, id: null },
            { ...validTemplate, box_count: 11 },
          ],
        },
      })
    );

    await expect(service.getTemplates()).resolves.toEqual([
      {
        id: '123',
        name: 'Drake Hotline Bling',
        url: 'https://i.imgflip.com/30b1gx.jpg',
        width: 1200,
        height: 1200,
        boxCount: 2,
      },
    ]);
  });

  it('caches templates and deduplicates concurrent refreshes', async () => {
    let resolveFetch: (value: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );

    const first = service.getTemplates();
    const second = service.getTemplates();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch!(
      response({ success: true, data: { memes: [validTemplate] } })
    );
    await Promise.all([first, second]);
    await service.getTemplates();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns stale templates after a refresh failure and fails cold requests', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(0);
    fetchMock.mockResolvedValueOnce(
      response({ success: true, data: { memes: [validTemplate] } })
    );
    await service.getTemplates();

    now.mockReturnValue(60 * 60 * 1000);
    fetchMock.mockRejectedValueOnce(new Error('network failure'));
    await expect(service.getTemplates()).resolves.toHaveLength(1);

    const coldService = new ImgflipService({
      uploadFromUrl,
    } as unknown as MediaService);
    fetchMock.mockRejectedValueOnce(new Error('network failure'));
    await expect(coldService.getTemplates()).rejects.toBeInstanceOf(
      BadGatewayException
    );
    now.mockRestore();
  });

  it('requires both credentials before generating', async () => {
    delete process.env.IMGFLIP_PASSWORD;
    await expect(
      service.generateMeme({ templateId: '123', captions: [] })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('encodes all caption boxes and returns only safe generation fields', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({
          success: true,
          data: { memes: [{ ...validTemplate, box_count: 3 }] },
        })
      )
      .mockResolvedValueOnce(
        response({
          success: true,
          data: {
            url: 'https://i.imgflip.com/generated.jpg',
            page_url: 'https://imgflip.com/i/generated',
          },
        })
      );

    await expect(
      service.generateMeme({
        templateId: '123',
        captions: [{ text: 'one' }, { text: '' }, { text: 'three' }],
      })
    ).resolves.toEqual({
      url: 'https://i.imgflip.com/generated.jpg',
      pageUrl: 'https://imgflip.com/i/generated',
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api.imgflip.com/caption_image'
    );
    expect(fetchMock.mock.calls[1][1].body).toBe(
      'username=username&password=password&template_id=123&boxes%5B0%5D%5Btext%5D=one&boxes%5B1%5D%5Btext%5D=&boxes%5B2%5D%5Btext%5D=three'
    );
  });

  it('rejects unknown templates, incorrect caption counts, and failed generations', async () => {
    fetchMock.mockResolvedValue(
      response({ success: true, data: { memes: [validTemplate] } })
    );
    await expect(
      service.generateMeme({ templateId: 'missing', captions: [] })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.generateMeme({ templateId: '123', captions: [{ text: 'one' }] })
    ).rejects.toBeInstanceOf(BadRequestException);

    fetchMock.mockResolvedValueOnce(response({ success: false, data: {} }));
    await expect(
      service.generateMeme({
        templateId: '123',
        captions: [{ text: 'one' }, { text: 'two' }],
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only saves strict Imgflip generated image URLs with a derived filename', async () => {
    fetchMock.mockResolvedValue(
      response({ success: true, data: { memes: [validTemplate] } })
    );
    await service.saveGeneratedMeme('org-id', {
      templateId: '123',
      url: 'https://i.imgflip.com/abc123.jpg',
    });

    expect(uploadFromUrl).toHaveBeenCalledWith(
      'org-id',
      'https://i.imgflip.com/abc123.jpg',
      false,
      'Drake-Hotline-Bling.jpg'
    );

    for (const url of [
      'http://i.imgflip.com/abc123.jpg',
      'https://evilimgflip.com/abc123.jpg',
      'https://i.imgflip.com:444/abc123.jpg',
      'https://user@i.imgflip.com/abc123.jpg',
      'https://i.imgflip.com/not-an-image',
    ]) {
      await expect(
        service.saveGeneratedMeme('org-id', { templateId: '123', url })
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
