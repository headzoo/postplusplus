import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  GenerateImgflipMemeDto,
  SaveImgflipMemeDto,
} from '@gitroom/nestjs-libraries/dtos/media/imgflip.dto';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';

const IMGFLIP_API_URL = 'https://api.imgflip.com';
const CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

export type ImgflipTemplate = {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  boxCount: number;
};

export type ImgflipGeneration = {
  url: string;
  pageUrl?: string;
};

type ImgflipApiTemplate = {
  id?: unknown;
  name?: unknown;
  url?: unknown;
  width?: unknown;
  height?: unknown;
  box_count?: unknown;
};

type ImgflipApiResponse = {
  success?: unknown;
  error_message?: unknown;
  data?: {
    memes?: unknown;
    url?: unknown;
    page_url?: unknown;
  };
};

@Injectable()
export class ImgflipService {
  private templates?: { values: ImgflipTemplate[]; fetchedAt: number };
  private templateRefresh?: Promise<ImgflipTemplate[]>;

  constructor(private _mediaService: MediaService) {}

  async getTemplates(): Promise<ImgflipTemplate[]> {
    if (
      this.templates &&
      Date.now() - this.templates.fetchedAt < CACHE_TTL_MS
    ) {
      return this.templates.values;
    }

    if (!this.templateRefresh) {
      this.templateRefresh = this.refreshTemplates().finally(() => {
        this.templateRefresh = undefined;
      });
    }

    try {
      return await this.templateRefresh;
    } catch {
      if (this.templates) {
        return this.templates.values;
      }
      throw new BadGatewayException('Imgflip templates are unavailable');
    }
  }

  async generateMeme(dto: GenerateImgflipMemeDto): Promise<ImgflipGeneration> {
    const { username, password } = this.getCredentials();
    const template = await this.getTemplate(dto.templateId);

    if (dto.captions.length !== template.boxCount) {
      throw new BadRequestException('Caption count does not match template');
    }

    const form = new URLSearchParams({
      username,
      password,
      template_id: template.id,
    });
    dto.captions.forEach(({ text }, index) => {
      form.set(`boxes[${index}][text]`, text);
    });

    const response = await this.request('/caption_image', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    if (response.success !== true) {
      throw new BadRequestException('Imgflip could not generate meme');
    }

    const url = this.safeHttpsUrl(response.data?.url);
    if (!url) {
      throw new BadGatewayException(
        'Imgflip returned an invalid generated meme'
      );
    }

    const pageUrl = this.safeImgflipPageUrl(response.data?.page_url);
    return pageUrl ? { url, pageUrl } : { url };
  }

  async saveGeneratedMeme(organizationId: string, dto: SaveImgflipMemeDto) {
    const template = await this.getTemplate(dto.templateId);
    const url = this.validateGeneratedImageUrl(dto.url);

    return this._mediaService.uploadFromUrl(
      organizationId,
      url.toString(),
      false,
      this.originalName(template.name, url)
    );
  }

  private async getTemplate(templateId: string) {
    const template = (await this.getTemplates()).find(
      ({ id }) => id === templateId
    );
    if (!template) {
      throw new BadRequestException('Unknown Imgflip template');
    }
    return template;
  }

  private getCredentials() {
    const username = process.env.IMGFLIP_USERNAME;
    const password = process.env.IMGFLIP_PASSWORD;
    if (!username || !password) {
      throw new ServiceUnavailableException('Imgflip is not configured');
    }
    return { username, password };
  }

  private async refreshTemplates(): Promise<ImgflipTemplate[]> {
    const response = await this.request('/get_memes');
    if (response.success !== true || !Array.isArray(response.data?.memes)) {
      throw new BadGatewayException('Imgflip templates are unavailable');
    }

    const values = response.data.memes
      .map((template) => this.normalizeTemplate(template))
      .filter((template): template is ImgflipTemplate => !!template);

    if (!values.length) {
      throw new BadGatewayException('Imgflip templates are unavailable');
    }

    this.templates = { values, fetchedAt: Date.now() };
    return values;
  }

  private normalizeTemplate(value: unknown): ImgflipTemplate | null {
    const template = value as ImgflipApiTemplate;
    const id = typeof template.id === 'string' ? template.id : '';
    const name = typeof template.name === 'string' ? template.name.trim() : '';
    const url = this.safeHttpsUrl(template.url);
    const width = Number(template.width);
    const height = Number(template.height);
    const boxCount = Number(template.box_count);

    if (
      !id ||
      id.length > 64 ||
      !name ||
      name.length > 200 ||
      !url ||
      !Number.isInteger(width) ||
      width <= 0 ||
      !Number.isInteger(height) ||
      height <= 0 ||
      !Number.isInteger(boxCount) ||
      boxCount < 0 ||
      boxCount > 10
    ) {
      return null;
    }

    return { id, name, url, width, height, boxCount };
  }

  private async request(
    path: '/get_memes' | '/caption_image',
    init?: RequestInit
  ): Promise<ImgflipApiResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${IMGFLIP_API_URL}${path}`, {
        ...init,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new BadGatewayException('Imgflip is unavailable');
      }

      const body = (await response.json()) as unknown;
      if (!body || typeof body !== 'object') {
        throw new BadGatewayException('Imgflip returned an invalid response');
      }
      return body as ImgflipApiResponse;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }
      throw new BadGatewayException('Imgflip is unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }

  private safeHttpsUrl(value: unknown) {
    if (typeof value !== 'string') {
      return null;
    }
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password
        ? url.toString()
        : null;
    } catch {
      return null;
    }
  }

  private safeImgflipPageUrl(value: unknown) {
    const url = this.safeHttpsUrl(value);
    if (!url) {
      return null;
    }
    const hostname = new URL(url).hostname;
    return hostname === 'imgflip.com' || hostname === 'www.imgflip.com'
      ? url
      : null;
  }

  private validateGeneratedImageUrl(value: string) {
    try {
      const url = new URL(value);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.port ||
        url.hostname !== 'i.imgflip.com' ||
        !/^\/[a-zA-Z0-9_-]+\.(?:jpe?g|png|gif|webp)$/i.test(url.pathname)
      ) {
        throw new Error();
      }
      return url;
    } catch {
      throw new BadRequestException('Invalid Imgflip generated image URL');
    }
  }

  private originalName(templateName: string, url: URL) {
    const extension = url.pathname.split('.').pop()?.toLowerCase() || 'jpg';
    const name = templateName
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100);
    return `${name || 'imgflip-meme'}.${extension}`;
  }
}
