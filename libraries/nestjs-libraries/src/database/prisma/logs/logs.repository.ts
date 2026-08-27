import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { WebhookHttpLogDirection, WebhookHttpLogSource } from '@prisma/client';

export type CreatePostHttpLogInput = {
  organizationId: string;
  postId?: string;
  integrationId?: string;
  provider: string;
  method: string;
  url: string;
  statusCode?: number;
  requestHeaders: string;
  requestBody: string;
  responseHeaders: string;
  responseBody: string;
  error?: string;
};

export type CreateWebhookHttpLogInput = {
  organizationId: string;
  webhookId?: string;
  integrationId?: string;
  direction: WebhookHttpLogDirection;
  source: WebhookHttpLogSource;
  method: string;
  url: string;
  statusCode?: number;
  requestHeaders: string;
  requestBody: string;
  responseHeaders: string;
  responseBody: string;
  error?: string;
  sourceDisplayName?: string;
  sourceUsername?: string;
  targetDisplayName?: string;
  targetUsername?: string;
  eventType?: string;
};

@Injectable()
export class LogsRepository {
  constructor(
    private _postHttpLog: PrismaRepository<'postHttpLog'>,
    private _webhookHttpLog: PrismaRepository<'webhookHttpLog'>
  ) {}

  createPostLog(data: CreatePostHttpLogInput) {
    return this._postHttpLog.model.postHttpLog.create({ data });
  }

  createWebhookLog(data: CreateWebhookHttpLogInput) {
    return this._webhookHttpLog.model.webhookHttpLog.create({ data });
  }

  async listPostLogs(organizationId: string, page = 0, limit = 20) {
    const safePage = Math.max(0, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const skip = safePage * safeLimit;
    const where = { organizationId };
    const [items, total] = await Promise.all([
      this._postHttpLog.model.postHttpLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this._postHttpLog.model.postHttpLog.count({ where }),
    ]);
    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      hasMore: skip + items.length < total,
    };
  }

  async listWebhookLogs(
    organizationId: string,
    page = 0,
    limit = 20,
    direction?: WebhookHttpLogDirection,
    search?: string,
    eventType?: string
  ) {
    const safePage = Math.max(0, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const skip = safePage * safeLimit;
    const searchTerm = search?.trim();
    const where = {
      organizationId,
      ...(direction ? { direction } : {}),
      ...(eventType ? { eventType } : {}),
      ...(searchTerm
        ? {
            OR: [
              {
                sourceDisplayName: {
                  contains: searchTerm,
                  mode: 'insensitive' as const,
                },
              },
              {
                sourceUsername: {
                  contains: searchTerm,
                  mode: 'insensitive' as const,
                },
              },
              {
                targetDisplayName: {
                  contains: searchTerm,
                  mode: 'insensitive' as const,
                },
              },
              {
                targetUsername: {
                  contains: searchTerm,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this._webhookHttpLog.model.webhookHttpLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this._webhookHttpLog.model.webhookHttpLog.count({ where }),
    ]);
    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      hasMore: skip + items.length < total,
    };
  }
}
