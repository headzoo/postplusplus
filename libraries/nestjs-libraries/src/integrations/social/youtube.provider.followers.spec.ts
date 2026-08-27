import 'reflect-metadata';
const setCredentials = jest.fn();
const subscriptionsList = jest.fn();
const channelsList = jest.fn();
const reportsQuery = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn(() => ({ setCredentials })),
    },
    youtube: jest.fn(() => ({
      subscriptions: { list: subscriptionsList },
      channels: { list: channelsList },
    })),
    oauth2: jest.fn(),
    youtubeAnalytics: jest.fn(() => ({
      reports: { query: reportsQuery },
    })),
  },
}));

import { YoutubeProvider } from '@gitroom/nestjs-libraries/integrations/social/youtube.provider';
import { paginateDailyAnalyticsCapture } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';

describe('YoutubeProvider followers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists only public subscribers through mySubscribers and preserves tokens', async () => {
    subscriptionsList.mockResolvedValue({
      data: {
        items: [
          {
            subscriberSnippet: {
              channelId: 'subscriber-channel',
              title: 'Public subscriber',
              description: 'Public profile',
              thumbnails: {
                medium: { url: 'https://img.example/subscriber.jpg' },
              },
            },
          },
        ],
        pageInfo: { totalResults: 1 },
        nextPageToken: 'next-page',
        prevPageToken: 'previous-page',
      },
    });

    const page = await new YoutubeProvider().followers({} as any, 'token', {
      limit: 100,
      cursor: 'current-page',
      sort: 'alphabetical',
      direction: 'asc',
    });

    expect(setCredentials).toHaveBeenCalledWith({ access_token: 'token' });
    expect(subscriptionsList).toHaveBeenCalledWith({
      part: ['subscriberSnippet'],
      mySubscribers: true,
      maxResults: 50,
      pageToken: 'current-page',
      order: 'alphabetical',
    });
    expect(page).toEqual({
      items: [
        {
          id: 'subscriber-channel',
          name: 'Public subscriber',
          bio: 'Public profile',
          picture: 'https://img.example/subscriber.jpg',
          profileUrl: 'https://www.youtube.com/channel/subscriber-channel',
        },
      ],
      total: 1,
      nextCursor: 'next-page',
      previousCursor: 'previous-page',
      hasMore: true,
    });
  });

  it('paginates 180-day capture points within the requested persistence bound', async () => {
    const metricColumns = [
      'views',
      'estimatedMinutesWatched',
      'averageViewDuration',
      'averageViewPercentage',
      'subscribersGained',
      'likes',
      'subscribersLost',
    ];
    reportsQuery.mockResolvedValue({
      data: {
        columnHeaders: [
          { name: 'day' },
          ...metricColumns.map((name) => ({ name })),
        ],
        rows: Array.from({ length: 181 }, (_, index) => [
          `2026-02-${String((index % 28) + 1).padStart(2, '0')}`,
          ...metricColumns.map(() => index),
        ]),
      },
    });
    const request = {
      integration: { internalId: 'channel' },
      accessToken: 'token',
      snapshotAt: new Date('2026-08-15T12:00:00.000Z'),
      fromDay: new Date('2026-02-16T00:00:00.000Z'),
      toDay: new Date('2026-08-15T00:00:00.000Z'),
      pageSize: 100,
    } as any;

    const provider = new YoutubeProvider();
    const first = await provider.analyticsSnapshot!.capture(request);
    const second = await provider.analyticsSnapshot!.capture({
      ...request,
      cursor: first.nextCursor,
    });

    expect(reportsQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: '2026-02-16',
        endDate: '2026-08-15',
      })
    );
    expect(first.points).toHaveLength(100);
    expect(first.nextCursor).toBe('100');
    expect(second.points).toHaveLength(100);
    expect(first.points.length).toBeLessThanOrEqual(1_000);
    expect(second.points.length).toBeLessThanOrEqual(1_000);
  });

  it('rejects an invalid analytics capture cursor', async () => {
    expect(() =>
      paginateDailyAnalyticsCapture(
        { cursor: 'not-a-cursor', pageSize: 100 } as any,
        { fromDay: '2026-02-16', toDay: '2026-08-15' },
        []
      )
    ).toThrow('Invalid analytics capture cursor');
  });

  it('fails capture when YouTube returns an error envelope', async () => {
    reportsQuery.mockResolvedValue({
      data: { errors: [{ reason: 'forbidden' }] },
    });

    await expect(
      new YoutubeProvider().analyticsSnapshot!.capture({
        integration: { internalId: 'channel' },
        accessToken: 'token',
        snapshotAt: new Date('2026-08-15T12:00:00.000Z'),
        pageSize: 100,
      } as any)
    ).rejects.toThrow('YouTube analytics request failed');
  });

  it('includes a latest subscriber total for the snapshot day', async () => {
    reportsQuery.mockResolvedValue({
      data: {
        columnHeaders: [{ name: 'day' }, { name: 'views' }],
        rows: [['2026-08-15', 10]],
      },
    });
    channelsList.mockResolvedValue({
      data: {
        items: [{ statistics: { subscriberCount: '4242' } }],
      },
    });

    const page = await new YoutubeProvider().analyticsSnapshot!.capture({
      integration: { internalId: 'channel' },
      accessToken: 'token',
      snapshotAt: new Date('2026-08-15T12:00:00.000Z'),
      fromDay: new Date('2026-08-15T00:00:00.000Z'),
      toDay: new Date('2026-08-15T00:00:00.000Z'),
      pageSize: 100,
    } as any);

    expect(channelsList).toHaveBeenCalledWith({
      part: ['statistics'],
      mine: true,
    });
    expect(page.points).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metricKey: 'subscribers',
          label: 'Subscribers',
          valueMode: 'latest',
          value: 4242,
          day: '2026-08-15',
        }),
      ])
    );
  });
});
