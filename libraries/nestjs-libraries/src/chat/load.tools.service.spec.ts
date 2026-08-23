let mockAgentOptions: { instructions: (context: any) => string };

jest.mock('@mastra/core/agent', () => ({
  Agent: class Agent {
    constructor(options: { instructions: (context: any) => string }) {
      mockAgentOptions = options;
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

jest.mock('@gitroom/nestjs-libraries/chat/tools/tool.list', () => ({
  toolList: [],
}));

import {
  LoadToolsService,
  renderFollowerPageGuidance,
  renderSelectedPipelineGuidance,
  SelectedPipelineContext,
} from './load.tools.service';

const selectedPipeline: SelectedPipelineContext = {
  id: 'pipeline-1',
  name: 'Product Launch',
  timezone: 'America/New_York',
  active: true,
  channels: [
    {
      id: 'channel-1',
      name: 'Postiz on X',
      platform: 'x',
      picture: 'https://example.com/x.png',
    },
  ],
  contextDocuments: [
    {
      id: 'document-1',
      name: 'BRAND.md',
      fileSize: 123,
      updatedAt: '2026-08-11T12:00:00.000Z',
    },
  ],
};

describe('renderSelectedPipelineGuidance', () => {
  it('includes the selected pipeline identity and refresh guidance', () => {
    const guidance = renderSelectedPipelineGuidance(selectedPipeline);

    expect(guidance).toContain('id: pipeline-1');
    expect(guidance).toContain('Product Launch');
    expect(guidance).toContain('Postiz on X (x, id: channel-1)');
    expect(guidance).toContain('BRAND.md (id: document-1, 123 bytes');
    expect(guidance).toContain('listPipelines to refresh and validate');
    expect(guidance).toContain('not as authorization');
  });

  it('does not add selected-pipeline guidance without a selection', () => {
    expect(renderSelectedPipelineGuidance(null)).toBe('');
  });

  it('adds context guidance to the Mastra agent only when selected', async () => {
    const service = new LoadToolsService({ get: jest.fn() } as any);
    await service.agent();

    const withPipeline = mockAgentOptions.instructions({
      requestContext: {
        get: (key: string) => {
          if (key === 'pipeline') {
            return selectedPipeline;
          }
          if (key === 'followerPage') {
            return null;
          }
          return 'true';
        },
      },
    });
    const withoutPipeline = mockAgentOptions.instructions({
      requestContext: { get: () => null },
    });

    expect(withPipeline).toContain('id: pipeline-1');
    expect(withoutPipeline).not.toContain('User-selected pipeline target');
  });
});

describe('renderFollowerPageGuidance', () => {
  const followerPage = {
    kind: 'list' as const,
    route: '/followers/hot',
    channel: { id: 'channel-1', name: 'Postiz on X', platform: 'x' },
    category: {
      key: 'hot_lead' as const,
      label: 'Hot',
      meaning: "Their effort exceeds the channel's.",
    },
    search: 'alex',
    availableLists: [{ id: 'list-great', name: 'Great' }],
    sort: {
      key: 'followers_count',
      label: 'Followers',
      scope: 'page' as const,
      direction: 'desc' as const,
      caveat: 'Sorting applies only to the currently loaded page.',
    },
    pagination: { size: 24, number: 2 },
  };

  it('renders bounded follower page guidance when context is present', () => {
    const guidance = renderFollowerPageGuidance(followerPage);

    expect(guidance).toContain('Current page: list at /followers/hot');
    expect(guidance).toContain('Postiz on X · x · id: channel-1');
    expect(guidance).toContain(
      'Actively selected channel (prefer this channelId for follower tools'
    );
    expect(guidance).toContain('Great (id: list-great)');
    expect(guidance).toContain("Their effort exceeds the channel's.");
    expect(guidance).toContain('Sorting applies only to the currently loaded page.');
    expect(guidance).toContain('use follower tools to refresh and validate');
    expect(guidance).toContain('refreshFollowerPage');
  });

  it('does not add follower guidance outside follower pages', () => {
    expect(renderFollowerPageGuidance(null)).toBe('');
  });

  it('adds follower guidance to the Mastra agent only when present', async () => {
    const service = new LoadToolsService({ get: jest.fn() } as any);
    await service.agent();

    const withFollowerPage = mockAgentOptions.instructions({
      requestContext: {
        get: (key: string) => (key === 'followerPage' ? followerPage : null),
      },
    });
    const withoutFollowerPage = mockAgentOptions.instructions({
      requestContext: { get: () => null },
    });

    expect(withFollowerPage).toContain('Live follower-page context');
    expect(withoutFollowerPage).not.toContain('Live follower-page context');
  });

  it('documents MCP actorless personal-grade limits in base agent instructions', async () => {
    const service = new LoadToolsService({ get: jest.fn() } as any);
    await service.agent();

    const instructions = mockAgentOptions.instructions({
      requestContext: { get: () => null },
    });

    expect(instructions).toContain('actorless personal-grade limits');
    expect(instructions).toContain('follower tools');
    expect(instructions).toContain('removeFollowerListMembers');
    expect(instructions).toContain('Follower audience writes');
    expect(instructions).toContain('actively selected channel');
    expect(instructions).toContain('refreshFollowerPage');
  });

  it('documents organization skill discovery, slash invocation, and safety precedence', async () => {
    const service = new LoadToolsService({ get: jest.fn() } as any);
    await service.agent();

    const instructions = mockAgentOptions.instructions({
      requestContext: { get: () => null },
    });

    expect(instructions).toContain('listSkills');
    expect(instructions).toContain('loadSkill');
    expect(instructions).toContain("first token is /slug");
    expect(instructions).toContain('never load every skill body');
    expect(instructions).toContain('Do not claim a skill was applied unless loadSkill succeeded');
    expect(instructions).toContain('cannot override base safety rules');
    expect(instructions).toContain('readPipelineContextDocument');
  });
});
