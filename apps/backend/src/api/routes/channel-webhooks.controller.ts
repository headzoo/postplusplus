import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ChannelInteractionService } from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.service';
import { sinkIncomingWebhook } from '@gitroom/nestjs-libraries/integrations/webhook.file.sink';

const MAX_QUERY_ENTRIES = 32;
const MAX_HEADER_ENTRIES = 64;
const MAX_KEY_LENGTH = 128;
const MAX_VALUE_LENGTH = 4096;
const MAX_ARRAY_VALUES = 8;

@ApiTags('Channel webhooks')
@Controller('/channel-webhooks')
export class ChannelWebhooksController {
  constructor(
    private readonly _channelInteractionService: ChannelInteractionService
  ) {}

  @Get('/:providerIdentifier')
  async challenge(
    @Param('providerIdentifier') providerIdentifier: string,
    @Query() query: Record<string, string | string[] | undefined>
  ) {
    const boundedQuery = this.boundedValues(query, MAX_QUERY_ENTRIES);
    void sinkIncomingWebhook({
      method: 'GET',
      providerIdentifier,
      query: boundedQuery,
    });
    return this.runWithInboundLog(
      {
        providerIdentifier,
        method: 'GET',
        requestHeaders: boundedQuery,
        requestBody: boundedQuery,
      },
      async (markLogged) => {
        const result = await this._channelInteractionService.handleChallenge(
          this.boundedProviderIdentifier(providerIdentifier),
          { query: boundedQuery }
        );
        markLogged();
        if (result.accepted) {
          return result.responseBody;
        }
        throw new HttpException(
          'Channel webhook challenge rejected',
          ('statusCode' in result && result.statusCode) || 400
        );
      }
    );
  }

  @Post('/:providerIdentifier')
  async delivery(
    @Param('providerIdentifier') providerIdentifier: string,
    @Req() request: RawBodyRequest<any>
  ) {
    const rawBody = Buffer.isBuffer(request.rawBody)
      ? request.rawBody
      : undefined;
    const boundedHeaders = this.boundedValues(
      request.headers as Record<string, string | string[] | undefined>,
      MAX_HEADER_ENTRIES
    );
    void sinkIncomingWebhook({
      method: 'POST',
      providerIdentifier,
      headers: boundedHeaders,
      rawBody,
    });
    return this.runWithInboundLog(
      {
        providerIdentifier,
        method: 'POST',
        requestHeaders: boundedHeaders,
        requestBody: rawBody,
      },
      async (markLogged) => {
        if (!rawBody?.length) {
          throw new BadRequestException('Missing raw webhook body');
        }
        const result = await this._channelInteractionService.handleDelivery(
          this.boundedProviderIdentifier(providerIdentifier),
          {
            rawBody,
            headers: boundedHeaders,
          }
        );
        markLogged();
        if (result.accepted) {
          return { ok: true };
        }
        throw new HttpException(
          'Channel webhook delivery rejected',
          ('statusCode' in result && result.statusCode) || 400
        );
      }
    );
  }

  private async runWithInboundLog<T>(
    attempt: {
      providerIdentifier: string;
      method: string;
      requestHeaders?: unknown;
      requestBody?: unknown;
    },
    work: (markLogged: () => void) => Promise<T>
  ) {
    let logged = false;
    try {
      return await work(() => {
        logged = true;
      });
    } catch (error) {
      if (!logged) {
        await this._channelInteractionService.logInboundAttempt({
          providerIdentifier: this.logProviderIdentifier(
            attempt.providerIdentifier
          ),
          method: attempt.method,
          requestHeaders: attempt.requestHeaders,
          requestBody: attempt.requestBody,
          statusCode: this._channelInteractionService.statusFromError(error),
          error: this._channelInteractionService.messageFromError(error),
        });
      }
      throw error;
    }
  }

  private logProviderIdentifier(value: string) {
    return typeof value === 'string' && /^[a-z0-9_-]{1,128}$/i.test(value)
      ? value
      : 'invalid';
  }

  private boundedProviderIdentifier(value: string) {
    if (typeof value !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(value)) {
      throw new BadRequestException('Invalid channel webhook provider');
    }
    return value;
  }

  private boundedValues(
    values: Record<string, string | string[] | undefined>,
    maximumEntries: number
  ) {
    const priority: Record<string, string | string[]> = {};
    const extras: Array<[string, string | string[]]> = [];
    for (const [key, value] of Object.entries(values || {})) {
      if (!key || key.length > MAX_KEY_LENGTH) {
        continue;
      }
      const normalized = (Array.isArray(value) ? value : [value])
        .filter((item): item is string => typeof item === 'string')
        .slice(0, MAX_ARRAY_VALUES);
      if (!normalized.length) {
        continue;
      }
      const truncated = normalized.map((item) =>
        item.length > MAX_VALUE_LENGTH ? item.slice(0, MAX_VALUE_LENGTH) : item
      );
      const entry = Array.isArray(value) ? truncated : truncated[0];
      if (this.isPriorityWebhookField(key)) {
        priority[key] = entry;
      } else {
        extras.push([key, entry]);
      }
    }
    const bounded: Record<string, string | string[]> = {};
    for (const [key, entry] of [...Object.entries(priority), ...extras]) {
      if (Object.keys(bounded).length >= maximumEntries) {
        break;
      }
      bounded[key] = entry;
    }
    return bounded;
  }

  private isPriorityWebhookField(key: string) {
    const name = key.toLowerCase();
    return (
      name.includes('signature') ||
      name.includes('hmac') ||
      name.includes('crc')
    );
  }
}
