import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  AutopostDto,
  PipelineAutopostDto,
} from '@gitroom/nestjs-libraries/dtos/autopost/autopost.dto';

@Injectable()
export class AutopostRepository {
  constructor(
    private _autoPost: PrismaRepository<'autoPost'>,
    private _pipeline: PrismaRepository<'pipeline'>
  ) {}

  getTotal(orgId: string) {
    return this._autoPost.model.autoPost.count({
      where: {
        organizationId: orgId,
        pipelineId: null,
        deletedAt: null,
      },
    });
  }

  getAutoposts(orgId: string) {
    return this._autoPost.model.autoPost.findMany({
      where: {
        organizationId: orgId,
        pipelineId: null,
        deletedAt: null,
      },
    });
  }

  async deleteAutopost(orgId: string, id: string) {
    const autopost = await this._autoPost.model.autoPost.findFirst({
      where: { id, organizationId: orgId, pipelineId: null, deletedAt: null },
    });
    if (!autopost) return null;
    return this._autoPost.model.autoPost.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  getAutopost(id: string) {
    return this._autoPost.model.autoPost.findFirst({
      where: { id, pipelineId: null, deletedAt: null },
    });
  }

  getAutopostForWorkflow(id: string) {
    return this._autoPost.model.autoPost.findFirst({
      where: { id, deletedAt: null },
    });
  }

  updateUrl(id: string, url: string) {
    return this._autoPost.model.autoPost.update({
      where: {
        id,
      },
      data: {
        lastUrl: url,
      },
    });
  }

  async changeActive(orgId: string, id: string, active: boolean) {
    const autopost = await this._autoPost.model.autoPost.findFirst({
      where: { id, organizationId: orgId, pipelineId: null, deletedAt: null },
    });
    if (!autopost) return null;
    return this._autoPost.model.autoPost.update({
      where: { id },
      data: { active },
    });
  }

  async createAutopost(orgId: string, body: AutopostDto, id?: string) {
    const data = {
      url: body.url,
      title: body.title,
      integrations: JSON.stringify(body.integrations),
      active: body.active,
      content: body.content,
      generateContent: body.generateContent,
      addPicture: body.addPicture,
      syncLast: body.syncLast,
      onSlot: body.onSlot,
      lastUrl: body.lastUrl,
    };
    const existing = id
      ? await this._autoPost.model.autoPost.findFirst({
          where: {
            id,
            organizationId: orgId,
            pipelineId: null,
            deletedAt: null,
          },
        })
      : null;
    const autopost = existing
      ? await this._autoPost.model.autoPost.update({ where: { id }, data })
      : await this._autoPost.model.autoPost.create({
          data: {
            id: id || uuidv4(),
            organizationId: orgId,
            pipelineId: null,
            ...data,
          },
        });

    return { id: autopost.id, active: autopost.active };
  }

  getPipeline(orgId: string, pipelineId: string) {
    return this._pipeline.model.pipeline.findFirst({
      where: { id: pipelineId, organizationId: orgId, deletedAt: null },
      include: {
        integrations: {
          where: {
            integration: {
              deletedAt: null,
              disabled: false,
            },
          },
          include: {
            integration: true,
          },
        },
      },
    });
  }

  getPipelineAutoposts(orgId: string, pipelineId: string) {
    return this._autoPost.model.autoPost.findMany({
      where: { organizationId: orgId, pipelineId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  getPipelineAutopost(orgId: string, pipelineId: string, id: string) {
    return this._autoPost.model.autoPost.findFirst({
      where: { id, organizationId: orgId, pipelineId, deletedAt: null },
    });
  }

  createPipelineAutopost(
    orgId: string,
    pipelineId: string,
    body: PipelineAutopostDto
  ) {
    return this._autoPost.model.autoPost.create({
      data: {
        organizationId: orgId,
        pipelineId,
        url: body.url,
        title: body.title,
        integrations: '[]',
        active: body.active,
        content: body.content,
        generateContent: body.generateContent,
        addPicture: body.addPicture,
        syncLast: body.syncLast,
        onSlot: true,
        lastUrl: body.lastUrl,
      },
    });
  }

  async updatePipelineAutopost(
    orgId: string,
    pipelineId: string,
    id: string,
    body: PipelineAutopostDto
  ) {
    const autopost = await this.getPipelineAutopost(orgId, pipelineId, id);
    if (!autopost) return null;
    return this._autoPost.model.autoPost.update({
      where: { id },
      data: {
        url: body.url,
        title: body.title,
        active: body.active,
        content: body.content,
        generateContent: body.generateContent,
        addPicture: body.addPicture,
        syncLast: body.syncLast,
        lastUrl: body.lastUrl,
      },
    });
  }

  async changePipelineAutopostActive(
    orgId: string,
    pipelineId: string,
    id: string,
    active: boolean
  ) {
    const autopost = await this.getPipelineAutopost(orgId, pipelineId, id);
    if (!autopost) return null;
    return this._autoPost.model.autoPost.update({
      where: { id },
      data: { active },
    });
  }

  async deletePipelineAutopost(orgId: string, pipelineId: string, id: string) {
    const autopost = await this.getPipelineAutopost(orgId, pipelineId, id);
    if (!autopost) return null;
    return this._autoPost.model.autoPost.update({
      where: { id },
      data: { active: false, deletedAt: new Date() },
    });
  }

  async disablePipelineAutoposts(orgId: string, pipelineId: string) {
    const autoposts = await this.getPipelineAutoposts(orgId, pipelineId);
    if (autoposts.length) {
      await this._autoPost.model.autoPost.updateMany({
        where: { organizationId: orgId, pipelineId, deletedAt: null },
        data: { active: false, deletedAt: new Date() },
      });
    }
    return autoposts;
  }

  countActiveAutoposts() {
    return this._autoPost.model.autoPost.count({
      where: {
        active: true,
        deletedAt: null,
      },
    });
  }

  async listActiveAutopostIds(after?: string, take = 50) {
    const rows = await this._autoPost.model.autoPost.findMany({
      where: {
        active: true,
        deletedAt: null,
        ...(after ? { id: { gt: after } } : {}),
      },
      orderBy: { id: 'asc' },
      take,
      select: { id: true },
    });
    return {
      ids: rows.map((row) => row.id),
      next: rows.length === take ? rows[rows.length - 1]?.id : undefined,
    };
  }
}
