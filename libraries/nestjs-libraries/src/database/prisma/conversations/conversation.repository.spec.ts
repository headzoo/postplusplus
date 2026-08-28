import { ConversationRepository } from './conversation.repository';

describe('ConversationRepository', () => {
  it('uses an organization-scoped descending inbox keyset', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new ConversationRepository({
      model: { channelInteractionEvent: { findMany } },
    } as any);
    const cursor = { eventAt: new Date('2026-08-28T12:00:00.000Z'), id: 'a' };

    await expect(
      repository.list('org-a', {
        take: 20,
        integrationId: 'integration-a',
        cursor,
      })
    ).resolves.toEqual({ events: [], next: undefined });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-a',
          integrationId: 'integration-a',
          direction: 'INBOUND',
          kind: { in: ['MENTION', 'REPOST'] },
          OR: [
            { eventAt: { lt: cursor.eventAt } },
            { eventAt: cursor.eventAt, id: { lt: 'a' } },
          ],
        }),
        orderBy: [{ eventAt: 'desc' }, { id: 'desc' }],
        take: 21,
      })
    );
  });
});
