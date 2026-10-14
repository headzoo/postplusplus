jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class PostsService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({ NotificationService: class NotificationService {} })
);

import { OverduePostMonitor } from './overdue.post.monitor';

describe('OverduePostMonitor', () => {
  const now = new Date('2026-10-14T13:30:00.000Z');
  const integration = {
    name: 'Sean Hickey',
    providerIdentifier: 'x',
    disabled: false,
    refreshNeeded: false,
    inBetweenSteps: false,
  };
  const overduePost = (id: string, overrides = {}) => ({
    id,
    organizationId: 'org',
    publishDate: new Date('2026-10-14T13:00:00.000Z'),
    content: '<p>Every programmer   knows this</p>',
    integration,
    ...overrides,
  });

  const createMonitor = (pages: unknown[][]) => {
    const postsService = { getOverduePosts: jest.fn() };
    for (const page of pages) {
      postsService.getOverduePosts.mockResolvedValueOnce(page);
    }
    postsService.getOverduePosts.mockResolvedValue([]);
    const notificationService = {
      inAppNotificationOnce: jest.fn().mockResolvedValue(undefined),
    };
    const adminScheduleLogService = {
      append: jest.fn().mockResolvedValue(undefined),
    };
    return {
      monitor: new OverduePostMonitor(
        postsService as any,
        notificationService as any,
        adminScheduleLogService as any
      ),
      postsService,
      notificationService,
      adminScheduleLogService,
    };
  };

  it('notifies once per overdue post and schedule time', async () => {
    const {
      monitor,
      postsService,
      notificationService,
      adminScheduleLogService,
    } = createMonitor([[overduePost('post-1')]]);

    await monitor.check(now);

    expect(postsService.getOverduePosts).toHaveBeenCalledWith(
      new Date('2026-10-12T13:30:00.000Z'),
      new Date('2026-10-14T13:15:00.000Z'),
      undefined,
      200
    );
    expect(notificationService.inAppNotificationOnce).toHaveBeenCalledWith(
      'org',
      'post-overdue:post-1:2026-10-14T13:00:00.000Z',
      'Postiz has not sent your post "Every programmer knows this" to Sean Hickey (x), scheduled for Oct 14, 2026 1:00 PM UTC. It is 30 minutes late. The background publishing service has not sent it, so it may be down or stuck, or still retrying an error.'
    );
    expect(adminScheduleLogService.append).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleKey: 'post-workflows',
        level: 'ERROR',
        meta: { totalOverdue: 1, postIds: ['post-1'] },
      })
    );
  });

  it('does not repeat a post that is still overdue on the next pass', async () => {
    const {
      monitor,
      postsService,
      notificationService,
      adminScheduleLogService,
    } = createMonitor([[overduePost('post-1')]]);
    postsService.getOverduePosts.mockResolvedValueOnce([overduePost('post-1')]);

    await monitor.check(now);
    await monitor.check(now);

    expect(notificationService.inAppNotificationOnce).toHaveBeenCalledTimes(1);
    expect(adminScheduleLogService.append).toHaveBeenCalledTimes(1);
  });

  it('pages through every overdue post', async () => {
    const firstPage = Array.from({ length: 200 }, (_, index) =>
      overduePost(`post-${String(index).padStart(3, '0')}`)
    );
    const { monitor, postsService, notificationService } = createMonitor([
      firstPage,
      [overduePost('post-200')],
    ]);

    await monitor.check(now);

    expect(postsService.getOverduePosts).toHaveBeenNthCalledWith(
      2,
      expect.any(Date),
      expect.any(Date),
      'post-199',
      200
    );
    expect(notificationService.inAppNotificationOnce).toHaveBeenCalledTimes(
      201
    );
  });

  it('explains when the channel blocks publishing', async () => {
    const { monitor, notificationService } = createMonitor([
      [
        overduePost('post-2', {
          content: '',
          integration: { ...integration, refreshNeeded: true },
        }),
      ],
    ]);

    await monitor.check(now);

    expect(notificationService.inAppNotificationOnce).toHaveBeenCalledWith(
      'org',
      'post-overdue:post-2:2026-10-14T13:00:00.000Z',
      expect.stringContaining(
        'The channel needs to be reconnected before this post can be published.'
      )
    );
  });

  it('keeps running when the lookup fails', async () => {
    const { monitor, postsService, notificationService } = createMonitor([]);
    postsService.getOverduePosts.mockRejectedValue(new Error('db down'));

    await expect(monitor.check(now)).resolves.toBeUndefined();
    expect(notificationService.inAppNotificationOnce).not.toHaveBeenCalled();
  });
});
