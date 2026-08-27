const nodeEndpoint = jest.fn();
const getLocalAgents = jest.fn();
const mastra = {};

jest.mock('@copilotkit/runtime', () => ({
  CopilotRuntime: jest.fn().mockImplementation((options) => options),
  OpenAIAdapter: jest.fn().mockImplementation((options) => options),
  copilotRuntimeNodeHttpEndpoint: jest.fn(() => nodeEndpoint),
}));

jest.mock('@ag-ui/mastra', () => ({
  MastraAgent: { getLocalAgents },
}));

jest.mock('@mastra/core/di', () => ({
  RequestContext: class RequestContext {
    private values = new Map<string, unknown>();

    set(key: string, value: unknown) {
      this.values.set(key, value);
    }

    get(key: string) {
      return this.values.get(key);
    }
  },
}));

jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class SubscriptionService {} })
);

jest.mock('@gitroom/nestjs-libraries/chat/mastra.service', () => ({
  MastraService: class MastraService {},
}));

import { CopilotController } from './copilot.controller';

describe('CopilotController', () => {
  const organization = { id: 'org-server' } as any;
  const user = { id: 'user-server' } as any;
  const subscriptionService = {} as any;
  const mastraService = { mastra: jest.fn().mockResolvedValue(mastra) };
  const request = {
    body: {
      variables: {
        properties: {
          integrations: [
            {
              id: 'channel-1',
              name: 'Postiz',
              providerIdentifier: 'x',
              type: 'social',
            },
            { id: 'invalid' },
          ],
          pipeline: {
            id: 'pipeline-1',
            name: 'Launch',
            timezone: 'UTC',
            active: true,
            channels: [],
            contextDocuments: [],
          },
          followerPage: {
            kind: 'list',
            route: '/followers/hot',
            channel: { id: 'channel-1', name: 'Postiz', platform: 'x' },
            category: {
              key: 'hot_lead',
              label: 'Hot',
              meaning:
                "Their effort exceeds the channel's, including unreciprocated inbound engagement.",
            },
            pagination: { size: 24, number: 1 },
          },
          organization: { id: 'client-org' },
          user: { id: 'client-user' },
          ignored: 'ignored',
        },
      },
    },
  } as any;
  const response = {} as any;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test-key';
    getLocalAgents.mockReturnValue({ postiz: { name: 'postiz' } });
    nodeEndpoint.mockReturnValue('handled');
  });

  afterAll(() => {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
  });

  it('builds one server-owned context with allowlisted UI properties', () => {
    const controller = new CopilotController(
      subscriptionService,
      mastraService as any
    );

    const context = (controller as any).createRequestContext(
      request,
      organization,
      user
    );

    expect(context.get('integrations')).toEqual([
      {
        id: 'channel-1',
        name: 'Postiz',
        providerIdentifier: 'x',
        type: 'social',
      },
    ]);
    expect(context.get('pipeline')).toEqual(
      request.body.variables.properties.pipeline
    );
    expect(context.get('followerPage')).toEqual(
      expect.objectContaining({
        kind: 'list',
        route: '/followers/hot',
        channel: expect.objectContaining({
          id: 'channel-1',
          name: 'Postiz',
          platform: 'x',
        }),
        category: expect.objectContaining({
          key: 'hot_lead',
          label: 'Hot',
          meaning:
            "Their effort exceeds the channel's, including unreciprocated inbound engagement.",
        }),
        pagination: { size: 24, number: 1 },
      })
    );
    expect(context.get('organization')).toBe(JSON.stringify(organization));
    expect(context.get('user')).toBe(JSON.stringify({ userId: user.id }));
    expect(context.get('ui')).toBe('true');
  });

  it('uses the postiz local agent for popup and threaded agent endpoints', async () => {
    const controller = new CopilotController(
      subscriptionService,
      mastraService as any
    );

    await expect(
      controller.chatAgent(request, response, organization, user)
    ).resolves.toBe('handled');
    await expect(
      controller.agent(request, response, organization, user)
    ).resolves.toBe('handled');

    expect(getLocalAgents).toHaveBeenCalledTimes(2);
    expect(getLocalAgents).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ mastra, resourceId: organization.id })
    );
    expect(getLocalAgents).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ mastra, resourceId: organization.id })
    );
  });

  it('passes the same follower-page and UI actor context to both copilot endpoints', async () => {
    const controller = new CopilotController(
      subscriptionService,
      mastraService as any
    );

    await controller.chatAgent(request, response, organization, user);
    await controller.agent(request, response, organization, user);

    const chatContext = getLocalAgents.mock.calls[0][0].requestContext;
    const agentContext = getLocalAgents.mock.calls[1][0].requestContext;

    expect(chatContext.get('followerPage')).toEqual(
      agentContext.get('followerPage')
    );
    expect(chatContext.get('user')).toEqual(agentContext.get('user'));
    expect(chatContext.get('ui')).toBe('true');
    expect(chatContext.get('followerPage')).toEqual(
      expect.objectContaining({
        kind: 'list',
        route: '/followers/hot',
        category: expect.objectContaining({ key: 'hot_lead', label: 'Hot' }),
      })
    );
    expect(JSON.parse(chatContext.get('user') as string)).toEqual({
      userId: user.id,
    });
  });

  it('does not initialize either runtime without an OpenAI key', async () => {
    const controller = new CopilotController(
      subscriptionService,
      mastraService as any
    );
    delete process.env.OPENAI_API_KEY;

    await expect(
      controller.chatAgent(request, response, organization, user)
    ).resolves.toBeUndefined();
    await expect(
      controller.agent(request, response, organization, user)
    ).resolves.toBeUndefined();

    expect(mastraService.mastra).not.toHaveBeenCalled();
    expect(getLocalAgents).not.toHaveBeenCalled();
    expect(nodeEndpoint).not.toHaveBeenCalled();
  });
});
