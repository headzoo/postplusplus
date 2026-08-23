import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContextDocumentRepository } from '@gitroom/nestjs-libraries/database/prisma/context-documents/context-document.repository';
import {
  ContextDocumentContentDto,
  ContextDocumentMetadataDto,
  ContextDocumentUploadResponseDto,
  CreateContextDocumentDto,
  SkillContentDto,
  SkillMetadataDto,
  UpdateContextDocumentDto,
} from '@gitroom/nestjs-libraries/dtos/context-documents/context-document.dto';
import {
  buildSkillFilename,
  getContextDocumentLargeWarning,
  isContextDocumentLarge,
  isReservedAgentCommandSlug,
  parseSkillFilename,
  validateContextDocumentContent,
  validateContextDocumentDescription,
  validateContextDocumentNameForWrite,
  validateContextDocumentUpload,
} from '@gitroom/nestjs-libraries/upload/context-document.upload.validation';
import { ContextDocument } from '@prisma/client';

@Injectable()
export class ContextDocumentService {
  constructor(
    private _contextDocumentRepository: ContextDocumentRepository
  ) { }

  async listDocuments(
    organizationId: string
  ): Promise<ContextDocumentMetadataDto[]> {
    const documents =
      await this._contextDocumentRepository.listMetadata(organizationId);

    return documents.map((document) => this.toMetadata(document));
  }

  async listStandardDocuments(
    organizationId: string
  ): Promise<ContextDocumentMetadataDto[]> {
    const documents =
      await this._contextDocumentRepository.listStandardMetadata(
        organizationId
      );

    return documents.map((document) => this.toMetadata(document));
  }

  async listSkills(organizationId: string): Promise<SkillMetadataDto[]> {
    const documents =
      await this._contextDocumentRepository.listSkillMetadata(organizationId);

    return documents.flatMap((document) => {
      const slug = parseSkillFilename(document.name);
      if (!slug || isReservedAgentCommandSlug(slug)) {
        return [];
      }
      return [this.toSkillMetadata(document, slug)];
    });
  }

  async getSkillBySlug(
    organizationId: string,
    slug: string
  ): Promise<SkillContentDto> {
    const name = buildSkillFilename(slug);
    if (isReservedAgentCommandSlug(slug)) {
      throw new NotFoundException('Agent skill not found.');
    }
    const document =
      await this._contextDocumentRepository.findSkillByCanonicalName(
        organizationId,
        name
      );
    if (parseSkillFilename(document?.name || '') !== slug) {
      throw new NotFoundException('Agent skill not found.');
    }

    return {
      ...this.toSkillMetadata(document, slug),
      content: document.content,
    };
  }

  async uploadDocument(
    organizationId: string,
    file?: Express.Multer.File
  ): Promise<ContextDocumentUploadResponseDto> {
    const validated = validateContextDocumentUpload(file);
    const document = await this._contextDocumentRepository.upsertDocument(
      organizationId,
      validated.name,
      validated.content,
      validated.fileSize
    );

    return this.toMetadata(document);
  }

  async createDocument(
    organizationId: string,
    dto: CreateContextDocumentDto
  ): Promise<ContextDocumentMetadataDto> {
    const name = validateContextDocumentNameForWrite(dto.name);
    const { content, fileSize } = validateContextDocumentContent(
      dto.content ?? '',
      { allowEmpty: true }
    );

    const existing = await this._contextDocumentRepository.findByName(
      organizationId,
      name
    );
    if (existing) {
      throw new BadRequestException(
        `A document named "${name}" already exists.`
      );
    }

    try {
      const document = await this._contextDocumentRepository.createDocument(
        organizationId,
        name,
        content,
        fileSize
      );
      return this.toMetadata(document);
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException(
          `A document named "${name}" already exists.`
        );
      }
      throw error;
    }
  }

  async updateDocument(
    organizationId: string,
    id: string,
    dto: UpdateContextDocumentDto
  ): Promise<ContextDocumentMetadataDto> {
    const hasContent = dto.content !== undefined;
    const hasDescription = dto.description !== undefined;

    if (!hasContent && !hasDescription) {
      throw new BadRequestException(
        'Provide content and/or description to update.'
      );
    }

    const existing = await this._contextDocumentRepository.findById(
      organizationId,
      id
    );
    if (!existing) {
      throw new NotFoundException('Context document not found.');
    }

    const data: {
      content?: string;
      fileSize?: number;
      description?: string | null;
    } = {};

    if (hasContent) {
      const validated = validateContextDocumentContent(dto.content!, {
        allowEmpty: true,
      });
      data.content = validated.content;
      data.fileSize = validated.fileSize;
    }

    if (hasDescription) {
      data.description = validateContextDocumentDescription(dto.description);
    }

    try {
      const document = await this._contextDocumentRepository.updateDocument(
        organizationId,
        id,
        data
      );
      return this.toMetadata(document);
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new NotFoundException('Context document not found.');
      }
      throw error;
    }
  }

  async updateDocumentContent(
    organizationId: string,
    id: string,
    content: string
  ): Promise<ContextDocumentMetadataDto> {
    return this.updateDocument(organizationId, id, { content });
  }

  async renameDocument(
    organizationId: string,
    id: string,
    nextName: string
  ): Promise<ContextDocumentMetadataDto> {
    const existing = await this._contextDocumentRepository.findById(
      organizationId,
      id
    );
    if (!existing) {
      throw new NotFoundException('Context document not found.');
    }

    const name = validateContextDocumentNameForWrite(nextName);
    if (name === existing.name) {
      return this.toMetadata(existing);
    }

    const conflict = await this._contextDocumentRepository.findByName(
      organizationId,
      name
    );
    if (conflict && conflict.id !== id) {
      throw new BadRequestException(
        `A document named "${name}" already exists.`
      );
    }

    try {
      const document = await this._contextDocumentRepository.renameDocument(
        organizationId,
        id,
        name
      );
      return this.toMetadata(document);
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new NotFoundException('Context document not found.');
      }
      if (error?.code === 'P2002') {
        throw new BadRequestException(
          `A document named "${name}" already exists.`
        );
      }
      throw error;
    }
  }

  async getDocumentById(
    organizationId: string,
    id: string
  ): Promise<ContextDocumentContentDto> {
    const document = await this._contextDocumentRepository.findById(
      organizationId,
      id
    );

    if (!document) {
      throw new NotFoundException('Context document not found.');
    }
    if (parseSkillFilename(document.name)) {
      throw new NotFoundException('Context document not found.');
    }

    return this.toContentResponse(document);
  }

  async getDocumentByName(organizationId: string, name: string) {
    const document = await this._contextDocumentRepository.findByName(
      organizationId,
      name
    );

    if (!document) {
      throw new NotFoundException('Context document not found.');
    }
    if (parseSkillFilename(document.name)) {
      throw new NotFoundException('Context document not found.');
    }

    return this.toContentResponse(document);
  }

  async getAttachedDocumentForPipeline(
    organizationId: string,
    pipelineId: string,
    selector: { documentId?: string; name?: string }
  ) {
    const hasDocumentId = Boolean(selector.documentId);
    const hasName = Boolean(selector.name);

    if (hasDocumentId === hasName) {
      throw new BadRequestException(
        'Provide exactly one of documentId or name.'
      );
    }

    const document =
      await this._contextDocumentRepository.findAttachedToPipeline(
        organizationId,
        pipelineId,
        selector
      );

    if (!document) {
      throw new NotFoundException('Context document not found.');
    }
    if (parseSkillFilename(document.name)) {
      throw new NotFoundException('Context document not found.');
    }

    return this.toContentResponse(document);
  }

  async getAttachedDocumentForIntegration(
    organizationId: string,
    integrationId: string,
    selector: { documentId?: string; name?: string }
  ) {
    const hasDocumentId = Boolean(selector.documentId);
    const hasName = Boolean(selector.name);

    if (hasDocumentId === hasName) {
      throw new BadRequestException(
        'Provide exactly one of documentId or name.'
      );
    }

    const document =
      await this._contextDocumentRepository.findAttachedToIntegration(
        organizationId,
        integrationId,
        selector
      );

    if (!document) {
      throw new NotFoundException('Context document not found.');
    }
    if (parseSkillFilename(document.name)) {
      throw new NotFoundException('Context document not found.');
    }

    return this.toContentResponse(document);
  }

  listAttachedDocumentsForIntegration(
    organizationId: string,
    integrationId: string
  ) {
    return this._contextDocumentRepository.listAttachedToIntegration(
      organizationId,
      integrationId
    );
  }

  async deleteDocument(organizationId: string, id: string) {
    try {
      await this._contextDocumentRepository.deleteDocument(organizationId, id);
      return { id };
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new NotFoundException('Context document not found.');
      }

      throw error;
    }
  }

  private toMetadata(
    document: Pick<
      ContextDocument,
      | 'id'
      | 'organizationId'
      | 'name'
      | 'fileSize'
      | 'createdAt'
      | 'updatedAt'
    > & { description?: string | null }
  ): ContextDocumentMetadataDto {
    const warning = getContextDocumentLargeWarning(document.fileSize);
    const slug = parseSkillFilename(document.name);

    return {
      id: document.id,
      organizationId: document.organizationId,
      name: document.name,
      description: document.description ?? null,
      fileSize: document.fileSize,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      isLarge: isContextDocumentLarge(document.fileSize),
      ...(warning ? { warning } : {}),
      ...(slug
        ? {
          skill: {
            slug,
            command: `/${slug}`,
            conflict: isReservedAgentCommandSlug(slug),
          },
        }
        : {}),
    };
  }

  private toContentResponse(
    document: ContextDocument
  ): ContextDocumentContentDto {
    const warning = getContextDocumentLargeWarning(document.fileSize);

    return {
      id: document.id,
      name: document.name,
      description: document.description ?? null,
      content: document.content,
      fileSize: document.fileSize,
      updatedAt: document.updatedAt,
      isLarge: isContextDocumentLarge(document.fileSize),
      ...(warning ? { warning } : {}),
    };
  }

  private toSkillMetadata(
    document: Pick<
      ContextDocument,
      'id' | 'name' | 'fileSize' | 'updatedAt'
    >,
    slug: string
  ): SkillMetadataDto {
    const warning = getContextDocumentLargeWarning(document.fileSize);

    return {
      slug,
      command: `/${slug}`,
      id: document.id,
      name: document.name,
      fileSize: document.fileSize,
      updatedAt: document.updatedAt,
      isLarge: isContextDocumentLarge(document.fileSize),
      ...(warning ? { warning } : {}),
    };
  }
}
