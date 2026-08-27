jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.service',
  () => ({
    PipelineService: class PipelineService {},
  })
);

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContextDocumentRepository } from '@gitroom/nestjs-libraries/database/prisma/context-documents/context-document.repository';
import { ContextDocumentService } from '@gitroom/nestjs-libraries/database/prisma/context-documents/context-document.service';
import { PipelineService } from '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.service';
import { PipelinesListTool } from '@gitroom/nestjs-libraries/chat/tools/pipelines.list.tool';
import { PipelineContextDocumentReadTool } from '@gitroom/nestjs-libraries/chat/tools/pipeline.context-document.read.tool';
import { CONTEXT_DOCUMENT_LARGE_WARNING_BYTES } from '@gitroom/nestjs-libraries/upload/context-document.upload.validation';

describe('pipeline context document tools', () => {
  const organizationId = 'org-1';
  const pipelineId = 'pipeline-1';
  const updatedAt = new Date('2026-01-02T00:00:00.000Z');

  const sampleDocument = {
    id: 'doc-1',
    organizationId,
    name: 'BRANDING.md',
    description: null as string | null,
    content: '# Branding\n\nUse this voice.',
    fileSize: 28,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt,
  };

  const createContext = (orgId = organizationId) => {
    const requestContext = new Map<string, string>();
    return {
      requestContext: {
        get: (key: string) => requestContext.get(key),
        set: (key: string, value: string) => {
          requestContext.set(key, value);
        },
      },
      mcp: {
        extra: {
          authInfo: { id: orgId },
        },
      },
    };
  };

  const createRepository = () => ({
    listMetadata: jest.fn(),
    findById: jest.fn(),
    findByName: jest.fn(),
    upsertDocument: jest.fn(),
    deleteDocument: jest.fn(),
    findAttachedToPipeline: jest.fn(),
  });

  const createPipelineService = () => ({
    getPipelines: jest.fn(),
    getPipeline: jest.fn(),
    enqueue: jest.fn(),
  });

  const createContextDocumentService = (repository = createRepository()) =>
    new ContextDocumentService(
      repository as unknown as ContextDocumentRepository
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ContextDocumentService.getAttachedDocumentForPipeline', () => {
    it('returns attached document content by id', async () => {
      const repository = createRepository();
      repository.findAttachedToPipeline.mockResolvedValue(sampleDocument);
      const service = createContextDocumentService(repository);

      await expect(
        service.getAttachedDocumentForPipeline(organizationId, pipelineId, {
          documentId: sampleDocument.id,
        })
      ).resolves.toEqual({
        id: sampleDocument.id,
        name: sampleDocument.name,
        description: null,
        content: sampleDocument.content,
        fileSize: sampleDocument.fileSize,
        updatedAt: sampleDocument.updatedAt,
        isLarge: false,
      });
      expect(repository.findAttachedToPipeline).toHaveBeenCalledWith(
        organizationId,
        pipelineId,
        { documentId: sampleDocument.id }
      );
    });

    it('does not read a legacy attached skill document', async () => {
      const repository = createRepository();
      repository.findAttachedToPipeline.mockResolvedValue({
        ...sampleDocument,
        name: 'campaign-review.skill.md',
      });
      const service = createContextDocumentService(repository);

      await expect(
        service.getAttachedDocumentForPipeline(organizationId, pipelineId, {
          documentId: sampleDocument.id,
        })
      ).rejects.toThrow(NotFoundException);
    });

    it('returns attached document content by exact name', async () => {
      const repository = createRepository();
      repository.findAttachedToPipeline.mockResolvedValue(sampleDocument);
      const service = createContextDocumentService(repository);

      await expect(
        service.getAttachedDocumentForPipeline(organizationId, pipelineId, {
          name: sampleDocument.name,
        })
      ).resolves.toMatchObject({
        id: sampleDocument.id,
        name: sampleDocument.name,
        content: sampleDocument.content,
      });
    });

    it('rejects missing or duplicate selectors', async () => {
      const service = createContextDocumentService();

      await expect(
        service.getAttachedDocumentForPipeline(organizationId, pipelineId, {})
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.getAttachedDocumentForPipeline(organizationId, pipelineId, {
          documentId: sampleDocument.id,
          name: sampleDocument.name,
        })
      ).rejects.toThrow('Provide exactly one of documentId or name.');
    });

    it('throws not found for unattached, foreign, or deleted-pipeline reads', async () => {
      const repository = createRepository();
      repository.findAttachedToPipeline.mockResolvedValue(null);
      const service = createContextDocumentService(repository);

      await expect(
        service.getAttachedDocumentForPipeline(organizationId, pipelineId, {
          documentId: 'foreign-doc',
        })
      ).rejects.toThrow(NotFoundException);
    });

    it('propagates large-document warnings', async () => {
      const repository = createRepository();
      const largeContent = 'x'.repeat(CONTEXT_DOCUMENT_LARGE_WARNING_BYTES);
      repository.findAttachedToPipeline.mockResolvedValue({
        ...sampleDocument,
        content: largeContent,
        fileSize: largeContent.length,
      });
      const service = createContextDocumentService(repository);

      await expect(
        service.getAttachedDocumentForPipeline(organizationId, pipelineId, {
          name: sampleDocument.name,
        })
      ).resolves.toMatchObject({
        isLarge: true,
        warning: expect.stringContaining(`${largeContent.length} bytes`),
      });
    });
  });

  describe('listPipelines', () => {
    it('returns attached context document metadata without content', async () => {
      const pipelineService = createPipelineService();
      pipelineService.getPipelines.mockResolvedValue([
        {
          id: pipelineId,
          name: 'Developers',
          timezone: 'UTC',
          active: true,
          queueCount: 2,
          nextSlot: new Date('2026-01-03T12:00:00.000Z'),
          channels: [
            {
              id: 'integration-1',
              name: 'X',
              identifier: 'x',
              picture: null,
            },
          ],
          contextDocuments: [
            {
              id: sampleDocument.id,
              name: sampleDocument.name,
              description: 'Brand colors and tone',
              fileSize: sampleDocument.fileSize,
              updatedAt,
            },
          ],
        },
      ]);

      const tool = new PipelinesListTool(
        pipelineService as unknown as PipelineService
      ).run();
      const result = await tool.execute!({}, createContext());

      expect(result.output).toHaveLength(1);
      expect(result.output[0].contextDocuments).toEqual([
        {
          id: sampleDocument.id,
          name: sampleDocument.name,
          description: 'Brand colors and tone',
          fileSize: sampleDocument.fileSize,
          updatedAt: updatedAt.toISOString(),
        },
      ]);
      expect(result.output[0].contextDocuments[0]).not.toHaveProperty(
        'content'
      );
      expect(pipelineService.getPipelines).toHaveBeenCalledWith(organizationId);
    });
  });

  describe('readPipelineContextDocument', () => {
    const createReadTool = (service = createContextDocumentService()) =>
      new PipelineContextDocumentReadTool(service).run();

    it('reads an attached document by id', async () => {
      const service = createContextDocumentService();
      jest.spyOn(service, 'getAttachedDocumentForPipeline').mockResolvedValue({
        id: sampleDocument.id,
        name: sampleDocument.name,
        content: sampleDocument.content,
        fileSize: sampleDocument.fileSize,
        updatedAt: sampleDocument.updatedAt,
        isLarge: false,
      });

      const tool = createReadTool(service);
      const result = await tool.execute!(
        {
          pipelineId,
          documentId: sampleDocument.id,
        },
        createContext()
      );

      expect(result.output).toEqual({
        id: sampleDocument.id,
        name: sampleDocument.name,
        content: sampleDocument.content,
        updatedAt: updatedAt.toISOString(),
        isLarge: false,
      });
      expect(service.getAttachedDocumentForPipeline).toHaveBeenCalledWith(
        organizationId,
        pipelineId,
        { documentId: sampleDocument.id, name: undefined }
      );
    });

    it('reads an attached document by exact name', async () => {
      const service = createContextDocumentService();
      jest.spyOn(service, 'getAttachedDocumentForPipeline').mockResolvedValue({
        id: sampleDocument.id,
        name: sampleDocument.name,
        content: sampleDocument.content,
        fileSize: sampleDocument.fileSize,
        updatedAt: sampleDocument.updatedAt,
        isLarge: false,
      });

      const tool = createReadTool(service);
      const result = await tool.execute!(
        {
          pipelineId,
          name: sampleDocument.name,
        },
        createContext()
      );

      expect(result.output.name).toBe(sampleDocument.name);
      expect(service.getAttachedDocumentForPipeline).toHaveBeenCalledWith(
        organizationId,
        pipelineId,
        { documentId: undefined, name: sampleDocument.name }
      );
    });

    it('validates selector input before calling the service', async () => {
      const service = createContextDocumentService();
      const getAttached = jest.spyOn(service, 'getAttachedDocumentForPipeline');
      const tool = createReadTool(service);

      const missingSelector = await tool.execute!(
        { pipelineId },
        createContext()
      );
      expect(missingSelector).toMatchObject({
        error: true,
        message: expect.stringContaining(
          'Provide exactly one of documentId or name.'
        ),
      });

      const duplicateSelector = await tool.execute!(
        {
          pipelineId,
          documentId: sampleDocument.id,
          name: sampleDocument.name,
        },
        createContext()
      );
      expect(duplicateSelector).toMatchObject({
        error: true,
        message: expect.stringContaining(
          'Provide exactly one of documentId or name.'
        ),
      });
      expect(getAttached).not.toHaveBeenCalled();
    });

    it('surfaces not-found errors for unattached same-org documents', async () => {
      const service = createContextDocumentService();
      jest
        .spyOn(service, 'getAttachedDocumentForPipeline')
        .mockRejectedValue(
          new NotFoundException('Context document not found.')
        );

      const tool = createReadTool(service);

      await expect(
        tool.execute!(
          {
            pipelineId,
            documentId: 'unattached-doc',
          },
          createContext()
        )
      ).rejects.toThrow(NotFoundException);
    });

    it('uses the authenticated organization id from request context', async () => {
      const service = createContextDocumentService();
      jest.spyOn(service, 'getAttachedDocumentForPipeline').mockResolvedValue({
        id: sampleDocument.id,
        name: sampleDocument.name,
        content: sampleDocument.content,
        fileSize: sampleDocument.fileSize,
        updatedAt: sampleDocument.updatedAt,
        isLarge: false,
      });

      const tool = createReadTool(service);
      const otherOrgId = 'org-2';
      await tool.execute!(
        {
          pipelineId,
          documentId: sampleDocument.id,
        },
        createContext(otherOrgId)
      );

      expect(service.getAttachedDocumentForPipeline).toHaveBeenCalledWith(
        otherOrgId,
        pipelineId,
        { documentId: sampleDocument.id, name: undefined }
      );
    });

    it('propagates large-document warnings in tool output', async () => {
      const service = createContextDocumentService();
      const warning = 'This document is large.';
      jest.spyOn(service, 'getAttachedDocumentForPipeline').mockResolvedValue({
        id: sampleDocument.id,
        name: sampleDocument.name,
        content: sampleDocument.content,
        fileSize: CONTEXT_DOCUMENT_LARGE_WARNING_BYTES,
        updatedAt: sampleDocument.updatedAt,
        isLarge: true,
        warning,
      });

      const tool = createReadTool(service);
      const result = await tool.execute!(
        {
          pipelineId,
          name: sampleDocument.name,
        },
        createContext()
      );

      expect(result.output).toMatchObject({
        isLarge: true,
        warning,
      });
    });
  });
});
