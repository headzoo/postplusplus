import { readFileSync } from 'fs';
import { join } from 'path';
import { NotFoundException } from '@nestjs/common';
import { ExpertiseListTool } from '@gitroom/nestjs-libraries/chat/tools/expertise.list.tool';
import { ExpertiseReadTool } from '@gitroom/nestjs-libraries/chat/tools/expertise.read.tool';
import { listExpertise } from '@gitroom/nestjs-libraries/channel-strategies/expertise.registry';

describe('expertise agent tools', () => {
  const createContext = (orgId = 'org-1') => {
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
        "import { ExpertiseListTool } from '@gitroom/nestjs-libraries/chat/tools/expertise.list.tool'"
      );
      expect(toolListSource).toContain(
        "import { ExpertiseReadTool } from '@gitroom/nestjs-libraries/chat/tools/expertise.read.tool'"
      );
      expect(
        toolListSource.match(/(?<![A-Za-z])ExpertiseListTool/g)?.length
      ).toBe(2);
      expect(
        toolListSource.match(/(?<![A-Za-z])ExpertiseReadTool/g)?.length
      ).toBe(2);
    });
  });

  describe('listExpertise', () => {
    it('returns metadata only for all registered playbooks', async () => {
      const tool = new ExpertiseListTool().run();

      const result = await tool.execute!({}, createContext());

      expect(result.output).toHaveLength(11);
      expect(result.output[0]).toEqual(
        expect.objectContaining({
          id: 'reciprocal-mutual-deepening',
          slug: 'reciprocal-mutual-deepening',
          name: expect.any(String),
          description: expect.any(String),
          tags: expect.any(Array),
          strategyTags: expect.any(Array),
          fileSize: expect.any(Number),
        })
      );
      expect(result.output[0]).not.toHaveProperty('content');
      expect(listExpertise().map((entry) => entry.slug).sort()).toEqual(
        result.output.map((entry: { slug: string }) => entry.slug).sort()
      );
    });
  });

  describe('readExpertise', () => {
    const createReadTool = () => new ExpertiseReadTool().run();

    it('reads a playbook by canonical slug', async () => {
      const slug = 'reciprocal-mutual-deepening';
      const metadata = listExpertise().find((entry) => entry.slug === slug)!;

      const result = await createReadTool().execute!(
        { slug },
        createContext()
      );

      expect(result.output).toEqual({
        ...metadata,
        content: expect.stringContaining('#'),
      });
      expect(result.output.content.length).toBeGreaterThan(0);
    });

    it('rejects missing slug input', async () => {
      const tool = createReadTool();

      const missingSlug = await tool.execute!({}, createContext());
      expect(missingSlug).toMatchObject({
        error: true,
        message: expect.stringContaining('slug'),
      });
    });

    it('propagates not found errors', async () => {
      await expect(
        createReadTool().execute!({ slug: 'unknown' }, createContext())
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects traversal-like slugs', async () => {
      await expect(
        createReadTool().execute!(
          { slug: '../reciprocal-mutual-deepening' },
          createContext()
        )
      ).rejects.toThrow(NotFoundException);
    });
  });
});
