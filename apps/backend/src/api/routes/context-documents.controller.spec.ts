import { ContextDocumentsController } from './context-documents.controller';

describe('ContextDocumentsController', () => {
  const organization = { id: 'org-1' } as any;
  const service = {
    listDocuments: jest.fn(),
    createDocument: jest.fn(),
    uploadDocument: jest.fn(),
    listSkills: jest.fn(),
    getSkillBySlug: jest.fn(),
    getDocumentById: jest.fn(),
    updateDocument: jest.fn(),
    renameDocument: jest.fn(),
    deleteDocument: jest.fn(),
  };
  const controller = new ContextDocumentsController(service as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses org-scoped services for static skill routes', async () => {
    service.listSkills.mockResolvedValue([]);
    service.getSkillBySlug.mockResolvedValue({ slug: 'campaign-review' });

    await expect(controller.listSkills(organization)).resolves.toEqual([]);
    await expect(
      controller.getSkill(organization, 'campaign-review')
    ).resolves.toEqual({ slug: 'campaign-review' });

    expect(service.listSkills).toHaveBeenCalledWith('org-1');
    expect(service.getSkillBySlug).toHaveBeenCalledWith(
      'org-1',
      'campaign-review'
    );
  });

  it('delegates create, update, and rename to org-scoped services', async () => {
    service.createDocument.mockResolvedValue({ id: 'doc-1', name: 'NOTES.md' });
    service.updateDocument.mockResolvedValue({
      id: 'doc-1',
      name: 'NOTES.md',
      description: 'Notes for agents',
    });
    service.renameDocument.mockResolvedValue({
      id: 'doc-1',
      name: 'VOICE.md',
    });

    await expect(
      controller.createDocument(organization, {
        name: 'NOTES.md',
        content: '',
      })
    ).resolves.toEqual({ id: 'doc-1', name: 'NOTES.md' });
    await expect(
      controller.updateDocument(organization, 'doc-1', {
        content: '# Notes',
        description: 'Notes for agents',
      })
    ).resolves.toEqual({
      id: 'doc-1',
      name: 'NOTES.md',
      description: 'Notes for agents',
    });
    await expect(
      controller.renameDocument(organization, 'doc-1', { name: 'VOICE.md' })
    ).resolves.toEqual({ id: 'doc-1', name: 'VOICE.md' });

    expect(service.createDocument).toHaveBeenCalledWith('org-1', {
      name: 'NOTES.md',
      content: '',
    });
    expect(service.updateDocument).toHaveBeenCalledWith('org-1', 'doc-1', {
      content: '# Notes',
      description: 'Notes for agents',
    });
    expect(service.renameDocument).toHaveBeenCalledWith(
      'org-1',
      'doc-1',
      'VOICE.md'
    );
  });
});
