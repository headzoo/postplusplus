import { XProvider } from './x.provider';
import { Integration } from '@prisma/client';
import { TwitterApi } from 'twitter-api-v2';

jest.mock('twitter-api-v2');

describe('XProvider PostRules Capability', () => {
  let provider: XProvider;
  let mockIntegration: Integration;
  const mockAccessToken = 'mock_access:mock_secret';
  const originalEnv = process.env.DISABLE_X_ANALYTICS;

  beforeEach(() => {
    // Ensure X analytics is enabled for tests
    delete process.env.DISABLE_X_ANALYTICS;

    provider = new XProvider();
    mockIntegration = {
      id: 'test-integration-id',
      internalId: '123456789',
      token: mockAccessToken,
    } as Integration;

    jest.clearAllMocks();
  });

  afterAll(() => {
    // Restore original environment
    if (originalEnv !== undefined) {
      process.env.DISABLE_X_ANALYTICS = originalEnv;
    } else {
      delete process.env.DISABLE_X_ANALYTICS;
    }
  });

  describe('metadata', () => {
    it('should return correct capability metadata when analytics enabled', () => {
      const metadata = provider.postRules?.metadata();
      expect(metadata).toEqual({
        actions: {
          remove: true,
          autoRepost: true,
          autoPlug: true,
          notify: true,
        },
        metrics: {
          likes: true,
          replies: true,
        },
      });
    });

    it('should return undefined when X analytics disabled', () => {
      const originalEnv = process.env.DISABLE_X_ANALYTICS;
      process.env.DISABLE_X_ANALYTICS = '1';

      const newProvider = new XProvider();
      expect(newProvider.postRules).toBeUndefined();

      process.env.DISABLE_X_ANALYTICS = originalEnv;
    });
  });

  describe('loadMetrics', () => {
    it('should successfully load likes and replies count', async () => {
      const mockClient = {
        v2: {
          singleTweet: jest.fn().mockResolvedValue({
            data: {
              public_metrics: {
                like_count: 42,
                reply_count: 7,
              },
            },
          }),
        },
      };
      (TwitterApi as jest.MockedClass<typeof TwitterApi>).mockImplementation(
        () => mockClient as any
      );

      const result = await provider.postRules!.loadMetrics(
        mockIntegration,
        mockAccessToken,
        'tweet123'
      );

      expect(result).toEqual({
        status: 'success',
        metrics: {
          likes: 42,
          replies: 7,
        },
      });
    });

    it('should omit replies when not present', async () => {
      const mockClient = {
        v2: {
          singleTweet: jest.fn().mockResolvedValue({
            data: {
              public_metrics: {
                like_count: 42,
              },
            },
          }),
        },
      };
      (TwitterApi as jest.MockedClass<typeof TwitterApi>).mockImplementation(
        () => mockClient as any
      );

      const result = await provider.postRules!.loadMetrics(
        mockIntegration,
        mockAccessToken,
        'tweet123'
      );

      expect(result).toEqual({
        status: 'success',
        metrics: {
          likes: 42,
        },
      });
    });

    it('should return not_found for missing tweet', async () => {
      const mockClient = {
        v2: {
          singleTweet: jest.fn().mockRejectedValue({ code: 404 }),
        },
      };
      (TwitterApi as jest.MockedClass<typeof TwitterApi>).mockImplementation(
        () => mockClient as any
      );

      const result = await provider.postRules!.loadMetrics(
        mockIntegration,
        mockAccessToken,
        'missing123'
      );

      expect(result).toEqual({ status: 'not_found' });
    });

    it('should return auth_error for unauthorized request', async () => {
      const mockClient = {
        v2: {
          singleTweet: jest.fn().mockRejectedValue({ code: 401 }),
        },
      };
      (TwitterApi as jest.MockedClass<typeof TwitterApi>).mockImplementation(
        () => mockClient as any
      );

      const result = await provider.postRules!.loadMetrics(
        mockIntegration,
        mockAccessToken,
        'tweet123'
      );

      expect(result).toEqual({ status: 'auth_error' });
    });

    it('should return retryable_failure for transient errors', async () => {
      const mockClient = {
        v2: {
          singleTweet: jest
            .fn()
            .mockRejectedValue(new Error('Network timeout')),
        },
      };
      (TwitterApi as jest.MockedClass<typeof TwitterApi>).mockImplementation(
        () => mockClient as any
      );

      const result = await provider.postRules!.loadMetrics(
        mockIntegration,
        mockAccessToken,
        'tweet123'
      );

      expect(result).toEqual({
        status: 'retryable_failure',
        reason: 'Network timeout',
      });
    });
  });

  describe('removePost', () => {
    it('should successfully delete a tweet', async () => {
      const mockClient = {
        v2: {
          deleteTweet: jest.fn().mockResolvedValue({ data: { deleted: true } }),
        },
      };
      (TwitterApi as jest.MockedClass<typeof TwitterApi>).mockImplementation(
        () => mockClient as any
      );

      const result = await provider.postRules!.removePost(
        mockIntegration,
        mockAccessToken,
        'tweet123'
      );

      expect(result).toEqual({ status: 'removed' });
      expect(mockClient.v2.deleteTweet).toHaveBeenCalledWith('tweet123');
    });

    it('should return already_absent for missing tweet', async () => {
      const mockClient = {
        v2: {
          deleteTweet: jest.fn().mockRejectedValue({ code: 404 }),
        },
      };
      (TwitterApi as jest.MockedClass<typeof TwitterApi>).mockImplementation(
        () => mockClient as any
      );

      const result = await provider.postRules!.removePost(
        mockIntegration,
        mockAccessToken,
        'missing123'
      );

      expect(result).toEqual({ status: 'already_absent' });
    });
  });

  describe('repost', () => {
    it('should successfully repost a tweet', async () => {
      const mockClient = {
        v2: {
          retweet: jest.fn().mockResolvedValue({ data: { retweeted: true } }),
        },
      };
      (TwitterApi as jest.MockedClass<typeof TwitterApi>).mockImplementation(
        () => mockClient as any
      );

      const result = await provider.postRules!.repost(
        mockIntegration,
        mockAccessToken,
        'tweet123'
      );

      expect(result).toEqual({
        status: 'reposted',
        remoteReleaseId: 'tweet123',
      });
      expect(mockClient.v2.retweet).toHaveBeenCalledWith(
        mockIntegration.internalId,
        'tweet123'
      );
    });

    it('should return already_reposted if already retweeted', async () => {
      const mockClient = {
        v2: {
          retweet: jest.fn().mockRejectedValue({
            data: { detail: 'You have already retweeted this Tweet.' },
          }),
        },
      };
      (TwitterApi as jest.MockedClass<typeof TwitterApi>).mockImplementation(
        () => mockClient as any
      );

      const result = await provider.postRules!.repost(
        mockIntegration,
        mockAccessToken,
        'tweet123'
      );

      expect(result).toEqual({ status: 'already_reposted' });
    });
  });

  describe('addPlugReply', () => {
    it('should successfully add a reply', async () => {
      const mockClient = {
        v2: {
          tweet: jest.fn().mockResolvedValue({
            data: { id: 'reply123', text: 'Test reply' },
          }),
        },
      };
      (TwitterApi as jest.MockedClass<typeof TwitterApi>).mockImplementation(
        () => mockClient as any
      );

      const result = await provider.postRules!.addPlugReply(
        mockIntegration,
        mockAccessToken,
        'tweet123',
        '<p>Test reply content</p>'
      );

      expect(result).toEqual({
        status: 'added',
        remoteReleaseId: 'reply123',
      });
      expect(mockClient.v2.tweet).toHaveBeenCalledWith({
        text: expect.any(String),
        reply: { in_reply_to_tweet_id: 'tweet123' },
      });
    });

    it('should return auth_error for unauthorized reply', async () => {
      const mockClient = {
        v2: {
          tweet: jest.fn().mockRejectedValue({ code: 403 }),
        },
      };
      (TwitterApi as jest.MockedClass<typeof TwitterApi>).mockImplementation(
        () => mockClient as any
      );

      const result = await provider.postRules!.addPlugReply(
        mockIntegration,
        mockAccessToken,
        'tweet123',
        'Test content'
      );

      expect(result).toEqual({ status: 'auth_error' });
    });
  });

  describe('legacy compatibility', () => {
    it('should maintain autoRepostPost method with same behavior', async () => {
      const mockClient = {
        v2: {
          singleTweet: jest.fn().mockResolvedValue({
            data: {
              public_metrics: {
                like_count: 100,
                reply_count: 5,
              },
            },
          }),
          retweet: jest.fn().mockResolvedValue({ data: { retweeted: true } }),
        },
      };
      (TwitterApi as jest.MockedClass<typeof TwitterApi>).mockImplementation(
        () => mockClient as any
      );

      const result = await provider.autoRepostPost(
        mockIntegration,
        'tweet123',
        { likesAmount: '50' }
      );

      expect(result).toBe(true);
      expect(mockClient.v2.retweet).toHaveBeenCalled();
    });

    it('should maintain autoPlugPost method with same behavior', async () => {
      const mockClient = {
        v2: {
          singleTweet: jest.fn().mockResolvedValue({
            data: {
              public_metrics: {
                like_count: 100,
                reply_count: 5,
              },
            },
          }),
          tweet: jest
            .fn()
            .mockResolvedValue({ data: { id: 'reply123', text: 'Plug' } }),
        },
      };
      (TwitterApi as jest.MockedClass<typeof TwitterApi>).mockImplementation(
        () => mockClient as any
      );

      const result = await provider.autoPlugPost(mockIntegration, 'tweet123', {
        likesAmount: '50',
        post: '<p>Check this out!</p>',
      });

      expect(result).toBe(true);
      expect(mockClient.v2.tweet).toHaveBeenCalled();
    });
  });
});
