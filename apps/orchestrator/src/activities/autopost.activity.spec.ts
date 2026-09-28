jest.mock('nestjs-temporal-core', () => ({
  Activity: () => () => undefined,
  ActivityMethod: () => () => undefined,
}));

jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.service',
  () => ({ AutopostService: class AutopostService {} })
);

jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/admin-schedule-logs/admin-schedule-log.service',
  () => ({ AdminScheduleLogService: class AdminScheduleLogService {} })
);

const activityContext = { attempt: 1 };

jest.mock('@temporalio/activity', () => ({
  ApplicationFailure: class ApplicationFailure extends Error {
    type?: string;
    nonRetryable: boolean;
    constructor(message?: string, type?: string, nonRetryable = false) {
      super(message);
      this.name = 'ApplicationFailure';
      this.type = type;
      this.nonRetryable = nonRetryable;
    }
  },
  Context: {
    current: () => ({ info: activityContext }),
  },
}));

import { BadRequestException } from '@nestjs/common';
import { ApplicationFailure } from '@temporalio/activity';
import { AutopostActivity } from './autopost.activity';

describe('AutopostActivity.autoPost', () => {
  beforeEach(() => {
    activityContext.attempt = 1;
  });

  const createActivity = () => {
    const startAutopost = jest.fn();
    const notifyAutopostFailure = jest.fn().mockResolvedValue(undefined);
    const append = jest.fn().mockResolvedValue(undefined);
    const activity = new AutopostActivity(
      { startAutopost, notifyAutopostFailure } as any,
      { append } as any
    );
    return { activity, startAutopost, notifyAutopostFailure, append };
  };

  it('notifies immediately and does not retry client validation errors', async () => {
    const { activity, startAutopost, notifyAutopostFailure, append } =
      createActivity();
    startAutopost.mockRejectedValue(
      new BadRequestException(
        'Sean Hickey: who_can_reply_post must be one of the following values: everyone, following, mentionedUsers, subscribers, verified'
      )
    );

    await expect(activity.autoPost('feed')).rejects.toMatchObject({
      name: 'ApplicationFailure',
      nonRetryable: true,
      message: expect.stringContaining('who_can_reply_post'),
    });

    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleKey: 'autopost-workflows',
        level: 'ERROR',
        message: expect.stringContaining('who_can_reply_post'),
      })
    );
    expect(notifyAutopostFailure).toHaveBeenCalledWith(
      'feed',
      expect.stringContaining('who_can_reply_post')
    );
  });

  it('does not notify transient failures until the last attempt', async () => {
    const { activity, startAutopost, notifyAutopostFailure } = createActivity();
    startAutopost.mockRejectedValue(new Error('queue unavailable'));

    await expect(activity.autoPost('feed')).rejects.toThrow(
      'queue unavailable'
    );
    expect(notifyAutopostFailure).not.toHaveBeenCalled();

    activityContext.attempt = 3;
    await expect(activity.autoPost('feed')).rejects.toThrow(
      'queue unavailable'
    );
    expect(notifyAutopostFailure).toHaveBeenCalledWith(
      'feed',
      'queue unavailable'
    );
  });

  it('still fails the activity when notification itself fails', async () => {
    const { activity, startAutopost, notifyAutopostFailure } = createActivity();
    startAutopost.mockRejectedValue(new BadRequestException('Invalid post'));
    notifyAutopostFailure.mockRejectedValue(new Error('notify failed'));

    await expect(activity.autoPost('feed')).rejects.toBeInstanceOf(
      ApplicationFailure
    );
  });
});
