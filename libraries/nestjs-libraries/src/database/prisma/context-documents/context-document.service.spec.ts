import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContextDocumentRepository } from './context-document.repository';
import { ContextDocumentService } from './context-document.service';
import {
  CONTEXT_DOCUMENT_LARGE_WARNING_BYTES,
  CONTEXT_DOCUMENT_MAX_BYTES,
  decodeUtf8Fatal,
  buildSkillFilename,
  normalizeContextDocumentName,
  parseSkillFilename,
  validateContextDocumentDescription,
  validateContextDocumentUpload,
} from '@gitroom/nestjs-libraries/upload/context-document.upload.validation';

describe('ContextDocumentService', () => {
  const organizationId = 'org-1';
  const otherOrganizationId = 'org-2';

  const createRepository = () => ({
    listMetadata: jest.fn(),
    listStandardMetadata: jest.fn(),
    listSkillMetadata: jest.fn(),
    findById: jest.fn(),
    findByName: jest.fn(),
    findSkillByCanonicalName: jest.fn(),
    upsertDocument: jest.fn(),
    createDocument: jest.fn(),
    updateDocument: jest.fn(),
    updateDocumentContent: jest.fn(),
    renameDocument: jest.fn(),
    deleteDocument: jest.fn(),
  });

  const createService = (repository = createRepository()) => ({
    repository,
    service: new ContextDocumentService(
      repository as unknown as ContextDocumentRepository
    ),
  });

  const sampleDocument = {
    id: 'doc-1',
    organizationId,
    name: 'BRANDING.md',
    description: null as string | null,
    content: '# Branding\n\nUse this voice.',
    fileSize: 28,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('upserts a document and replaces same-name uploads on the stable row', async () => {
    const { repository, service } = createService();
    const firstContent = '# Branding\n\nUse this voice.';
    const secondContent = '# Updated branding';
    repository.upsertDocument
      .mockResolvedValueOnce(sampleDocument)
      .mockResolvedValueOnce({
        ...sampleDocument,
        content: secondContent,
        fileSize: Buffer.byteLength(secondContent, 'utf8'),
        updatedAt: new Date('2026-01-03T00:00:00.000Z'),
      });

    const firstUpload = await service.uploadDocument(organizationId, {
      originalname: 'folder/BRANDING.md',
      buffer: Buffer.from(firstContent, 'utf8'),
      size: Buffer.byteLength(firstContent, 'utf8'),
    } as Express.Multer.File);
    const secondUpload = await service.uploadDocument(organizationId, {
      originalname: 'BRANDING.md',
      buffer: Buffer.from(secondContent, 'utf8'),
      size: Buffer.byteLength(secondContent, 'utf8'),
    } as Express.Multer.File);

    expect(repository.upsertDocument).toHaveBeenNthCalledWith(
      1,
      organizationId,
      'BRANDING.md',
      firstContent,
      Buffer.byteLength(firstContent, 'utf8')
    );
    expect(repository.upsertDocument).toHaveBeenNthCalledWith(
      2,
      organizationId,
      'BRANDING.md',
      secondContent,
      Buffer.byteLength(secondContent, 'utf8')
    );
    expect(firstUpload.id).toBe('doc-1');
    expect(secondUpload.id).toBe('doc-1');
    expect(firstUpload).not.toHaveProperty('content');
    expect(secondUpload).not.toHaveProperty('content');
  });

  it('lists metadata without content', async () => {
    const { repository, service } = createService();
    repository.listMetadata.mockResolvedValue([
      {
        id: sampleDocument.id,
        organizationId,
        name: sampleDocument.name,
        fileSize: sampleDocument.fileSize,
        createdAt: sampleDocument.createdAt,
        updatedAt: sampleDocument.updatedAt,
      },
    ]);

    const documents = await service.listDocuments(organizationId);

    expect(documents).toEqual([
      {
        id: 'doc-1',
        organizationId,
        name: 'BRANDING.md',
        description: null,
        fileSize: 28,
        createdAt: sampleDocument.createdAt,
        updatedAt: sampleDocument.updatedAt,
        isLarge: false,
      },
    ]);
    expect(documents[0]).not.toHaveProperty('content');
  });

  it('lists standard documents without skills and includes descriptions', async () => {
    const { repository, service } = createService();
    repository.listStandardMetadata.mockResolvedValue([
      {
        ...sampleDocument,
        description: 'Brand colors and tone',
      },
    ]);

    const documents = await service.listStandardDocuments(organizationId);

    expect(documents).toEqual([
      expect.objectContaining({
        id: 'doc-1',
        name: 'BRANDING.md',
        description: 'Brand colors and tone',
      }),
    ]);
    expect(repository.listStandardMetadata).toHaveBeenCalledWith(
      organizationId
    );
  });

  it('updates content and description together', async () => {
    const { repository, service } = createService();
    repository.findById.mockResolvedValue(sampleDocument);
    repository.updateDocument.mockResolvedValue({
      ...sampleDocument,
      content: '# Updated',
      fileSize: 9,
      description: 'Brand guidance',
    });

    const updated = await service.updateDocument(organizationId, 'doc-1', {
      content: '# Updated',
      description: '  Brand guidance  ',
    });

    expect(repository.updateDocument).toHaveBeenCalledWith(
      organizationId,
      'doc-1',
      {
        content: '# Updated',
        fileSize: 9,
        description: 'Brand guidance',
      }
    );
    expect(updated.description).toBe('Brand guidance');
  });

  it('clears description when empty or null and validates length', async () => {
    const { repository, service } = createService();
    repository.findById.mockResolvedValue(sampleDocument);
    repository.updateDocument.mockResolvedValue({
      ...sampleDocument,
      description: null,
    });

    await expect(
      service.updateDocument(organizationId, 'doc-1', { description: '   ' })
    ).resolves.toEqual(expect.objectContaining({ description: null }));
    expect(repository.updateDocument).toHaveBeenCalledWith(
      organizationId,
      'doc-1',
      { description: null }
    );

    expect(validateContextDocumentDescription(null)).toBeNull();
    expect(validateContextDocumentDescription('  hello  ')).toBe('hello');
    expect(() => validateContextDocumentDescription('x'.repeat(501))).toThrow(
      BadRequestException
    );

    await expect(
      service.updateDocument(organizationId, 'doc-1', {})
    ).rejects.toThrow('Provide content and/or description to update.');
  });

  it('keeps invocable and reserved skills in the management catalog as metadata', async () => {
    const { repository, service } = createService();
    repository.listMetadata.mockResolvedValue([
      sampleDocument,
      { ...sampleDocument, id: 'skill', name: 'campaign-review.skill.md' },
      { ...sampleDocument, id: 'reserved', name: 'followers.skill.md' },
    ]);

    await expect(service.listDocuments(organizationId)).resolves.toEqual([
      expect.objectContaining({ id: 'doc-1', name: 'BRANDING.md' }),
      expect.objectContaining({
        id: 'skill',
        name: 'campaign-review.skill.md',
        skill: {
          slug: 'campaign-review',
          command: '/campaign-review',
          conflict: false,
        },
      }),
      expect.objectContaining({
        id: 'reserved',
        name: 'followers.skill.md',
        skill: {
          slug: 'followers',
          command: '/followers',
          conflict: true,
        },
      }),
    ]);
    expect(repository.listMetadata).toHaveBeenCalledWith(organizationId);
  });

  it('flags large documents at or above the warning threshold', async () => {
    const largeContent = 'x'.repeat(CONTEXT_DOCUMENT_LARGE_WARNING_BYTES);
    const { repository, service } = createService();
    repository.upsertDocument.mockResolvedValue({
      ...sampleDocument,
      fileSize: largeContent.length,
    });

    const upload = await service.uploadDocument(organizationId, {
      originalname: 'LARGE.md',
      buffer: Buffer.from(largeContent, 'utf8'),
      size: largeContent.length,
    } as Express.Multer.File);

    expect(upload.isLarge).toBe(true);
    expect(upload.warning).toContain(`${largeContent.length} bytes`);
  });

  it('rejects uploads above the hard size limit', () => {
    expect(() =>
      validateContextDocumentUpload({
        originalname: 'TOO-LARGE.md',
        buffer: Buffer.alloc(CONTEXT_DOCUMENT_MAX_BYTES + 1, 1),
        size: CONTEXT_DOCUMENT_MAX_BYTES + 1,
      } as Express.Multer.File)
    ).toThrow(BadRequestException);
  });

  it('rejects invalid extensions, empty content, NUL bytes, and invalid UTF-8', () => {
    expect(() =>
      validateContextDocumentUpload({
        originalname: 'notes.txt',
        buffer: Buffer.from('hello'),
        size: 5,
      } as Express.Multer.File)
    ).toThrow('Only .md and .markdown files are supported.');

    expect(() =>
      validateContextDocumentUpload({
        originalname: 'EMPTY.md',
        buffer: Buffer.from('   \n\t  '),
        size: 6,
      } as Express.Multer.File)
    ).toThrow('The uploaded file is empty.');

    expect(() =>
      validateContextDocumentUpload({
        originalname: 'NUL.md',
        buffer: Buffer.from('hello\0world'),
        size: 11,
      } as Express.Multer.File)
    ).toThrow('invalid null bytes');

    expect(() => decodeUtf8Fatal(Buffer.from([0xff, 0xfe, 0xfd]))).toThrow(
      'valid UTF-8'
    );
  });

  it('normalizes path components from filenames', () => {
    expect(normalizeContextDocumentName('nested/path/BRANDING.markdown')).toBe(
      'BRANDING.markdown'
    );
  });

  it('classifies canonical skill filenames without treating .skill.markdown as a skill', () => {
    expect(parseSkillFilename('campaign-review.skill.md')).toBe(
      'campaign-review'
    );
    expect(
      parseSkillFilename('campaign-review.skill.markdown')
    ).toBeUndefined();
    expect(buildSkillFilename('campaign-review')).toBe(
      'campaign-review.skill.md'
    );
  });

  it('rejects malformed and reserved skill upload names while preserving Markdown uploads', () => {
    for (const originalname of [
      'Campaign.skill.md',
      'campaign_review.skill.md',
      '.skill.md',
      'followers.skill.md',
    ]) {
      expect(() =>
        validateContextDocumentUpload({
          originalname,
          buffer: Buffer.from('# Skill'),
          size: 7,
        } as Express.Multer.File)
      ).toThrow(BadRequestException);
    }
    expect(
      validateContextDocumentUpload({
        originalname: 'campaign-review.skill.markdown',
        buffer: Buffer.from('# Context'),
        size: 9,
      } as Express.Multer.File).name
    ).toBe('campaign-review.skill.markdown');
  });

  it('lists only invocable skill metadata and loads a canonical org-scoped skill', async () => {
    const { repository, service } = createService();
    repository.listSkillMetadata.mockResolvedValue([
      { ...sampleDocument, name: 'campaign-review.skill.md' },
      { ...sampleDocument, id: 'reserved', name: 'followers.skill.md' },
      { ...sampleDocument, id: 'normal', name: 'notes.md' },
    ]);
    repository.findSkillByCanonicalName.mockResolvedValue({
      ...sampleDocument,
      name: 'campaign-review.skill.md',
    });

    await expect(service.listSkills(organizationId)).resolves.toEqual([
      {
        slug: 'campaign-review',
        command: '/campaign-review',
        id: 'doc-1',
        name: 'campaign-review.skill.md',
        fileSize: 28,
        updatedAt: sampleDocument.updatedAt,
        isLarge: false,
      },
    ]);
    await expect(
      service.getSkillBySlug(organizationId, 'campaign-review')
    ).resolves.toMatchObject({
      command: '/campaign-review',
      content: sampleDocument.content,
    });
    expect(repository.findSkillByCanonicalName).toHaveBeenCalledWith(
      organizationId,
      'campaign-review.skill.md'
    );
  });

  it('enforces organization ownership on reads and deletes', async () => {
    const { repository, service } = createService();
    repository.findById.mockResolvedValue(null);
    repository.deleteDocument.mockRejectedValue({ code: 'P2025' });

    await expect(
      service.getDocumentById(otherOrganizationId, sampleDocument.id)
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.deleteDocument(otherOrganizationId, sampleDocument.id)
    ).rejects.toThrow(NotFoundException);
  });

  it('returns content only through org-scoped read helpers', async () => {
    const { repository, service } = createService();
    repository.findById.mockResolvedValue(sampleDocument);

    await expect(
      service.getDocumentById(organizationId, sampleDocument.id)
    ).resolves.toEqual({
      id: 'doc-1',
      name: 'BRANDING.md',
      description: null,
      content: '# Branding\n\nUse this voice.',
      fileSize: 28,
      updatedAt: sampleDocument.updatedAt,
      isLarge: false,
    });
  });

  it('deletes owned documents through the repository contract', async () => {
    const { repository, service } = createService();
    repository.deleteDocument.mockResolvedValue(sampleDocument);

    await expect(
      service.deleteDocument(organizationId, sampleDocument.id)
    ).resolves.toEqual({ id: 'doc-1' });
    expect(repository.deleteDocument).toHaveBeenCalledWith(
      organizationId,
      sampleDocument.id
    );
  });

  it('creates a blank document and rejects duplicate names', async () => {
    const { repository, service } = createService();
    repository.findByName.mockResolvedValueOnce(null);
    repository.createDocument.mockResolvedValue({
      ...sampleDocument,
      name: 'NOTES.md',
      content: '',
      fileSize: 0,
    });

    await expect(
      service.createDocument(organizationId, { name: 'NOTES.md' })
    ).resolves.toMatchObject({
      id: 'doc-1',
      name: 'NOTES.md',
      fileSize: 0,
    });
    expect(repository.createDocument).toHaveBeenCalledWith(
      organizationId,
      'NOTES.md',
      '',
      0
    );

    repository.findByName.mockResolvedValueOnce(sampleDocument);
    await expect(
      service.createDocument(organizationId, { name: 'BRANDING.md' })
    ).rejects.toThrow(BadRequestException);
  });

  it('updates document content while preserving the document id', async () => {
    const { repository, service } = createService();
    const nextContent = '# Updated branding';
    repository.findById.mockResolvedValue(sampleDocument);
    repository.updateDocument.mockResolvedValue({
      ...sampleDocument,
      content: nextContent,
      fileSize: Buffer.byteLength(nextContent, 'utf8'),
    });

    await expect(
      service.updateDocumentContent(
        organizationId,
        sampleDocument.id,
        nextContent
      )
    ).resolves.toMatchObject({
      id: 'doc-1',
      name: 'BRANDING.md',
      fileSize: Buffer.byteLength(nextContent, 'utf8'),
    });
    expect(repository.updateDocument).toHaveBeenCalledWith(
      organizationId,
      sampleDocument.id,
      {
        content: nextContent,
        fileSize: Buffer.byteLength(nextContent, 'utf8'),
      }
    );
  });

  it('renames a document while preserving id and rejecting conflicts', async () => {
    const { repository, service } = createService();
    repository.findById.mockResolvedValue(sampleDocument);
    repository.findByName.mockResolvedValueOnce(null);
    repository.renameDocument.mockResolvedValue({
      ...sampleDocument,
      name: 'VOICE.md',
    });

    await expect(
      service.renameDocument(organizationId, sampleDocument.id, 'VOICE.md')
    ).resolves.toMatchObject({
      id: 'doc-1',
      name: 'VOICE.md',
    });
    expect(repository.renameDocument).toHaveBeenCalledWith(
      organizationId,
      sampleDocument.id,
      'VOICE.md'
    );

    repository.findByName.mockResolvedValueOnce({
      ...sampleDocument,
      id: 'other',
      name: 'VOICE.md',
    });
    await expect(
      service.renameDocument(organizationId, sampleDocument.id, 'VOICE.md')
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects reserved skill names on create and rename', async () => {
    const { repository, service } = createService();
    repository.findById.mockResolvedValue(sampleDocument);

    await expect(
      service.createDocument(organizationId, {
        name: 'followers.skill.md',
        content: '# Skill',
      })
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.renameDocument(
        organizationId,
        sampleDocument.id,
        'followers.skill.md'
      )
    ).rejects.toThrow(BadRequestException);
  });
});
