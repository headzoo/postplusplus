jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/context-documents/context-document.service',
  () => ({
    ContextDocumentService: class ContextDocumentService {},
  })
);

let capturedAgentOptions: {
  tools: Record<
    string,
    { id?: string; mcp?: { annotations?: Record<string, unknown> } }
  >;
  instructions: (context: {
    requestContext: { get: (key: string) => unknown };
  }) => string;
};

jest.mock('@mastra/core/agent', () => ({
  Agent: class Agent {
    constructor(options: typeof capturedAgentOptions) {
      capturedAgentOptions = options;
    }

    listTools() {
      return Promise.resolve(capturedAgentOptions.tools);
    }
  },
}));

jest.mock('@ai-sdk/openai', () => ({
  openai: jest.fn(),
}));

jest.mock('@mastra/memory', () => ({
  Memory: class Memory {},
}));

jest.mock('@gitroom/nestjs-libraries/chat/mastra.store', () => ({
  pStore: {},
}));

jest.mock('@gitroom/nestjs-libraries/chat/tools/tool.list', () => {
  const {
    AgentSkillsListTool,
  } = require('@gitroom/nestjs-libraries/chat/tools/agent-skills.list.tool');
  const {
    AgentSkillLoadTool,
  } = require('@gitroom/nestjs-libraries/chat/tools/agent-skill.load.tool');

  return {
    toolList: [AgentSkillsListTool, AgentSkillLoadTool],
  };
});

import { readFileSync } from 'fs';
import { join } from 'path';
import { NotFoundException } from '@nestjs/common';
import { ContextDocumentService } from '@gitroom/nestjs-libraries/database/prisma/context-documents/context-document.service';
import { LoadToolsService } from '@gitroom/nestjs-libraries/chat/load.tools.service';
import { AgentSkillLoadTool } from '@gitroom/nestjs-libraries/chat/tools/agent-skill.load.tool';
import { AgentSkillsListTool } from '@gitroom/nestjs-libraries/chat/tools/agent-skills.list.tool';
import { CONTEXT_DOCUMENT_LARGE_WARNING_BYTES } from '@gitroom/nestjs-libraries/upload/context-document.upload.validation';

const SKILL_TOOL_NAMES = ['listSkills', 'loadSkill'] as const;

const SKILL_TOOL_CLASSES = [AgentSkillsListTool, AgentSkillLoadTool];

const skillToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

describe('agent skill tools', () => {
  const organizationId = 'org-1';
  const otherOrganizationId = 'org-2';
  const updatedAt = new Date('2026-01-02T00:00:00.000Z');

  const sampleSkill = {
    slug: 'campaign-review',
    command: '/campaign-review',
    id: 'skill-1',
    name: 'campaign-review.skill.md',
    content: '# Campaign review\n\nFollow this checklist.',
    fileSize: 42,
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

  const createContextDocumentService = () => ({
    listSkills: jest.fn(),
    getSkillBySlug: jest.fn(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('tool registry and MCP exposure', () => {
    it('registers every skill tool once in the shared tool list', () => {
      const toolListSource = readFileSync(
        join(__dirname, 'tool.list.ts'),
        'utf8'
      );

      expect(toolListSource).toContain(
        "import { AgentSkillsListTool } from '@gitroom/nestjs-libraries/chat/tools/agent-skills.list.tool'"
      );
      expect(toolListSource).toContain(
        "import { AgentSkillLoadTool } from '@gitroom/nestjs-libraries/chat/tools/agent-skill.load.tool'"
      );
      expect(toolListSource.match(/AgentSkillsListTool/g)?.length).toBe(2);
      expect(toolListSource.match(/AgentSkillLoadTool/g)?.length).toBe(2);
    });

    it('exposes identical skill tool ids and MCP annotations from each tool definition', async () => {
      const contextDocumentService = createContextDocumentService();
      const exposed = await Promise.all(
        SKILL_TOOL_CLASSES.map(async (toolClass) => {
          const tool = new toolClass(
            contextDocumentService as unknown as ContextDocumentService
          ).run();
          return {
            id: tool.id,
            annotations: tool.mcp?.annotations,
          };
        })
      );

      expect(exposed.map((tool) => tool.id)).toEqual([...SKILL_TOOL_NAMES]);
      for (const tool of exposed) {
        expect(tool.annotations).toEqual(
          expect.objectContaining({
            ...skillToolAnnotations,
            title: expect.any(String),
          })
        );
      }
    });

    it('loads the same skill tool names for the postiz agent and MCP listTools', async () => {
      const contextDocumentService = createContextDocumentService();
      const moduleRef = {
        get: jest.fn(
          (
            toolClass: (typeof SKILL_TOOL_CLASSES)[number] | { name?: string }
          ) => {
            if (
              SKILL_TOOL_CLASSES.includes(
                toolClass as (typeof SKILL_TOOL_CLASSES)[number]
              )
            ) {
              return new (toolClass as (typeof SKILL_TOOL_CLASSES)[number])(
                contextDocumentService as unknown as ContextDocumentService
              );
            }
            return {
              name: 'other-tool',
              run: async () => ({ id: 'other-tool' }),
            };
          }
        ),
      };
      const service = new LoadToolsService(moduleRef as any);
      const agent = await service.agent();
      const listedTools = await agent.listTools();

      for (const name of SKILL_TOOL_NAMES) {
        expect(capturedAgentOptions.tools).toHaveProperty(name);
        expect(listedTools).toHaveProperty(name);
      }
      expect(
        Object.keys(capturedAgentOptions.tools).filter((name) =>
          SKILL_TOOL_NAMES.includes(name as (typeof SKILL_TOOL_NAMES)[number])
        )
      ).toEqual([...SKILL_TOOL_NAMES]);
    });
  });

  describe('listSkills', () => {
    it('returns metadata only without skill content', async () => {
      const contextDocumentService = createContextDocumentService();
      contextDocumentService.listSkills.mockResolvedValue([sampleSkill]);

      const tool = new AgentSkillsListTool(
        contextDocumentService as unknown as ContextDocumentService
      ).run();
      const result = await tool.execute!({}, createContext());

      expect(result.output).toEqual([
        {
          slug: sampleSkill.slug,
          command: sampleSkill.command,
          id: sampleSkill.id,
          name: sampleSkill.name,
          fileSize: sampleSkill.fileSize,
          updatedAt: updatedAt.toISOString(),
          isLarge: false,
        },
      ]);
      expect(result.output[0]).not.toHaveProperty('content');
      expect(contextDocumentService.listSkills).toHaveBeenCalledWith(
        organizationId
      );
    });

    it('uses the authenticated organization id from request context', async () => {
      const contextDocumentService = createContextDocumentService();
      contextDocumentService.listSkills.mockResolvedValue([]);

      const tool = new AgentSkillsListTool(
        contextDocumentService as unknown as ContextDocumentService
      ).run();
      await tool.execute!({}, createContext(otherOrganizationId));

      expect(contextDocumentService.listSkills).toHaveBeenCalledWith(
        otherOrganizationId
      );
    });
  });

  describe('loadSkill', () => {
    it('loads one org skill by canonical slug', async () => {
      const contextDocumentService = createContextDocumentService();
      contextDocumentService.getSkillBySlug.mockResolvedValue(sampleSkill);

      const tool = new AgentSkillLoadTool(
        contextDocumentService as unknown as ContextDocumentService
      ).run();
      const result = await tool.execute!(
        { slug: sampleSkill.slug },
        createContext()
      );

      expect(result.output).toEqual({
        slug: sampleSkill.slug,
        command: sampleSkill.command,
        id: sampleSkill.id,
        name: sampleSkill.name,
        content: sampleSkill.content,
        fileSize: sampleSkill.fileSize,
        updatedAt: updatedAt.toISOString(),
        isLarge: false,
      });
      expect(contextDocumentService.getSkillBySlug).toHaveBeenCalledWith(
        organizationId,
        sampleSkill.slug
      );
    });

    it('validates slug input before calling the service', async () => {
      const contextDocumentService = createContextDocumentService();
      const tool = new AgentSkillLoadTool(
        contextDocumentService as unknown as ContextDocumentService
      ).run();

      const invalidSlug = await tool.execute!(
        { slug: '/campaign-review' },
        createContext()
      );

      expect(invalidSlug).toMatchObject({
        error: true,
        message: expect.stringContaining('[a-z0-9-]+'),
      });
      expect(contextDocumentService.getSkillBySlug).not.toHaveBeenCalled();
    });

    it('propagates not-found errors for absent or foreign skills', async () => {
      const contextDocumentService = createContextDocumentService();
      contextDocumentService.getSkillBySlug.mockRejectedValue(
        new NotFoundException('Agent skill not found.')
      );

      const tool = new AgentSkillLoadTool(
        contextDocumentService as unknown as ContextDocumentService
      ).run();

      await expect(
        tool.execute!({ slug: 'missing-skill' }, createContext())
      ).rejects.toThrow(NotFoundException);
    });

    it('uses the authenticated organization id from request context', async () => {
      const contextDocumentService = createContextDocumentService();
      contextDocumentService.getSkillBySlug.mockResolvedValue(sampleSkill);

      const tool = new AgentSkillLoadTool(
        contextDocumentService as unknown as ContextDocumentService
      ).run();
      await tool.execute!(
        { slug: sampleSkill.slug },
        createContext(otherOrganizationId)
      );

      expect(contextDocumentService.getSkillBySlug).toHaveBeenCalledWith(
        otherOrganizationId,
        sampleSkill.slug
      );
    });

    it('propagates large-document warnings in tool output', async () => {
      const contextDocumentService = createContextDocumentService();
      const warning = 'This document is large.';
      contextDocumentService.getSkillBySlug.mockResolvedValue({
        ...sampleSkill,
        fileSize: CONTEXT_DOCUMENT_LARGE_WARNING_BYTES,
        isLarge: true,
        warning,
      });

      const tool = new AgentSkillLoadTool(
        contextDocumentService as unknown as ContextDocumentService
      ).run();
      const result = await tool.execute!(
        { slug: sampleSkill.slug },
        createContext()
      );

      expect(result.output).toMatchObject({
        isLarge: true,
        warning,
      });
    });
  });
});
