import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { SKILL_FILENAME_SUFFIX } from '@gitroom/nestjs-libraries/upload/context-document.upload.validation';

const metadataSelect = {
  id: true,
  organizationId: true,
  name: true,
  description: true,
  fileSize: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ContextDocumentRepository {
  constructor(private _contextDocument: PrismaRepository<'contextDocument'>) {}

  listMetadata(organizationId: string) {
    return this._contextDocument.model.contextDocument.findMany({
      where: {
        organizationId,
      },
      select: metadataSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  listStandardMetadata(organizationId: string) {
    return this._contextDocument.model.contextDocument.findMany({
      where: {
        organizationId,
        NOT: {
          name: {
            endsWith: SKILL_FILENAME_SUFFIX,
          },
        },
      },
      select: metadataSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  listSkillMetadata(organizationId: string) {
    return this._contextDocument.model.contextDocument.findMany({
      where: {
        organizationId,
      },
      select: metadataSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  findSkillByCanonicalName(organizationId: string, name: string) {
    return this._contextDocument.model.contextDocument.findFirst({
      where: {
        organizationId,
        name,
      },
    });
  }

  findById(organizationId: string, id: string) {
    return this._contextDocument.model.contextDocument.findFirst({
      where: {
        id,
        organizationId,
      },
    });
  }

  findByName(organizationId: string, name: string) {
    return this._contextDocument.model.contextDocument.findFirst({
      where: {
        organizationId,
        name,
      },
    });
  }

  upsertDocument(
    organizationId: string,
    name: string,
    content: string,
    fileSize: number
  ) {
    return this._contextDocument.model.contextDocument.upsert({
      where: {
        organizationId_name: {
          organizationId,
          name,
        },
      },
      create: {
        organizationId,
        name,
        content,
        fileSize,
      },
      update: {
        content,
        fileSize,
      },
    });
  }

  createDocument(
    organizationId: string,
    name: string,
    content: string,
    fileSize: number
  ) {
    return this._contextDocument.model.contextDocument.create({
      data: {
        organizationId,
        name,
        content,
        fileSize,
      },
    });
  }

  updateDocument(
    organizationId: string,
    id: string,
    data: {
      content?: string;
      fileSize?: number;
      description?: string | null;
    }
  ) {
    return this._contextDocument.model.contextDocument.update({
      where: {
        id,
        organizationId,
      },
      data,
    });
  }

  updateDocumentContent(
    organizationId: string,
    id: string,
    content: string,
    fileSize: number
  ) {
    return this.updateDocument(organizationId, id, { content, fileSize });
  }

  renameDocument(organizationId: string, id: string, name: string) {
    return this._contextDocument.model.contextDocument.update({
      where: {
        id,
        organizationId,
      },
      data: {
        name,
      },
    });
  }

  deleteDocument(organizationId: string, id: string) {
    return this._contextDocument.model.contextDocument.delete({
      where: {
        id,
        organizationId,
      },
    });
  }

  findAttachedToPipeline(
    organizationId: string,
    pipelineId: string,
    selector: { documentId?: string; name?: string }
  ) {
    return this._contextDocument.model.contextDocument.findFirst({
      where: {
        organizationId,
        ...(selector.documentId
          ? { id: selector.documentId }
          : { name: selector.name }),
        pipelineAssignments: {
          some: {
            pipelineId,
            pipeline: {
              organizationId,
              deletedAt: null,
            },
          },
        },
      },
    });
  }

  findAttachedToIntegration(
    organizationId: string,
    integrationId: string,
    selector: { documentId?: string; name?: string }
  ) {
    return this._contextDocument.model.contextDocument.findFirst({
      where: {
        organizationId,
        ...(selector.documentId
          ? { id: selector.documentId }
          : { name: selector.name }),
        integrationAssignments: {
          some: {
            integrationId,
            integration: {
              organizationId,
              deletedAt: null,
            },
          },
        },
      },
    });
  }

  listAttachedToIntegration(organizationId: string, integrationId: string) {
    return this._contextDocument.model.contextDocument.findMany({
      where: {
        organizationId,
        integrationAssignments: {
          some: {
            integrationId,
            integration: {
              organizationId,
              deletedAt: null,
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
        fileSize: true,
        updatedAt: true,
        content: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }
}
