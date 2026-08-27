import { HttpException, Injectable } from '@nestjs/common';
import { MediaRepository } from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { generationError } from '@gitroom/nestjs-libraries/openai/generation.error';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { Organization } from '@prisma/client';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { GiphyService } from '@gitroom/nestjs-libraries/giphy/giphy.service';
import { getMaxSize } from '@gitroom/nestjs-libraries/upload/custom.upload.validation';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { Readable } from 'stream';
import { OpenGraphRepository } from '@gitroom/nestjs-libraries/database/prisma/media/open.graph.repository';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fromBuffer } = require('file-type');

const ALLOWED_MIME = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'video/mp4',
]);

@Injectable()
export class MediaService {
  private storage = UploadFactory.createStorage();

  constructor(
    private _mediaRepository: MediaRepository,
    private _openAi: OpenaiService,
    private _subscriptionService: SubscriptionService,
    private _videoManager: VideoManager,
    private _giphyService: GiphyService,
    private _openGraphRepository: OpenGraphRepository
  ) {}

  getOpenGraph(url: string) {
    return this._openGraphRepository.getOpenGraph(url);
  }

  async deleteMedia(org: string, id: string) {
    return this._mediaRepository.deleteMedia(org, id);
  }

  getMediaById(id: string) {
    return this._mediaRepository.getMediaById(id);
  }

  async generateImage(
    prompt: string,
    org: Organization,
    generatePromptFirst?: boolean
  ) {
    try {
      const generating = await this._subscriptionService.useCredit(
        org,
        'ai_images',
        async () => {
          if (generatePromptFirst) {
            prompt = await this._openAi.generatePromptForPicture(prompt);
            console.log('Prompt:', prompt);
          }
          return this._openAi.generateImage(prompt);
        }
      );

      return generating;
    } catch (err) {
      throw generationError(err);
    }
  }

  saveFile(
    org: string,
    fileName: string,
    filePath: string,
    originalName?: string,
    hidden = false
  ) {
    return this._mediaRepository.saveFile(
      org,
      fileName,
      filePath,
      originalName,
      hidden
    );
  }

  getMedia(org: string, page: number, search?: string) {
    return this._mediaRepository.getMedia(org, page, search);
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._mediaRepository.saveMediaInformation(org, data);
  }

  async generateAlt(org: Organization, mediaId: string) {
    const media = await this.getMediaById(mediaId);
    if (!media || media.organizationId !== org.id || media.deletedAt) {
      throw new HttpException('Media not found', 404);
    }

    if (hasExtension(media.path, 'mp4')) {
      throw new HttpException('Alt text can only be generated for images', 400);
    }

    const total = await this._subscriptionService.checkCredits(org);
    if (process.env.STRIPE_PUBLISHABLE_KEY && total.credits <= 0) {
      throw new HttpException('You have no AI credits left', 400);
    }

    try {
      return await this._subscriptionService.useCredit(
        org,
        'ai_images',
        async () => {
          const alt = await this._openAi.generateAltText(media.path);
          return this.saveMediaInformation(org.id, {
            id: media.id,
            alt,
            thumbnail: media.thumbnail || undefined,
            thumbnailTimestamp: media.thumbnailTimestamp ?? undefined,
          } as SaveMediaInformationDto);
        }
      );
    } catch (err) {
      throw generationError(err);
    }
  }

  searchGifs(q: string, offset = 0, limit = 25) {
    return this._giphyService.search(q, offset, limit);
  }

  trendingGifs(offset = 0, limit = 25) {
    return this._giphyService.trending(offset, limit);
  }

  async uploadFromUrl(
    org: string,
    url: string,
    hidden = false,
    originalName?: string
  ) {
    let response: globalThis.Response;
    try {
      response = await fetch(url, {
        // @ts-ignore — undici option, not in lib.dom fetch types
        dispatcher: ssrfSafeDispatcher,
      });
    } catch {
      throw new HttpException({ msg: 'Failed to fetch URL' }, 400);
    }

    if (!response.ok) {
      throw new HttpException({ msg: 'Failed to fetch URL' }, 400);
    }

    const maxDownloadSize = getMaxSize('video/mp4');
    const declaredSize = Number(response.headers.get('content-length'));
    if (declaredSize && declaredSize > maxDownloadSize) {
      throw new HttpException({ msg: 'File is too large.' }, 400);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const detected = await fromBuffer(buffer);
    if (!detected || !ALLOWED_MIME.has(detected.mime)) {
      throw new HttpException({ msg: 'Unsupported file type.' }, 400);
    }

    if (buffer.length > getMaxSize(detected.mime)) {
      throw new HttpException({ msg: 'File is too large.' }, 400);
    }

    const getFile = await this.storage.uploadFile({
      buffer,
      mimetype: detected.mime,
      size: buffer.length,
      path: '',
      fieldname: '',
      destination: '',
      stream: new Readable(),
      filename: '',
      originalname: `upload.${detected.ext}`,
      encoding: '',
    });

    return this.saveFile(
      org,
      getFile.originalname,
      getFile.path,
      originalName || getFile.originalname,
      hidden
    );
  }

  getVideoOptions() {
    return this._videoManager.getAllVideos();
  }

  async generateVideoAllowed(org: Organization, type: string) {
    const video = this._videoManager.getVideoByName(type);
    if (!video) {
      throw new Error(`Video type ${type} not found`);
    }

    if (!video.trial && org.isTrailing) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    return true;
  }

  async generateVideo(org: Organization, body: VideoDto) {
    try {
      const totalCredits = await this._subscriptionService.checkCredits(
        org,
        'ai_videos'
      );

      if (totalCredits.credits <= 0) {
        throw new SubscriptionException({
          action: AuthorizationActions.Create,
          section: Sections.VIDEOS_PER_MONTH,
        });
      }

      const video = this._videoManager.getVideoByName(body.type);
      if (!video) {
        throw new Error(`Video type ${body.type} not found`);
      }

      if (!video.trial && org.isTrailing) {
        throw new HttpException(
          'This video is not available in trial mode',
          406
        );
      }

      console.log(body.customParams);
      await video.instance.processAndValidate(body.customParams);
      console.log('no err');

      return await this._subscriptionService.useCredit(
        org,
        'ai_videos',
        async () => {
          const loadedData = await video.instance.process(
            body.output,
            body.customParams
          );

          const file = await this.storage.uploadSimple(loadedData);
          return this.saveFile(org.id, file.split('/').pop(), file);
        }
      );
    } catch (err) {
      throw generationError(err);
    }
  }

  async videoFunction(identifier: string, functionName: string, body: any) {
    const video = this._videoManager.getVideoByName(identifier);
    if (!video) {
      throw new Error(`Video with identifier ${identifier} not found`);
    }

    // @ts-ignore
    const functionToCall = video.instance[functionName];
    if (
      typeof functionToCall !== 'function' ||
      this._videoManager.checkAvailableVideoFunction(functionToCall)
    ) {
      throw new HttpException(
        `Function ${functionName} not found on video instance`,
        400
      );
    }

    return functionToCall(body);
  }
}
