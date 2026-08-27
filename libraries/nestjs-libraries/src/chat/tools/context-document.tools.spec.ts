import { readFileSync } from 'fs';
import { join } from 'path';
import { NotFoundException } from '@nestjs/common';
import { ContextDocumentRepository } from '@gitroom/nestjs-libraries/database/prisma/context-documents/context-document.repository';
import { ContextDocumentService } from '@gitroom/nestjs-libraries/database/prisma/context-documents/context-document.service';
import { ContextDocumentsListTool } from '@gitroom/nestjs-libraries/chat/tools/context-documents.list.tool';
import { ContextDocumentReadTool } from '@gitroom/nestjs-libraries/chat/tools/context-documents.read.tool';
import { CONTEXT_DOCUMENT_LARGE_WARNING_BYTES } from '@gitroom/nestjs-libraries/upload/context-document.upload.validation';

describe('context document agent tools', () => {
  const organizationId = 'org-1';
  const updatedAt = new Date('2026-01-02T00:00:00.000Z');

  const sampleDocument = {
    id: 'doc-1',
    organizationId,
    name: 'BRAND.md',
    description: 'Describes the channel branding. Colors, language, tone.',
    content: '# Brand\n\nUse orange.',
    fileSize: 20,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt,
    isLarge: false,
  };

  const createContext = (orgId = organizationId) => {
    const requestContext = new Map<string, string>();
    requestContext.set('organization', JSON.stringify({ id: orgId }));
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
    listStandardMetadata: jest.fn(),
    findById: jest.fn(),
    findByName: jest.fn(),
  });

  const createContextDocumentService = (repository = createRepository()) =>
    new ContextDocumentService(
      repository as unknown as ContextDocumentRepository
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('tool registry', () => {
    it('registers list and read tools once in the shared tool list', () => {
      const toolListSource = readFileSync(
        join(__dirname, 'tool.list.ts'),
        'utf8'
      );

      expect(toolListSource).toContain(
        "import { ContextDocumentsListTool } from '@gitroom/nestjs-libraries/chat/tools/context-documents.list.tool'"
      );
      expect(toolListSource).toContain(
        "import { ContextDocumentReadTool } from '@gitroom/nestjs-libraries/chat/tools/context-documents.read.tool'"
      );
      expect(
        toolListSource.match(/(?<![A-Za-z])ContextDocumentsListTool/g)?.length
      ).toBe(2);
      expect(
        toolListSource.match(/(?<![A-Za-z])ContextDocumentReadTool/g)?.length
      ).toBe(2);
    });
  });

  describe('listContextDocuments', () => {
    it('returns metadata only for standard documents', async () => {
      const repository = createRepository();
      repository.listStandardMetadata.mockResolvedValue([
        {
          id: sampleDocument.id,
          organizationId,
          name: sampleDocument.name,
          description: sampleDocument.description,
          fileSize: sampleDocument.fileSize,
          createdAt: sampleDocument.createdAt,
          updatedAt,
        },
      ]);
      const tool = new ContextDocumentsListTool(
        createContextDocumentService(repository)
      ).run();

      const result = await tool.execute!({}, createContext());

      expect(result.output).toEqual([
        {
          id: sampleDocument.id,
          name: sampleDocument.name,
          description: sampleDocument.description,
          fileSize: sampleDocument.fileSize,
          updatedAt: updatedAt.toISOString(),
          isLarge: false,
        },
      ]);
      expect(result.output[0]).not.toHaveProperty('content');
      expect(repository.listStandardMetadata).toHaveBeenCalledWith(
        organizationId
      );
    });

    it('includes large-document warnings', async () => {
      const repository = createRepository();
      repository.listStandardMetadata.mockResolvedValue([
        {
          id: sampleDocument.id,
          organizationId,
          name: sampleDocument.name,
          description: null,
          fileSize: CONTEXT_DOCUMENT_LARGE_WARNING_BYTES,
          createdAt: sampleDocument.createdAt,
          updatedAt,
        },
      ]);
      const tool = new ContextDocumentsListTool(
        createContextDocumentService(repository)
      ).run();

      const result = await tool.execute!({}, createContext());

      expect(result.output[0].isLarge).toBe(true);
      expect(result.output[0].warning).toContain(
        `${CONTEXT_DOCUMENT_LARGE_WARNING_BYTES} bytes`
      );
    });
  });

  describe('readContextDocument', () => {
    const createReadTool = (service = createContextDocumentService()) =>
      new ContextDocumentReadTool(service).run();

    it('reads a document by id', async () => {
      const service = createContextDocumentService();
      jest.spyOn(service, 'getDocumentById').mockResolvedValue({
        id: sampleDocument.id,
        name: sampleDocument.name,
        description: sampleDocument.description,
        content: sampleDocument.content,
        fileSize: sampleDocument.fileSize,
        updatedAt,
        isLarge: false,
      });

      const result = await createReadTool(service).execute!(
        { documentId: sampleDocument.id },
        createContext()
      );

      expect(result.output).toEqual({
        id: sampleDocument.id,
        name: sampleDocument.name,
        description: sampleDocument.description,
        content: sampleDocument.content,
        updatedAt: updatedAt.toISOString(),
        isLarge: false,
      });
      expect(service.getDocumentById).toHaveBeenCalledWith(
        organizationId,
        sampleDocument.id
      );
    });

    it('reads a document by exact name', async () => {
      const service = createContextDocumentService();
      jest.spyOn(service, 'getDocumentByName').mockResolvedValue({
        id: sampleDocument.id,
        name: sampleDocument.name,
        description: sampleDocument.description,
        content: sampleDocument.content,
        fileSize: sampleDocument.fileSize,
        updatedAt,
        isLarge: false,
      });

      const result = await createReadTool(service).execute!(
        { name: sampleDocument.name },
        createContext()
      );

      expect(result.output.name).toBe(sampleDocument.name);
      expect(service.getDocumentByName).toHaveBeenCalledWith(
        organizationId,
        sampleDocument.name
      );
    });

    it('rejects when both or neither selectors are provided', async () => {
      const tool = createReadTool();

      const missingSelector = await tool.execute!({}, createContext());
      expect(missingSelector).toMatchObject({
        error: true,
        message: expect.stringContaining(
          'Provide exactly one of documentId or name.'
        ),
      });

      const duplicateSelector = await tool.execute!(
        { documentId: sampleDocument.id, name: sampleDocument.name },
        createContext()
      );
      expect(duplicateSelector).toMatchObject({
        error: true,
        message: expect.stringContaining(
          'Provide exactly one of documentId or name.'
        ),
      });
    });

    it('propagates not found errors', async () => {
      const service = createContextDocumentService();
      jest
        .spyOn(service, 'getDocumentById')
        .mockRejectedValue(
          new NotFoundException('Context document not found.')
        );

      await expect(
        createReadTool(service).execute!(
          { documentId: 'missing' },
          createContext()
        )
      ).rejects.toThrow(NotFoundException);
    });
  });
});
