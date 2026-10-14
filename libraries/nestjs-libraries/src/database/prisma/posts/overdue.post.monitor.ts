import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import striptags from 'striptags';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { AdminScheduleLogService } from '@gitroom/nestjs-libraries/database/prisma/admin-schedule-logs/admin-schedule-log.service';

dayjs.extend(utc);

const PAGE_SIZE = 200;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const OVERDUE_AFTER_MS = 15 * 60 * 1000;
const LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;

type OverduePost = Awaited<ReturnType<PostsService['getOverduePosts']>>[number];

// Runs in the backend so a dead or stuck orchestrator still gets reported.
@Injectable()
export class OverduePostMonitor
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly _logger = new Logger(OverduePostMonitor.name);
  private _interval?: NodeJS.Timeout;
  private _running = false;
  private _reported = new Set<string>();

  constructor(
    private _postsService: PostsService,
    private _notificationService: NotificationService,
    private _adminScheduleLogService: AdminScheduleLogService
  ) {}

  onApplicationBootstrap() {
    if (!process.env.RUN_CRON) {
      return;
    }
    this._interval = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
    this._interval.unref();
  }

  onApplicationShutdown() {
    clearInterval(this._interval);
  }

  async check(now = new Date()) {
    if (this._running) {
      return;
    }
    this._running = true;
    try {
      const overdue = new Set<string>();
      const newlyOverdue: OverduePost[] = [];
      let cursor: string | undefined;
      do {
        const page = await this._postsService.getOverduePosts(
          new Date(now.getTime() - LOOKBACK_MS),
          new Date(now.getTime() - OVERDUE_AFTER_MS),
          cursor,
          PAGE_SIZE
        );
        for (const post of page) {
          const key = `post-overdue:${
            post.id
          }:${post.publishDate.toISOString()}`;
          overdue.add(key);
          if (!this._reported.has(key)) {
            newlyOverdue.push(post);
            await this._notificationService.inAppNotificationOnce(
              post.organizationId,
              key,
              this.message(post, now)
            );
          }
        }
        cursor =
          page.length === PAGE_SIZE ? page[page.length - 1]?.id : undefined;
      } while (cursor);
      this._reported = overdue;

      if (!newlyOverdue.length) {
        return;
      }
      this._logger.warn(
        `${newlyOverdue.length} scheduled post(s) became overdue (${overdue.size} overdue in total)`
      );
      await this._adminScheduleLogService.append({
        scheduleKey: 'post-workflows',
        level: 'ERROR',
        message: `${newlyOverdue.length} scheduled post(s) were not sent on time`,
        meta: {
          totalOverdue: overdue.size,
          postIds: newlyOverdue.slice(0, 100).map((post) => post.id),
        },
      });
    } catch (error) {
      this._logger.error('Failed to check for overdue posts', error);
    } finally {
      this._running = false;
    }
  }

  private message(post: OverduePost, now: Date) {
    const minutesLate = Math.round(
      (now.getTime() - post.publishDate.getTime()) / 60000
    );
    const preview = striptags(post.content || '')
      .replace(/\s+/g, ' ')
      .trim();
    const quoted = preview
      ? ` "${preview.length > 80 ? `${preview.slice(0, 80)}…` : preview}"`
      : '';
    const scheduledFor = dayjs
      .utc(post.publishDate)
      .format('MMM D, YYYY h:mm A [UTC]');
    const reason = post.integration.disabled
      ? 'The channel is disabled. Enable it to publish this post.'
      : post.integration.refreshNeeded
      ? 'The channel needs to be reconnected before this post can be published.'
      : post.integration.inBetweenSteps
      ? 'The channel setup was not finished. Complete it to publish this post.'
      : 'The background publishing service has not sent it, so it may be down or stuck, or still retrying an error.';
    return `Postiz has not sent your post${quoted} to ${post.integration.name} (${post.integration.providerIdentifier}), scheduled for ${scheduledFor}. It is ${minutesLate} minutes late. ${reason}`;
  }
}
