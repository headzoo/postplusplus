import { Injectable } from '@nestjs/common';
import { PipelineQueueItemStatus, Prisma } from '@prisma/client';
import {
  CreatePipelineDto,
  UpdatePipelineDto,
} from '@gitroom/nestjs-libraries/dtos/pipelines/pipeline.dto';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { parseSkillFilename } from '@gitroom/nestjs-libraries/upload/context-document.upload.validation';

const QUEUE_POSITION_INCREMENT = 1024;
const TRANSACTION_ATTEMPTS = 3;

class PipelineQueueChangedError extends Error {}
class PipelineScheduleRevisionChangedError extends Error {}
class PipelineScheduleSourceChangedError extends Error {}
class PipelineContextDocumentsChangedError extends Error {}
class PipelineSkillContextDocumentsChangedError extends Error {}

export const activePipelineIntegrationWhere = {
  deletedAt: null,
  disabled: false,
} satisfies Prisma.IntegrationWhereInput;

export const isActivePipelineIntegration = (
  integration?: { disabled?: boolean; deletedAt?: Date | string | null } | null
) => !integration || (!integration.disabled && !integration.deletedAt);

export const pipelineIntegrationSelect = {
  id: true,
  internalId: true,
  name: true,
  picture: true,
  providerIdentifier: true,
  type: true,
  disabled: true,
  deletedAt: true,
  inBetweenSteps: true,
  refreshNeeded: true,
  postingTimes: true,
  profile: true,
  additionalSettings: true,
  customer: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.IntegrationSelect;

const pipelinePostSelect = {
  id: true,
  parentPostId: true,
  content: true,
  delay: true,
  state: true,
  publishDate: true,
  releaseId: true,
  settings: true,
  image: true,
  intervalInDays: true,
  integration: {
    select: pipelineIntegrationSelect,
  },
  tags: {
    select: {
      tag: true,
    },
  },
} satisfies Prisma.PostSelect;

const pipelineContextDocumentInclude = {
  contextDocument: {
    select: {
      id: true,
      name: true,
      description: true,
      fileSize: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.PipelineContextDocumentInclude;

@Injectable()
export class PipelineRepository {
  constructor(
    private _pipeline: PrismaRepository<'pipeline'>,
    private _post: PrismaRepository<'post'>,
    private _integration: PrismaRepository<'integration'>,
    private _queueItem: PrismaRepository<'pipelineQueueItem'>,
    private _contextDocument: PrismaRepository<'contextDocument'>,
    private _transaction: PrismaTransaction
  ) {}

  getPipelines(orgId: string) {
    return this._pipeline.model.pipeline.findMany({
      where: { organizationId: orgId, deletedAt: null },
      include: {
        integrations: {
          include: { integration: { select: pipelineIntegrationSelect } },
        },
        contextDocuments: { include: pipelineContextDocumentInclude },
        scheduleSlots: {
          orderBy: [{ dayOfWeek: 'asc' }, { minuteOfDay: 'asc' }],
        },
        _count: {
          select: {
            queueItems: { where: { status: 'QUEUED', deletedAt: null } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  getPipeline(orgId: string, id: string) {
    return this._pipeline.model.pipeline.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: {
        integrations: {
          include: { integration: { select: pipelineIntegrationSelect } },
        },
        contextDocuments: { include: pipelineContextDocumentInclude },
        scheduleSlots: {
          orderBy: [{ dayOfWeek: 'asc' }, { minuteOfDay: 'asc' }],
        },
        queueItems: {
          where: { deletedAt: null },
          include: {
            posts: {
              where: { deletedAt: null },
              select: pipelinePostSelect,
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
  }

  getActivePipelinesForCalendar(orgId: string) {
    return this._pipeline.model.pipeline.findMany({
      where: { organizationId: orgId, deletedAt: null, active: true },
      include: {
        scheduleSlots: {
          orderBy: [{ dayOfWeek: 'asc' }, { minuteOfDay: 'asc' }],
        },
        queueItems: {
          where: { status: 'QUEUED', deletedAt: null },
          include: {
            posts: {
              where: { parentPostId: null, deletedAt: null },
              select: pipelinePostSelect,
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
  }

  getPipelinesForSchedule(orgId: string) {
    return this._pipeline.model.pipeline.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: {
        id: true,
        name: true,
        timezone: true,
        color: true,
        active: true,
        scheduleRevision: true,
        scheduleSlots: {
          select: {
            dayOfWeek: true,
            minuteOfDay: true,
          },
          orderBy: [{ dayOfWeek: 'asc' }, { minuteOfDay: 'asc' }],
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  getOwnedIntegrations(orgId: string, integrationIds: string[]) {
    return this._integration.model.integration.findMany({
      where: {
        organizationId: orgId,
        ...activePipelineIntegrationWhere,
        id: { in: integrationIds },
      },
      select: { id: true },
    });
  }

  getOwnedContextDocuments(orgId: string, documentIds: string[]) {
    if (!documentIds.length) {
      return Promise.resolve([]);
    }
    return this._contextDocument.model.contextDocument.findMany({
      where: {
        organizationId: orgId,
        id: { in: documentIds },
      },
      select: { id: true, name: true },
    });
  }

  async createPipeline(orgId: string, body: CreatePipelineDto) {
    return this._pipeline.model.pipeline.create({
      data: {
        organizationId: orgId,
        name: body.name,
        timezone: body.timezone,
        ...(body.color !== undefined ? { color: body.color } : {}),
        integrations: {
          create: body.integrations.map(({ id }) => ({ integrationId: id })),
        },
        ...(body.contextDocumentIds?.length
          ? {
              contextDocuments: {
                create: body.contextDocumentIds.map((contextDocumentId) => ({
                  contextDocumentId,
                })),
              },
            }
          : {}),
      },
    });
  }

  async updatePipeline(orgId: string, id: string, body: UpdatePipelineDto) {
    try {
      return await this.withSerializableRetry(async (tx) => {
        const existing = await tx.pipeline.findFirst({
          where: { id, organizationId: orgId, deletedAt: null },
          include: { integrations: true },
        });
        if (!existing) {
          return null;
        }

        const queued = await tx.pipelineQueueItem.findFirst({
          where: { pipelineId: id, status: 'QUEUED', deletedAt: null },
          select: { id: true },
        });
        const oldIds = existing.integrations
          .map((item: any) => item.integrationId)
          .sort();
        const newIds = body.integrations.map((item) => item.id).sort();
        const integrationsChanged = oldIds.join(',') !== newIds.join(',');
        const removedIntegrationIds = oldIds.filter(
          (integrationId) => !newIds.includes(integrationId)
        );
        if (queued && integrationsChanged) {
          return false;
        }

        const documentsChanged = body.contextDocumentIds !== undefined;
        if (documentsChanged) {
          const ownedDocuments = await tx.contextDocument.findMany({
            where: {
              organizationId: orgId,
              id: { in: body.contextDocumentIds },
            },
            select: { id: true, name: true },
          });
          if (ownedDocuments.length !== body.contextDocumentIds.length) {
            throw new PipelineContextDocumentsChangedError();
          }
          if (
            ownedDocuments.some((document: any) =>
              parseSkillFilename(document.name)
            )
          ) {
            throw new PipelineSkillContextDocumentsChangedError();
          }
        }

        if (removedIntegrationIds.length) {
          await tx.pipelinePlug.deleteMany({
            where: {
              pipelineId: id,
              integrationId: { in: removedIntegrationIds },
            },
          });
        }

        return tx.pipeline.update({
          where: { id },
          data: {
            name: body.name,
            timezone: body.timezone,
            ...(body.color !== undefined ? { color: body.color } : {}),
            ...(integrationsChanged
              ? {
                  integrations: {
                    deleteMany: {},
                    create: body.integrations.map(({ id: integrationId }) => ({
                      integrationId,
                    })),
                  },
                }
              : {}),
            ...(documentsChanged
              ? {
                  contextDocuments: {
                    deleteMany: {},
                    create: body.contextDocumentIds!.map(
                      (contextDocumentId) => ({
                        contextDocumentId,
                      })
                    ),
                  },
                }
              : {}),
          },
        });
      });
    } catch (error) {
      if (error instanceof PipelineContextDocumentsChangedError) {
        return 'invalid-context-documents' as const;
      }
      if (error instanceof PipelineSkillContextDocumentsChangedError) {
        return 'skill-context-documents' as const;
      }
      throw error;
    }
  }

  async updatePipelineSchedule(
    orgId: string,
    id: string,
    scheduleSlots: Array<{ dayOfWeek: number; minuteOfDay: number }>
  ) {
    return this.withSerializableRetry(async (tx) => {
      const pipeline = await tx.pipeline.findFirst({
        where: { id, organizationId: orgId, deletedAt: null },
        select: { id: true },
      });
      if (!pipeline) {
        return null;
      }
      return tx.pipeline.update({
        where: { id },
        data: {
          scheduleRevision: { increment: 1 },
          scheduleSlots: {
            deleteMany: {},
            create: scheduleSlots.map(({ dayOfWeek, minuteOfDay }) => ({
              dayOfWeek,
              minuteOfDay,
            })),
          },
        },
        include: {
          scheduleSlots: {
            orderBy: [{ dayOfWeek: 'asc' }, { minuteOfDay: 'asc' }],
          },
        },
      });
    });
  }

  async deletePipelineScheduleSlot(
    orgId: string,
    id: string,
    slot: { dayOfWeek: number; minuteOfDay: number }
  ) {
    return this.withSerializableRetry(async (tx) => {
      const pipeline = await tx.pipeline.findFirst({
        where: { id, organizationId: orgId, deletedAt: null },
        select: { id: true },
      });
      if (!pipeline) {
        return 'not-found' as const;
      }

      const deleted = await tx.pipelineScheduleSlot.deleteMany({
        where: {
          pipelineId: id,
          dayOfWeek: slot.dayOfWeek,
          minuteOfDay: slot.minuteOfDay,
        },
      });
      if (deleted.count !== 1) {
        return 'stale' as const;
      }

      return tx.pipeline.update({
        where: { id },
        data: { scheduleRevision: { increment: 1 } },
        select: { id: true, scheduleRevision: true },
      });
    });
  }

  async movePipelineScheduleSlot(
    orgId: string,
    id: string,
    slot: {
      sourceDayOfWeek: number;
      sourceMinuteOfDay: number;
      targetDayOfWeek: number;
      targetMinuteOfDay: number;
      expectedScheduleRevision: number;
    }
  ) {
    try {
      return await this.withSerializableRetry(async (tx) => {
        const pipeline = await tx.pipeline.findFirst({
          where: { id, organizationId: orgId, deletedAt: null },
          select: { id: true, scheduleRevision: true },
        });
        if (!pipeline) {
          return 'not-found' as const;
        }
        if (pipeline.scheduleRevision !== slot.expectedScheduleRevision) {
          return 'stale-revision' as const;
        }

        const source = await tx.pipelineScheduleSlot.findFirst({
          where: {
            pipelineId: id,
            dayOfWeek: slot.sourceDayOfWeek,
            minuteOfDay: slot.sourceMinuteOfDay,
          },
          select: { id: true },
        });
        if (!source) {
          return 'missing-source' as const;
        }

        if (
          slot.sourceDayOfWeek === slot.targetDayOfWeek &&
          slot.sourceMinuteOfDay === slot.targetMinuteOfDay
        ) {
          return {
            id: pipeline.id,
            scheduleRevision: pipeline.scheduleRevision,
          };
        }

        const target = await tx.pipelineScheduleSlot.findFirst({
          where: {
            pipelineId: id,
            dayOfWeek: slot.targetDayOfWeek,
            minuteOfDay: slot.targetMinuteOfDay,
          },
          select: { id: true },
        });
        if (target) {
          return 'occupied' as const;
        }

        const moved = await tx.pipelineScheduleSlot.updateMany({
          where: {
            id: source.id,
            pipelineId: id,
            dayOfWeek: slot.sourceDayOfWeek,
            minuteOfDay: slot.sourceMinuteOfDay,
          },
          data: {
            dayOfWeek: slot.targetDayOfWeek,
            minuteOfDay: slot.targetMinuteOfDay,
          },
        });
        if (moved.count !== 1) {
          throw new PipelineScheduleSourceChangedError();
        }

        const revised = await tx.pipeline.updateMany({
          where: {
            id,
            organizationId: orgId,
            deletedAt: null,
            scheduleRevision: slot.expectedScheduleRevision,
          },
          data: { scheduleRevision: { increment: 1 } },
        });
        if (revised.count !== 1) {
          throw new PipelineScheduleRevisionChangedError();
        }

        return {
          id: pipeline.id,
          scheduleRevision: pipeline.scheduleRevision + 1,
        };
      });
    } catch (error: any) {
      if (error instanceof PipelineScheduleRevisionChangedError) {
        return 'stale-revision' as const;
      }
      if (error instanceof PipelineScheduleSourceChangedError) {
        return 'missing-source' as const;
      }
      if (error?.code === 'P2002') {
        return 'occupied' as const;
      }
      throw error;
    }
  }

  async reorderQueuedItems(
    orgId: string,
    pipelineId: string,
    itemIds: string[]
  ) {
    try {
      return await this.withSerializableRetry(async (tx) => {
        const pipeline = await tx.pipeline.findFirst({
          where: { id: pipelineId, organizationId: orgId, deletedAt: null },
          select: { id: true },
        });
        if (!pipeline) {
          return null;
        }
        const queuedItems = await tx.pipelineQueueItem.findMany({
          where: {
            pipelineId,
            status: PipelineQueueItemStatus.QUEUED,
            deletedAt: null,
          },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true },
        });
        if (
          queuedItems.length !== itemIds.length ||
          queuedItems.some((item: any) => !itemIds.includes(item.id))
        ) {
          return false;
        }
        for (const [index, itemId] of itemIds.entries()) {
          const updated = await tx.pipelineQueueItem.updateMany({
            where: {
              id: itemId,
              pipelineId,
              status: PipelineQueueItemStatus.QUEUED,
              deletedAt: null,
            },
            data: { position: (index + 1) * QUEUE_POSITION_INCREMENT },
          });
          if (updated.count !== 1) {
            throw new PipelineQueueChangedError();
          }
        }
        return itemIds.map((id, index) => ({
          id,
          position: (index + 1) * QUEUE_POSITION_INCREMENT,
        }));
      });
    } catch (error) {
      if (error instanceof PipelineQueueChangedError) {
        return false;
      }
      throw error;
    }
  }

  async setActive(orgId: string, id: string, active: boolean) {
    return this._pipeline.model.pipeline.updateMany({
      where: { id, organizationId: orgId, deletedAt: null },
      data: { active },
    });
  }

  async deletePipeline(orgId: string, id: string) {
    return this.withSerializableRetry(async (tx) => {
      const pipeline = await tx.pipeline.findFirst({
        where: { id, organizationId: orgId, deletedAt: null },
        select: { id: true },
      });
      if (!pipeline) {
        return null;
      }
      const items = await tx.pipelineQueueItem.findMany({
        where: {
          pipelineId: id,
          status: { in: ['QUEUED', 'FAILED'] },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (items.length) {
        await tx.post.updateMany({
          where: {
            pipelineQueueItemId: { in: items.map((item: any) => item.id) },
            organizationId: orgId,
            deletedAt: null,
          },
          data: { pipelineQueueItemId: null },
        });
        await tx.pipelineQueueItem.updateMany({
          where: { id: { in: items.map((item: any) => item.id) } },
          data: { status: 'REMOVED', deletedAt: new Date() },
        });
      }
      return tx.pipeline.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          active: false,
          scheduleRevision: { increment: 1 },
        },
      });
    });
  }

  getQueueItemByIdempotencyKey(
    orgId: string,
    pipelineId: string,
    idempotencyKey: string
  ) {
    return this._queueItem.model.pipelineQueueItem.findFirst({
      where: {
        pipelineId,
        idempotencyKey,
        pipeline: { organizationId: orgId, deletedAt: null },
      },
    });
  }

  async publishQueueItem(
    orgId: string,
    pipelineId: string,
    group: string,
    idempotencyKey?: string
  ) {
    return this.withSerializableRetry(async (tx) => {
      const pipeline = await tx.pipeline.findFirst({
        where: { id: pipelineId, organizationId: orgId, deletedAt: null },
        include: {
          integrations: {
            where: {
              integration: activePipelineIntegrationWhere,
            },
            select: { integrationId: true },
          },
        },
      });
      if (!pipeline) {
        return null;
      }
      const posts = await tx.post.findMany({
        where: {
          organizationId: orgId,
          group,
          pipelineQueueItemId: null,
          state: 'DRAFT',
          deletedAt: null,
        },
        select: {
          id: true,
          parentPostId: true,
          integrationId: true,
        },
      });
      const roots = posts.filter((post: any) => !post.parentPostId);
      const pipelineIntegrationIds = pipeline.integrations
        .map((entry: any) => entry.integrationId)
        .sort();
      const rootIntegrationIds = roots
        .map((post: any) => post.integrationId)
        .sort();
      if (
        !posts.length ||
        !roots.length ||
        pipelineIntegrationIds.join(',') !== rootIntegrationIds.join(',')
      ) {
        return false;
      }
      const last = await tx.pipelineQueueItem.findFirst({
        where: { pipelineId, status: 'QUEUED', deletedAt: null },
        orderBy: [{ position: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        select: { position: true },
      });
      const queueItem = await tx.pipelineQueueItem.create({
        data: {
          pipelineId,
          group,
          ...(idempotencyKey ? { idempotencyKey } : {}),
          position: (last?.position || 0) + QUEUE_POSITION_INCREMENT,
          status: 'CREATING',
        },
      });
      const linked = await tx.post.updateMany({
        where: {
          id: { in: posts.map((post: any) => post.id) },
          organizationId: orgId,
          pipelineQueueItemId: null,
          state: 'DRAFT',
          deletedAt: null,
        },
        data: { pipelineQueueItemId: queueItem.id },
      });
      if (linked.count !== posts.length) {
        throw new Error('Pipeline posts changed while being linked');
      }
      const verified = await tx.post.findMany({
        where: {
          pipelineQueueItemId: queueItem.id,
          organizationId: orgId,
          deletedAt: null,
        },
        select: {
          id: true,
          parentPostId: true,
          integrationId: true,
        },
      });
      const verifiedRoots = verified.filter((post: any) => !post.parentPostId);
      const verifiedIntegrationIds = verifiedRoots
        .map((post: any) => post.integrationId)
        .sort();
      if (
        verified.length !== posts.length ||
        verifiedRoots.length !== roots.length ||
        pipelineIntegrationIds.join(',') !== verifiedIntegrationIds.join(',')
      ) {
        throw new Error('Pipeline posts could not be verified after linking');
      }
      return tx.pipelineQueueItem.update({
        where: { id: queueItem.id },
        data: { status: 'QUEUED' },
      });
    });
  }

  async discardUnlinkedDraftPosts(orgId: string, group: string) {
    return this._post.model.post.updateMany({
      where: {
        organizationId: orgId,
        group,
        pipelineQueueItemId: null,
        state: 'DRAFT',
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
  }

  async repositionItem(
    orgId: string,
    itemId: string,
    pipelineId: string,
    beforeItemId?: string,
    afterItemId?: string
  ) {
    return this.withSerializableRetry(async (tx) => {
      const item = await tx.pipelineQueueItem.findFirst({
        where: {
          id: itemId,
          pipelineId,
          status: 'QUEUED',
          deletedAt: null,
          pipeline: { organizationId: orgId, deletedAt: null },
        },
      });
      if (!item) {
        return null;
      }
      const position = await this.positionFor(
        tx,
        pipelineId,
        itemId,
        beforeItemId,
        afterItemId
      );
      return tx.pipelineQueueItem.update({
        where: { id: itemId },
        data: { position },
      });
    });
  }

  async moveItem(
    orgId: string,
    itemId: string,
    destinationPipelineId: string,
    beforeItemId?: string,
    afterItemId?: string
  ) {
    return this.withSerializableRetry(async (tx) => {
      const item = await tx.pipelineQueueItem.findFirst({
        where: {
          id: itemId,
          status: 'QUEUED',
          deletedAt: null,
          pipeline: { organizationId: orgId, deletedAt: null },
        },
        include: {
          posts: {
            where: { parentPostId: null, deletedAt: null },
            select: { integrationId: true },
          },
        },
      });
      const destination = await tx.pipeline.findFirst({
        where: {
          id: destinationPipelineId,
          organizationId: orgId,
          deletedAt: null,
        },
        include: { integrations: { select: { integrationId: true } } },
      });
      if (!item || !destination) {
        return null;
      }
      const itemChannels = item.posts
        .map((post: any) => post.integrationId)
        .sort();
      const destinationChannels = destination.integrations
        .map((entry: any) => entry.integrationId)
        .sort();
      if (itemChannels.join(',') !== destinationChannels.join(',')) {
        return false;
      }
      const position = await this.positionFor(
        tx,
        destination.id,
        undefined,
        beforeItemId,
        afterItemId
      );
      return tx.pipelineQueueItem.update({
        where: { id: itemId },
        data: { pipelineId: destination.id, position },
      });
    });
  }

  async detachItem(orgId: string, itemId: string) {
    return this.withSerializableRetry(async (tx) => {
      const item = await tx.pipelineQueueItem.findFirst({
        where: {
          id: itemId,
          status: { in: ['QUEUED', 'FAILED'] },
          deletedAt: null,
          pipeline: { organizationId: orgId, deletedAt: null },
        },
      });
      if (!item) {
        return null;
      }
      await tx.post.updateMany({
        where: {
          pipelineQueueItemId: item.id,
          organizationId: orgId,
          deletedAt: null,
        },
        data: { pipelineQueueItemId: null },
      });
      return tx.pipelineQueueItem.update({
        where: { id: item.id },
        data: { status: 'REMOVED', deletedAt: new Date() },
      });
    });
  }

  async deleteItem(orgId: string, itemId: string) {
    return this.withSerializableRetry(async (tx) => {
      const item = await tx.pipelineQueueItem.findFirst({
        where: {
          id: itemId,
          status: { in: ['QUEUED', 'FAILED'] },
          deletedAt: null,
          pipeline: { organizationId: orgId, deletedAt: null },
        },
      });
      if (!item) {
        return null;
      }
      const deletedAt = new Date();
      await tx.post.updateMany({
        where: {
          pipelineQueueItemId: item.id,
          organizationId: orgId,
          deletedAt: null,
        },
        data: { deletedAt },
      });
      return tx.pipelineQueueItem.update({
        where: { id: item.id },
        data: { status: 'REMOVED', deletedAt },
      });
    });
  }

  async scheduleItem(orgId: string, itemId: string, publishDate: Date) {
    return this.withSerializableRetry(async (tx) => {
      const item = await tx.pipelineQueueItem.findFirst({
        where: {
          id: itemId,
          status: { in: ['QUEUED', 'PUBLISHED'] },
          deletedAt: null,
          pipeline: { organizationId: orgId, deletedAt: null },
        },
        include: {
          posts: {
            where: { parentPostId: null, deletedAt: null },
            include: {
              integration: {
                select: { providerIdentifier: true },
              },
            },
          },
        },
      });
      if (!item) {
        return null;
      }

      await tx.post.updateMany({
        where: {
          pipelineQueueItemId: item.id,
          organizationId: orgId,
          deletedAt: null,
        },
        data: {
          publishDate,
          state: 'QUEUE',
          releaseId: null,
          releaseURL: null,
        },
      });
      await tx.pipelineQueueItem.update({
        where: { id: item.id },
        data: { status: 'REMOVED', deletedAt: new Date() },
      });

      return {
        id: item.id,
        posts: item.posts.map((post: any) => ({
          id: post.id,
          providerIdentifier: post.integration.providerIdentifier,
        })),
      };
    });
  }

  async getSchedulableQueueItem(orgId: string, itemId: string) {
    return this._queueItem.model.pipelineQueueItem.findFirst({
      where: {
        id: itemId,
        status: { in: ['QUEUED', 'PUBLISHED'] },
        deletedAt: null,
        pipeline: { organizationId: orgId, deletedAt: null },
      },
      select: { id: true, status: true },
    });
  }

  async detachPublishedQueueItem(orgId: string, itemId: string) {
    return this.withSerializableRetry(async (tx) => {
      const item = await tx.pipelineQueueItem.findFirst({
        where: {
          id: itemId,
          status: 'PUBLISHED',
          deletedAt: null,
          pipeline: { organizationId: orgId, deletedAt: null },
        },
      });
      if (!item) {
        return null;
      }
      await tx.post.updateMany({
        where: {
          pipelineQueueItemId: item.id,
          organizationId: orgId,
        },
        data: { pipelineQueueItemId: null },
      });
      return tx.pipelineQueueItem.update({
        where: { id: item.id },
        data: { status: 'REMOVED', deletedAt: new Date() },
      });
    });
  }

  async getItem(orgId: string, itemId: string) {
    return this._queueItem.model.pipelineQueueItem.findFirst({
      where: {
        id: itemId,
        status: 'QUEUED',
        deletedAt: null,
        pipeline: { organizationId: orgId, deletedAt: null },
      },
      include: {
        posts: {
          where: { parentPostId: null, deletedAt: null },
          select: pipelinePostSelect,
        },
      },
    });
  }

  private async positionFor(
    tx: any,
    pipelineId: string,
    excludedItemId?: string,
    beforeItemId?: string,
    afterItemId?: string
  ): Promise<number> {
    const where = {
      pipelineId,
      status: PipelineQueueItemStatus.QUEUED,
      deletedAt: null,
      ...(excludedItemId ? { id: { not: excludedItemId } } : {}),
    };
    const items = await tx.pipelineQueueItem.findMany({
      where,
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, position: true },
    });
    const beforeIndex = beforeItemId
      ? items.findIndex((item: any) => item.id === beforeItemId)
      : -1;
    const afterIndex = afterItemId
      ? items.findIndex((item: any) => item.id === afterItemId)
      : -1;
    const insertIndex =
      beforeIndex >= 0
        ? beforeIndex
        : afterIndex >= 0
        ? afterIndex + 1
        : items.length;
    const previous = items[insertIndex - 1]?.position;
    const next = items[insertIndex]?.position;
    if (previous === undefined)
      return (next ?? QUEUE_POSITION_INCREMENT) - QUEUE_POSITION_INCREMENT;
    if (next === undefined) return previous + QUEUE_POSITION_INCREMENT;
    if (next - previous > 1)
      return previous + Math.floor((next - previous) / 2);
    await Promise.all(
      items.map((item: any, index: number) =>
        tx.pipelineQueueItem.update({
          where: { id: item.id },
          data: { position: (index + 1) * QUEUE_POSITION_INCREMENT },
        })
      )
    );
    return (
      insertIndex * QUEUE_POSITION_INCREMENT + QUEUE_POSITION_INCREMENT / 2
    );
  }

  private async withSerializableRetry<T>(
    callback: (tx: any) => Promise<T>
  ): Promise<T> {
    let error: unknown;
    for (let attempt = 0; attempt < TRANSACTION_ATTEMPTS; attempt++) {
      try {
        return await (this._transaction.model as any).$transaction(callback, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (caught: any) {
        error = caught;
        if (caught?.code !== 'P2034' || attempt === TRANSACTION_ATTEMPTS - 1)
          throw caught;
      }
    }
    throw error;
  }
}
