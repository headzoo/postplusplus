import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  CreatePostHttpLogInput,
  CreateWebhookHttpLogInput,
  LogsRepository,
} from './logs.repository';
import {
  attachPostHttpLogAxiosInterceptors,
  registerPostHttpLogWriter,
} from './http-log.context';
import {
  capHttpLogEventType,
  capHttpLogIdentity,
  readCappedHttpLogBody,
  redactHttpLogUrl,
  serializeHttpLogBody,
  serializeHttpLogHeaders,
} from './http-log.serialize';
import { getSsrfSafeAxiosInstances } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { WebhookHttpLogDirection, WebhookHttpLogSource } from '@prisma/client';

@Injectable()
export class LogsService implements OnModuleInit {
  constructor(private _logsRepository: LogsRepository) {}

  onModuleInit() {
    registerPostHttpLogWriter((context, entry) => {
      void this.createPostLog({
        organizationId: context.organizationId,
        postId: context.postId,
        integrationId: context.integrationId,
        provider: context.provider,
        ...entry,
      }).catch(() => {
        /** logging must never break publishing */
      });
    });
    attachPostHttpLogAxiosInterceptors(getSsrfSafeAxiosInstances());
  }

  createPostLog(data: CreatePostHttpLogInput) {
    return this._logsRepository.createPostLog(data);
  }

  createWebhookLog(data: CreateWebhookHttpLogInput) {
    return this._logsRepository.createWebhookLog(data);
  }

  async logOutboundWebhook(input: {
    organizationId: string;
    webhookId?: string;
    integrationId?: string;
    source: WebhookHttpLogSource;
    method: string;
    url: string;
    requestHeaders?: unknown;
    requestBody?: unknown;
    response?: Response | null;
    error?: unknown;
    sourceDisplayName?: string;
    sourceUsername?: string;
    targetDisplayName?: string;
    targetUsername?: string;
    eventType?: string;
  }) {
    try {
      const responseBody = input.response
        ? await readCappedHttpLogBody(input.response)
        : '';
      await this.createWebhookLog({
        organizationId: input.organizationId,
        webhookId: input.webhookId,
        integrationId: input.integrationId,
        direction: WebhookHttpLogDirection.OUTBOUND,
        source: input.source,
        method: input.method,
        url: redactHttpLogUrl(input.url),
        statusCode: input.response?.status,
        requestHeaders: serializeHttpLogHeaders(input.requestHeaders),
        requestBody: serializeHttpLogBody(input.requestBody),
        responseHeaders: serializeHttpLogHeaders(input.response?.headers),
        responseBody,
        error: input.error
          ? input.error instanceof Error
            ? input.error.message
            : String(input.error)
          : undefined,
        sourceDisplayName: capHttpLogIdentity(input.sourceDisplayName),
        sourceUsername: capHttpLogIdentity(input.sourceUsername),
        targetDisplayName: capHttpLogIdentity(input.targetDisplayName),
        targetUsername: capHttpLogIdentity(input.targetUsername),
        eventType: capHttpLogEventType(input.eventType),
      });
    } catch {
      /** logging must never break webhook delivery */
    }
  }

  async logInboundWebhook(input: {
    organizationId: string;
    integrationId?: string;
    method: string;
    url: string;
    statusCode?: number;
    requestHeaders?: unknown;
    requestBody?: unknown;
    responseHeaders?: unknown;
    responseBody?: unknown;
    error?: string;
    sourceDisplayName?: string;
    sourceUsername?: string;
    targetDisplayName?: string;
    targetUsername?: string;
    eventType?: string;
  }) {
    try {
      await this.createWebhookLog({
        organizationId: input.organizationId,
        integrationId: input.integrationId,
        direction: WebhookHttpLogDirection.INBOUND,
        source: WebhookHttpLogSource.CHANNEL_WEBHOOK,
        method: input.method,
        url: redactHttpLogUrl(input.url),
        statusCode: input.statusCode,
        requestHeaders: serializeHttpLogHeaders(input.requestHeaders),
        requestBody: serializeHttpLogBody(input.requestBody),
        responseHeaders: serializeHttpLogHeaders(input.responseHeaders),
        responseBody: serializeHttpLogBody(input.responseBody),
        error: input.error,
        sourceDisplayName: capHttpLogIdentity(input.sourceDisplayName),
        sourceUsername: capHttpLogIdentity(input.sourceUsername),
        targetDisplayName: capHttpLogIdentity(input.targetDisplayName),
        targetUsername: capHttpLogIdentity(input.targetUsername),
        eventType: capHttpLogEventType(input.eventType),
      });
    } catch {
      /** logging must never break webhook delivery */
    }
  }

  listPostLogs(organizationId: string, page?: number, limit?: number) {
    return this._logsRepository.listPostLogs(organizationId, page, limit);
  }

  listWebhookLogs(
    organizationId: string,
    page?: number,
    limit?: number,
    direction?: WebhookHttpLogDirection,
    search?: string,
    eventType?: string
  ) {
    return this._logsRepository.listWebhookLogs(
      organizationId,
      page,
      limit,
      direction,
      search,
      eventType
    );
  }
}
