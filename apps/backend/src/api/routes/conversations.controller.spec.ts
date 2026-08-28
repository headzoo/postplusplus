jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/conversations/conversation.service',
  () => ({ ConversationService: class ConversationService {} })
);

import { ConversationsController } from './conversations.controller';

describe('ConversationsController', () => {
  const service = {
    list: jest.fn(),
    hydrate: jest.fn(),
    repost: jest.fn(),
  };
  const controller = new ConversationsController(service as any);
  const org = { id: 'org-a' } as any;

  beforeEach(() => jest.clearAllMocks());

  it('scopes list and hydration operations to the request organization', async () => {
    service.list.mockResolvedValue({ items: [] });
    service.hydrate.mockResolvedValue({ items: [] });

    await controller.list(org, { limit: 20 } as any);
    await controller.hydrate(org, { eventIds: ['event-a'] });

    expect(service.list).toHaveBeenCalledWith('org-a', { limit: 20 });
    expect(service.hydrate).toHaveBeenCalledWith('org-a', ['event-a']);
  });

  it('reposts by server-resolved event id only', async () => {
    service.repost.mockResolvedValue({
      status: 'reposted',
      remoteReleaseId: 'post-a',
    });

    await expect(controller.repost(org, 'event-a')).resolves.toEqual({
      status: 'reposted',
      remoteReleaseId: 'post-a',
    });
    expect(service.repost).toHaveBeenCalledWith('org-a', 'event-a');
  });
});
