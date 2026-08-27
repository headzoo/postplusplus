import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { PlugDto } from '@gitroom/nestjs-libraries/dtos/plugs/plug.dto';

const TRANSACTION_ATTEMPTS = 3;

@Injectable()
export class PipelinePlugRepository {
  constructor(
    private _pipelinePlug: PrismaRepository<'pipelinePlug'>,
    private _pipeline: PrismaRepository<'pipeline'>,
    private _post: PrismaRepository<'post'>,
    private _transaction: PrismaTransaction
  ) {}

  getPipelineIntegration(
    orgId: string,
    pipelineId: string,
    integrationId: string
  ) {
    return this._pipeline.model.pipeline.findFirst({
      where: {
        id: pipelineId,
        organizationId: orgId,
        deletedAt: null,
        integrations: { some: { integrationId } },
      },
      select: {
        id: true,
        integrations: {
          where: { integrationId },
          select: {
            integration: {
              select: { id: true, providerIdentifier: true },
            },
          },
        },
      },
    });
  }

  list(orgId: string, pipelineId: string, integrationId: string) {
    return this._pipelinePlug.model.pipelinePlug.findMany({
      where: { organizationId: orgId, pipelineId, integrationId },
      select: {
        id: true,
        plugFunction: true,
        data: true,
        activated: true,
      },
      orderBy: { plugFunction: 'asc' },
    });
  }

  upsert(
    orgId: string,
    pipelineId: string,
    integrationId: string,
    body: PlugDto
  ) {
    return this.withSerializableRetry(async (tx) => {
      const pipeline = await tx.pipeline.findFirst({
        where: {
          id: pipelineId,
          organizationId: orgId,
          deletedAt: null,
          integrations: { some: { integrationId } },
        },
        select: { id: true },
      });
      if (!pipeline) {
        return null;
      }

      return tx.pipelinePlug.upsert({
        where: {
          pipelineId_integrationId_plugFunction: {
            pipelineId,
            integrationId,
            plugFunction: body.func,
          },
        },
        create: {
          organizationId: orgId,
          pipelineId,
          integrationId,
          plugFunction: body.func,
          data: JSON.stringify(body.fields),
          activated: true,
        },
        update: { data: JSON.stringify(body.fields) },
        select: { id: true, activated: true },
      });
    });
  }

  async activate(
    orgId: string,
    pipelineId: string,
    plugId: string,
    activated: boolean
  ) {
    return this._transaction.model.$transaction(
      async (tx) => {
        const plug = await tx.pipelinePlug.findFirst({
          where: {
            id: plugId,
            pipelineId,
            organizationId: orgId,
            pipeline: {
              is: {
                id: pipelineId,
                organizationId: orgId,
                deletedAt: null,
              },
            },
          },
          select: { integrationId: true },
        });
        if (!plug) {
          return { count: 0 };
        }

        return tx.pipelinePlug.updateMany({
          where: {
            id: plugId,
            pipelineId,
            integrationId: plug.integrationId,
            organizationId: orgId,
            pipeline: {
              is: {
                id: pipelineId,
                organizationId: orgId,
                deletedAt: null,
                integrations: { some: { integrationId: plug.integrationId } },
              },
            },
          },
          data: { activated },
        });
      },
      { isolationLevel: 'Serializable' }
    );
  }

  deleteForRemovedIntegrations(
    tx: any,
    pipelineId: string,
    integrationIds: string[]
  ) {
    if (!integrationIds.length) {
      return Promise.resolve({ count: 0 });
    }
    return tx.pipelinePlug.deleteMany({
      where: { pipelineId, integrationId: { in: integrationIds } },
    });
  }

  getPostPipelineScope(postId: string, integrationId: string) {
    return this._post.model.post.findFirst({
      where: { id: postId, integrationId, deletedAt: null },
      select: {
        organizationId: true,
        pipelineQueueItem: {
          select: { pipelineId: true },
        },
      },
    });
  }

  getActiveForExecution(pipelineId: string, integrationId: string) {
    return this._pipelinePlug.model.pipelinePlug.findMany({
      where: { pipelineId, integrationId, activated: true },
      select: { id: true, plugFunction: true },
    });
  }

  getForExecution(plugId: string) {
    return this._pipelinePlug.model.pipelinePlug.findFirst({
      where: { id: plugId },
      include: { integration: true },
    });
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
        if (caught?.code !== 'P2034' || attempt === TRANSACTION_ATTEMPTS - 1) {
          throw caught;
        }
      }
    }
    throw error;
  }
}
