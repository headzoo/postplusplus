jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({
    IntegrationService: class IntegrationService { },
  })
);

let capturedAgentOptions: {
  tools: Record<string, { id?: string; mcp?: { annotations?: Record<string, unknown> } }>;
  instructions: (context: { requestContext: { get: (key: string) => unknown } }) => string;
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
  Memory: class Memory { },
}));

jest.mock('@gitroom/nestjs-libraries/chat/mastra.store', () => ({
  pStore: {},
}));

jest.mock('@gitroom/nestjs-libraries/chat/tools/tool.list', () => {
  const {
    FollowerChannelsTool,
  } = require('@gitroom/nestjs-libraries/chat/tools/follower.channels.tool');
  const {
    FollowersListTool,
  } = require('@gitroom/nestjs-libraries/chat/tools/followers.list.tool');
  const {
    FollowerDetailTool,
  } = require('@gitroom/nestjs-libraries/chat/tools/follower.detail.tool');
  const {
    FollowerTimelineTool,
  } = require('@gitroom/nestjs-libraries/chat/tools/follower.timeline.tool');
  const {
    FollowerListsTool,
  } = require('@gitroom/nestjs-libraries/chat/tools/follower.lists.tool');
  const {
    FollowerStatisticsTool,
  } = require('@gitroom/nestjs-libraries/chat/tools/follower.statistics.tool');
  const {
    ChannelFollowerTotalsTool,
  } = require('@gitroom/nestjs-libraries/chat/tools/channel.follower.totals.tool');
  const {
    FollowerListRemoveMembersTool,
  } = require('@gitroom/nestjs-libraries/chat/tools/follower.list.remove.members.tool');
  const {
    FollowerListAddMemberTool,
  } = require('@gitroom/nestjs-libraries/chat/tools/follower.list.add.member.tool');
  const {
    FollowerIgnoreTool,
  } = require('@gitroom/nestjs-libraries/chat/tools/follower.ignore.tool');
  const {
    FollowerUnignoreTool,
  } = require('@gitroom/nestjs-libraries/chat/tools/follower.unignore.tool');
  const {
    FollowerTriageIgnoreTool,
  } = require('@gitroom/nestjs-libraries/chat/tools/follower.triage.ignore.tool');

  return {
    toolList: [
      FollowerChannelsTool,
      FollowersListTool,
      FollowerDetailTool,
      FollowerTimelineTool,
      FollowerListsTool,
      FollowerStatisticsTool,
      ChannelFollowerTotalsTool,
      FollowerListRemoveMembersTool,
      FollowerListAddMemberTool,
      FollowerIgnoreTool,
      FollowerUnignoreTool,
      FollowerTriageIgnoreTool,
    ],
  };
});

import { BadRequestException, HttpException } from '@nestjs/common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import {
  FOLLOWER_CATEGORY_DESCRIPTIONS,
  FOLLOWER_TRIAGE_FILTERS,
} from '@gitroom/nestjs-libraries/integrations/social/follower.sorts';
import {
  LoadToolsService,
  renderFollowerPageGuidance,
} from '@gitroom/nestjs-libraries/chat/load.tools.service';
import { FollowerChannelsTool } from '@gitroom/nestjs-libraries/chat/tools/follower.channels.tool';
import { FollowersListTool } from '@gitroom/nestjs-libraries/chat/tools/followers.list.tool';
import { FollowerDetailTool } from '@gitroom/nestjs-libraries/chat/tools/follower.detail.tool';
import { FollowerTimelineTool } from '@gitroom/nestjs-libraries/chat/tools/follower.timeline.tool';
import { FollowerListsTool } from '@gitroom/nestjs-libraries/chat/tools/follower.lists.tool';
import { FollowerStatisticsTool } from '@gitroom/nestjs-libraries/chat/tools/follower.statistics.tool';
import { ChannelFollowerTotalsTool } from '@gitroom/nestjs-libraries/chat/tools/channel.follower.totals.tool';
import { FollowerListRemoveMembersTool } from '@gitroom/nestjs-libraries/chat/tools/follower.list.remove.members.tool';
import { FollowerListAddMemberTool } from '@gitroom/nestjs-libraries/chat/tools/follower.list.add.member.tool';
import { FollowerIgnoreTool } from '@gitroom/nestjs-libraries/chat/tools/follower.ignore.tool';
import { FollowerUnignoreTool } from '@gitroom/nestjs-libraries/chat/tools/follower.unignore.tool';
import { FollowerTriageIgnoreTool } from '@gitroom/nestjs-libraries/chat/tools/follower.triage.ignore.tool';
import {
  followerCategoriesDescription,
  followerQueryWithChannelSchema,
  followerSelectorWithChannelSchema,
  followerToolAnnotations,
  followerWriteToolAnnotations,
  getFollowerToolContext,
  requireFollowerWriteActor,
} from '@gitroom/nestjs-libraries/chat/tools/follower.tool.common';
import { toolList } from '@gitroom/nestjs-libraries/chat/tools/tool.list';

const FOLLOWER_READ_TOOL_NAMES = [
  'listFollowerChannels',
  'listFollowers',
  'getFollowerDetail',
  'getFollowerTimeline',
  'listFollowerLists',
  'summarizeFollowerAudience',
  'summarizeChannelFollowerTotals',
] as const;

const FOLLOWER_WRITE_TOOL_NAMES = [
  'removeFollowerListMembers',
  'addFollowerListMember',
  'ignoreFollower',
  'unignoreFollower',
  'ignoreFollowerTriage',
] as const;

const FOLLOWER_TOOL_NAMES = [
  ...FOLLOWER_READ_TOOL_NAMES,
  ...FOLLOWER_WRITE_TOOL_NAMES,
] as const;

const FOLLOWER_READ_TOOL_CLASSES = [
  FollowerChannelsTool,
  FollowersListTool,
  FollowerDetailTool,
  FollowerTimelineTool,
  FollowerListsTool,
  FollowerStatisticsTool,
  ChannelFollowerTotalsTool,
];

const FOLLOWER_WRITE_TOOL_CLASSES = [
  FollowerListRemoveMembersTool,
  FollowerListAddMemberTool,
  FollowerIgnoreTool,
  FollowerUnignoreTool,
  FollowerTriageIgnoreTool,
];

const FOLLOWER_TOOL_CLASSES = [
  ...FOLLOWER_READ_TOOL_CLASSES,
  ...FOLLOWER_WRITE_TOOL_CLASSES,
];

describe('follower tools cross-surface contracts', () => {
  const organizationId = 'org-1';
  const userId = 'user-1';
  const channelId = 'channel-1';

  const createUiContext = (orgId = organizationId, actorUserId = userId) => {
    const requestContext = new Map<string, string>();
    requestContext.set('organization', JSON.stringify({ id: orgId }));
    requestContext.set('user', JSON.stringify({ userId: actorUserId }));
    requestContext.set('ui', 'true');
    return {
      requestContext: {
        get: (key: string) => requestContext.get(key),
        set: (key: string, value: string) => {
          requestContext.set(key, value);
        },
      },
    };
  };

  const createMcpContext = (orgId = organizationId) => {
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

  const createIntegrationService = () => ({
    getFollowerChannels: jest.fn(),
    getFollowers: jest.fn(),
    getFollowerMemberDetails: jest.fn(),
    getFollowerMemberTimeline: jest.fn(),
    listFollowerLists: jest.fn(),
    getStoredFollowerAudienceCounts: jest.fn(),
    getLatestAccountAudienceTotal: jest.fn().mockResolvedValue(null),
    getChannelAudienceTotals: jest.fn(),
    removeFollowerListMembers: jest.fn(),
    addFollowerListMember: jest.fn(),
    ignoreFollowerMember: jest.fn(),
    unignoreFollowerMember: jest.fn(),
    ignoreFollowerMemberTriage: jest.fn(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('tool registry and MCP exposure', () => {
    it('registers every follower tool once in the shared tool list', () => {
      const registeredNames = FOLLOWER_TOOL_CLASSES.map(
        (toolClass) => new toolClass({} as IntegrationService).name
      );

      expect(registeredNames).toEqual([...FOLLOWER_TOOL_NAMES]);
      expect(
        FOLLOWER_TOOL_CLASSES.every((toolClass) => toolList.includes(toolClass))
      ).toBe(true);
    });

    it('exposes identical follower tool ids and MCP annotations from each tool definition', async () => {
      const integrationService = createIntegrationService();
      const exposed = await Promise.all(
        FOLLOWER_TOOL_CLASSES.map(async (toolClass) => {
          const tool = new toolClass(
            integrationService as unknown as IntegrationService
          ).run();
          return {
            id: tool.id,
            annotations: tool.mcp?.annotations,
          };
        })
      );

      expect(exposed.map((tool) => tool.id)).toEqual([...FOLLOWER_TOOL_NAMES]);
      for (const tool of exposed.slice(0, FOLLOWER_READ_TOOL_NAMES.length)) {
        expect(tool.annotations).toEqual(
          expect.objectContaining({
            ...followerToolAnnotations,
            title: expect.any(String),
          })
        );
      }
      for (const tool of exposed.slice(FOLLOWER_READ_TOOL_NAMES.length)) {
        expect(tool.annotations).toEqual(
          expect.objectContaining({
            readOnlyHint: false,
            openWorldHint: false,
            title: expect.any(String),
          })
        );
      }
      expect(
        exposed.find((tool) => tool.id === 'removeFollowerListMembers')?.annotations
      ).toEqual(
        expect.objectContaining({
          ...followerWriteToolAnnotations,
          title: 'Remove follower list members',
          destructiveHint: true,
          idempotentHint: true,
        })
      );
    });

    it('loads the same follower tool names for the postiz agent and MCP listTools', async () => {
      const integrationService = createIntegrationService();
      const moduleRef = {
        get: jest.fn((toolClass: (typeof FOLLOWER_TOOL_CLASSES)[number] | { name?: string }) => {
          if (FOLLOWER_TOOL_CLASSES.includes(toolClass as (typeof FOLLOWER_TOOL_CLASSES)[number])) {
            return new (toolClass as (typeof FOLLOWER_TOOL_CLASSES)[number])(
              integrationService as unknown as IntegrationService
            );
          }
          return {
            name: 'other-tool',
            run: async () => ({ id: 'other-tool' }),
          };
        }),
      };
      const service = new LoadToolsService(moduleRef as any);
      const agent = await service.agent();
      const listedTools = await agent.listTools();

      for (const name of FOLLOWER_TOOL_NAMES) {
        expect(capturedAgentOptions.tools).toHaveProperty(name);
        expect(listedTools).toHaveProperty(name);
      }
      expect(
        Object.keys(capturedAgentOptions.tools).filter((name) =>
          FOLLOWER_TOOL_NAMES.includes(name as (typeof FOLLOWER_TOOL_NAMES)[number])
        )
      ).toEqual([...FOLLOWER_TOOL_NAMES]);
    });
  });

  describe('page context and agent instructions', () => {
    it('renders Costly category meaning from shared taxonomy guidance', () => {
      const guidance = renderFollowerPageGuidance({
        kind: 'list',
        route: '/followers/costly',
        channel: { id: channelId, name: 'Acme', platform: 'x' },
        category: {
          key: 'over_invested',
          label: 'Costly',
          meaning: FOLLOWER_CATEGORY_DESCRIPTIONS.over_invested,
        },
        pagination: { size: 24, number: 1 },
      });

      expect(guidance).toContain('Costly');
      expect(guidance).toContain(FOLLOWER_CATEGORY_DESCRIPTIONS.over_invested);
      expect(followerCategoriesDescription).toContain(
        `over_invested: ${FOLLOWER_CATEGORY_DESCRIPTIONS.over_invested}`
      );
    });

    it('includes follower capabilities and MCP actorless limits in agent instructions', async () => {
      const service = new LoadToolsService({
        get: jest.fn((toolClass: (typeof FOLLOWER_TOOL_CLASSES)[number]) => {
          if (FOLLOWER_TOOL_CLASSES.includes(toolClass)) {
            return new toolClass({} as IntegrationService);
          }
          return {
            name: 'other-tool',
            run: async () => ({ id: 'other-tool' }),
          };
        }),
      } as any);
      await service.agent();

      const instructions = capturedAgentOptions.instructions({
        requestContext: { get: () => null },
      });

      expect(instructions).toContain('follower tools');
      expect(instructions).toContain('actorless personal-grade limits');
      expect(instructions).toContain('follower statistics');
      expect(instructions).toContain('removeFollowerListMembers');
      expect(instructions).toContain('onlyFollowing: true');
      expect(instructions).toContain('Follower audience writes');
      expect(instructions).toContain('actively selected channel');
      expect(instructions).toContain('refreshFollowerPage');
    });

    it('adds live follower-page guidance to instructions when context is present', async () => {
      const service = new LoadToolsService({
        get: jest.fn((toolClass: (typeof FOLLOWER_TOOL_CLASSES)[number]) => {
          if (FOLLOWER_TOOL_CLASSES.includes(toolClass)) {
            return new toolClass({} as IntegrationService);
          }
          return {
            name: 'other-tool',
            run: async () => ({ id: 'other-tool' }),
          };
        }),
      } as any);
      await service.agent();
      const followerPage = {
        kind: 'list' as const,
        route: '/followers/hot',
        channel: { id: channelId, name: 'Acme', platform: 'x' },
        category: {
          key: 'hot_lead' as const,
          label: 'Hot',
          meaning: FOLLOWER_CATEGORY_DESCRIPTIONS.hot_lead,
        },
        pagination: { size: 24, number: 1 },
      };

      const instructions = capturedAgentOptions.instructions({
        requestContext: {
          get: (key: string) => (key === 'followerPage' ? followerPage : null),
        },
      });

      expect(instructions).toContain('Live follower-page context');
      expect(instructions).toContain('/followers/hot');
    });
  });

  describe('representative follower question contracts', () => {
    const integrationService = createIntegrationService();

    beforeEach(() => {
      integrationService.getFollowers.mockResolvedValue({
        items: [{ id: 'follower-1', name: 'Alex', myGrade: 4 }],
        hasMore: false,
        total: 1,
      });
      integrationService.getFollowerMemberDetails.mockResolvedValue({
        follower: { id: 'follower-1', name: 'Alex' },
        notes: [],
        interactions: [],
        relationship: {},
        myGrade: 4,
        tracking: null,
      });
      integrationService.getFollowerMemberTimeline.mockResolvedValue({
        items: [
          {
            externalId: 'post-1',
            url: 'https://example.com/post-1',
            content: 'Hello',
            publishedAt: '2026-08-18T00:00:00.000Z',
          },
        ],
        hasMore: false,
      });
      integrationService.listFollowerLists.mockResolvedValue([
        {
          id: 'list-1',
          name: 'VIP',
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-02T00:00:00.000Z',
        },
      ]);
      integrationService.getStoredFollowerAudienceCounts.mockResolvedValue({
        categories: {
          hot_lead: 0,
          mutual: 4,
          over_invested: 0,
          quiet: 3,
          engaged_not_yet: 0,
          lead: 2,
          ignored: 0,
        },
        lists: [{ id: 'list-1', name: 'VIP', total: 6 }],
        listsTruncated: false,
      });
      integrationService.getFollowerChannels.mockResolvedValue([
        {
          id: channelId,
          name: 'Acme',
          identifier: 'x',
          sorts: [],
        },
      ]);
    });

    it('lists hottest followers through triage-filtered listFollowers', async () => {
      const tool = new FollowersListTool(
        integrationService as unknown as IntegrationService
      ).run();
      const result = await tool.execute!(
        { channelId, triage: 'hot_lead', limit: 20 },
        createUiContext()
      );

      expect(integrationService.getFollowers).toHaveBeenCalledWith(
        { id: organizationId },
        { userId },
        channelId,
        expect.objectContaining({ triage: 'hot_lead', limit: 20 })
      );
      expect(result.output.followers).toEqual([
        expect.objectContaining({ id: 'follower-1', myGrade: 4 }),
      ]);
    });

    it('compares effort using their_effort database sorting', async () => {
      const tool = new FollowersListTool(
        integrationService as unknown as IntegrationService
      ).run();
      await tool.execute!(
        {
          channelId,
          sort: 'their_effort',
          direction: 'desc',
          limit: 10,
        },
        createUiContext()
      );

      expect(integrationService.getFollowers).toHaveBeenCalledWith(
        { id: organizationId },
        { userId },
        channelId,
        expect.objectContaining({
          sort: 'their_effort',
          direction: 'desc',
          limit: 10,
        })
      );
    });

    it('reads recent posts through getFollowerTimeline', async () => {
      const tool = new FollowerTimelineTool(
        integrationService as unknown as IntegrationService
      ).run();
      const result = await tool.execute!(
        { channelId, username: 'alex', limit: 5 },
        createUiContext()
      );

      expect(integrationService.getFollowerMemberTimeline).toHaveBeenCalledWith(
        { id: organizationId },
        channelId,
        undefined,
        'alex',
        5,
        undefined
      );
      expect(result.output.items).toEqual([
        expect.objectContaining({
          externalId: 'post-1',
          url: 'https://example.com/post-1',
        }),
      ]);
    });

    it('summarizes stored category and named-list counts without filtered page totals', async () => {
      integrationService.getFollowers.mockImplementation(
        (_org, _actor, _channelId, query: { triage?: string; audience?: string }) => {
          if (!query.triage && !query.audience) {
            return Promise.resolve({ items: [], hasMore: false, total: 10 });
          }
          return Promise.resolve({ items: [], hasMore: false });
        }
      );

      const tool = new FollowerStatisticsTool(
        integrationService as unknown as IntegrationService
      ).run();
      const result = await tool.execute!({ channelId }, createUiContext());

      expect(result.output.total).toBe(10);
      expect(result.output.totalSource).toBe('list');
      expect(result.output.totalAsOf).toBeNull();
      expect(result.output.categories.quiet).toBe(3);
      expect(result.output.categories.lead).toBe(2);
      expect(result.output.categories.mutual).toBe(4);
      expect(result.output.lists).toEqual([
        { id: 'list-1', name: 'VIP', total: 6 },
      ]);
      expect(FOLLOWER_TRIAGE_FILTERS.every((category) => category in result.output.categories)).toBe(
        true
      );
      expect(integrationService.getStoredFollowerAudienceCounts).toHaveBeenCalledWith(
        { id: organizationId },
        channelId
      );
      expect(integrationService.getFollowers).toHaveBeenCalledTimes(1);
    });

    it('prefers analytics snapshot total when list page has no total', async () => {
      integrationService.getFollowers.mockResolvedValue({
        items: [],
        hasMore: false,
      });
      integrationService.getLatestAccountAudienceTotal.mockResolvedValue({
        value: 1500,
        asOf: '2026-08-15',
        metricKey: 'followers',
        label: 'Followers',
      });

      const tool = new FollowerStatisticsTool(
        integrationService as unknown as IntegrationService
      ).run();
      const result = await tool.execute!({ channelId }, createUiContext());

      expect(result.output.total).toBe(1500);
      expect(result.output.totalAsOf).toBe('2026-08-15');
      expect(result.output.totalSource).toBe('snapshot');
      expect(result.output.categories.quiet).toBe(3);
    });

    it('summarizes channel follower totals from analytics snapshots', async () => {
      integrationService.getChannelAudienceTotals.mockResolvedValue([
        {
          channelId,
          name: 'Acme',
          platform: 'x',
          total: 1500,
          asOf: '2026-08-15',
          label: 'Followers',
          reason: null,
        },
        {
          channelId: 'ig-1',
          name: 'IG',
          platform: 'instagram',
          total: null,
          asOf: null,
          label: null,
          reason: 'not_captured',
        },
      ]);

      const tool = new ChannelFollowerTotalsTool(
        integrationService as unknown as IntegrationService
      ).run();
      const result = await tool.execute!(
        { channelIds: [channelId, 'ig-1'] },
        createUiContext()
      );

      expect(integrationService.getChannelAudienceTotals).toHaveBeenCalledWith(
        { id: organizationId },
        [channelId, 'ig-1']
      );
      expect(result.output).toEqual([
        expect.objectContaining({ channelId, total: 1500, asOf: '2026-08-15' }),
        expect.objectContaining({
          channelId: 'ig-1',
          total: null,
          reason: 'not_captured',
        }),
      ]);
    });

    it('lists named follower lists for a channel', async () => {
      const tool = new FollowerListsTool(
        integrationService as unknown as IntegrationService
      ).run();
      const result = await tool.execute!({ channelId }, createUiContext());

      expect(integrationService.listFollowerLists).toHaveBeenCalledWith(
        { id: organizationId },
        channelId
      );
      expect(result.output).toEqual([
        expect.objectContaining({ id: 'list-1', name: 'VIP' }),
      ]);
    });
  });

  describe('UI actor versus MCP actorless outputs', () => {
    it('passes the UI actor to follower reads and preserves myGrade', async () => {
      const integrationService = createIntegrationService();
      integrationService.getFollowers.mockResolvedValue({
        items: [{ id: 'follower-1', name: 'Alex', myGrade: 5 }],
        hasMore: false,
      });
      integrationService.getFollowerMemberDetails.mockResolvedValue({
        follower: { id: 'follower-1', name: 'Alex' },
        notes: [],
        interactions: [],
        relationship: {},
        myGrade: 5,
      });

      const listTool = new FollowersListTool(
        integrationService as unknown as IntegrationService
      ).run();
      const detailTool = new FollowerDetailTool(
        integrationService as unknown as IntegrationService
      ).run();

      const listResult = await listTool.execute!(
        { channelId, limit: 20 },
        createUiContext()
      );
      const detailResult = await detailTool.execute!(
        { channelId, externalId: 'follower-1' },
        createUiContext()
      );

      expect(getFollowerToolContext({}, createUiContext()).actor).toEqual({
        userId,
      });
      expect(integrationService.getFollowers).toHaveBeenCalledWith(
        { id: organizationId },
        { userId },
        channelId,
        expect.any(Object)
      );
      expect(integrationService.getFollowerMemberDetails).toHaveBeenCalledWith(
        { id: organizationId },
        { userId },
        channelId,
        'follower-1',
        undefined
      );
      expect(listResult.output.followers[0].myGrade).toBe(5);
      expect(detailResult.output.myGrade).toBe(5);
    });

    it('keeps MCP reads actorless and surfaces null personal grades', async () => {
      const integrationService = createIntegrationService();
      integrationService.getFollowers.mockResolvedValue({
        items: [{ id: 'follower-1', name: 'Alex', myGrade: null }],
        hasMore: false,
      });
      integrationService.getFollowerMemberDetails.mockResolvedValue({
        follower: { id: 'follower-1', name: 'Alex' },
        notes: [],
        interactions: [],
        relationship: {},
        myGrade: null,
      });

      const listTool = new FollowersListTool(
        integrationService as unknown as IntegrationService
      ).run();
      const detailTool = new FollowerDetailTool(
        integrationService as unknown as IntegrationService
      ).run();
      const mcpContext = createMcpContext();

      await listTool.execute!({ channelId, limit: 20 }, mcpContext);
      const detailResult = await detailTool.execute!(
        { channelId, externalId: 'follower-1' },
        mcpContext
      );

      expect(getFollowerToolContext({}, mcpContext).actor).toBeUndefined();
      expect(integrationService.getFollowers).toHaveBeenCalledWith(
        { id: organizationId },
        undefined,
        channelId,
        expect.any(Object)
      );
      expect(integrationService.getFollowerMemberDetails).toHaveBeenCalledWith(
        { id: organizationId },
        undefined,
        channelId,
        'follower-1',
        undefined
      );
      expect(detailResult.output.myGrade).toBeNull();
    });
  });

  describe('validation and authorization negatives', () => {
    it('rejects invalid follower query combinations at the schema boundary', () => {
      expect(
        followerQueryWithChannelSchema.safeParse({
          channelId,
          audience: 'lead',
          triage: 'hot_lead',
        }).success
      ).toBe(false);
      expect(
        followerQueryWithChannelSchema.safeParse({
          channelId,
          audience: 'ignored',
          listId: 'list-1',
        }).success
      ).toBe(false);
      expect(
        followerQueryWithChannelSchema.safeParse({
          channelId,
          limit: 101,
        }).success
      ).toBe(false);
    });

    it('rejects ambiguous follower identity selectors', () => {
      expect(
        followerSelectorWithChannelSchema.safeParse({
          channelId,
        }).success
      ).toBe(false);
      expect(
        followerSelectorWithChannelSchema.safeParse({
          channelId,
          externalId: 'follower-1',
          username: 'alex',
        }).success
      ).toBe(false);
    });

    it('surfaces cross-organization channel failures from the service layer', async () => {
      const integrationService = createIntegrationService();
      integrationService.getFollowers.mockRejectedValue(
        new HttpException('Integration not found', 404)
      );
      const tool = new FollowersListTool(
        integrationService as unknown as IntegrationService
      ).run();

      await expect(
        tool.execute!({ channelId: 'foreign-channel', limit: 20 }, createMcpContext('org-2'))
      ).rejects.toMatchObject({
        status: 404,
        message: 'Integration not found',
      });
    });

    it('rejects unadvertised sorts before listing followers', async () => {
      const integrationService = createIntegrationService();
      integrationService.getFollowers.mockRejectedValue(
        new HttpException('Invalid follower sort', 400)
      );
      const tool = new FollowersListTool(
        integrationService as unknown as IntegrationService
      ).run();

      await expect(
        tool.execute!(
          { channelId, sort: 'not_a_real_sort', direction: 'desc', limit: 20 },
          createUiContext()
        )
      ).rejects.toMatchObject({
        status: 400,
        message: 'Invalid follower sort',
      });
    });

    it('rejects actorless my_grade sorting through listFollowers', async () => {
      const integrationService = createIntegrationService();
      integrationService.getFollowers.mockRejectedValue(
        new HttpException(
          'Sorting followers by my_grade requires an authenticated user',
          400
        )
      );
      const tool = new FollowersListTool(
        integrationService as unknown as IntegrationService
      ).run();

      await expect(
        tool.execute!(
          { channelId, sort: 'my_grade', direction: 'desc', limit: 20 },
          createMcpContext()
        )
      ).rejects.toMatchObject({
        status: 400,
        message: 'Sorting followers by my_grade requires an authenticated user',
      });
      expect(integrationService.getFollowers).toHaveBeenCalledWith(
        { id: organizationId },
        undefined,
        channelId,
        expect.objectContaining({ sort: 'my_grade' })
      );
    });
  });

  describe('follower write tools', () => {
    it('removes only-following list members through removeFollowerListMembers', async () => {
      const integrationService = createIntegrationService();
      integrationService.removeFollowerListMembers.mockResolvedValue({
        removed: [{ id: 'follower-1', name: 'Alex', username: 'alex' }],
        remaining: 2,
        hasMore: true,
      });
      const tool = new FollowerListRemoveMembersTool(
        integrationService as unknown as IntegrationService
      ).run();

      const result = await tool.execute!(
        { channelId, listId: 'list-1', onlyFollowing: true },
        createUiContext()
      );

      expect(integrationService.removeFollowerListMembers).toHaveBeenCalledWith(
        { id: organizationId },
        channelId,
        'list-1',
        { onlyFollowing: true }
      );
      expect(result.output).toEqual({
        removed: [{ id: 'follower-1', name: 'Alex', username: 'alex' }],
        remaining: 2,
        hasMore: true,
      });
    });

    it('rejects actorless follower writes and MCP contexts without a UI user', async () => {
      const integrationService = createIntegrationService();
      const tool = new FollowerListRemoveMembersTool(
        integrationService as unknown as IntegrationService
      ).run();

      expect(() => requireFollowerWriteActor(undefined)).toThrow(BadRequestException);
      await expect(
        tool.execute!(
          { channelId, listId: 'list-1', onlyFollowing: true },
          createMcpContext()
        )
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(integrationService.removeFollowerListMembers).not.toHaveBeenCalled();
    });

    it('rejects removeFollowerListMembers inputs that mix or omit selectors', () => {
      const tool = new FollowerListRemoveMembersTool(
        createIntegrationService() as unknown as IntegrationService
      ).run();
      const schema = tool.inputSchema!;

      expect(
        schema.safeParse({
          channelId,
          listId: 'list-1',
          onlyFollowing: true,
          externalIds: ['a'],
        }).success
      ).toBe(false);
      expect(
        schema.safeParse({
          channelId,
          listId: 'list-1',
        }).success
      ).toBe(false);
      expect(
        schema.safeParse({
          channelId,
          listId: 'list-1',
          externalIds: ['a', 'a'],
        }).success
      ).toBe(false);
      expect(
        schema.safeParse({
          channelId,
          listId: 'list-1',
          externalIds: ['a'],
        }).success
      ).toBe(true);
    });

    it('requires lead dismiss reasons on ignoreFollowerTriage', () => {
      const tool = new FollowerTriageIgnoreTool(
        createIntegrationService() as unknown as IntegrationService
      ).run();
      const schema = tool.inputSchema!;

      expect(
        schema.safeParse({
          channelId,
          externalId: 'follower-1',
          triage: 'lead',
        }).success
      ).toBe(false);
      expect(
        schema.safeParse({
          channelId,
          externalId: 'follower-1',
          triage: 'lead',
          reasons: ['wrong_topic'],
        }).success
      ).toBe(true);
    });

    it('adds a list member and ignores a follower through write tools', async () => {
      const integrationService = createIntegrationService();
      integrationService.addFollowerListMember.mockResolvedValue(undefined);
      integrationService.ignoreFollowerMember.mockResolvedValue(undefined);
      const addTool = new FollowerListAddMemberTool(
        integrationService as unknown as IntegrationService
      ).run();
      const ignoreTool = new FollowerIgnoreTool(
        integrationService as unknown as IntegrationService
      ).run();

      await addTool.execute!(
        { channelId, listId: 'list-1', externalId: 'follower-1' },
        createUiContext()
      );
      await ignoreTool.execute!(
        { channelId, externalId: 'follower-1' },
        createUiContext()
      );

      expect(integrationService.addFollowerListMember).toHaveBeenCalledWith(
        { id: organizationId },
        { id: userId },
        channelId,
        'list-1',
        'follower-1'
      );
      expect(integrationService.ignoreFollowerMember).toHaveBeenCalledWith(
        { id: organizationId },
        { id: userId },
        channelId,
        'follower-1'
      );
    });
  });
});
