import { ThreadsProvider } from './threads.provider';
import { Integration } from '@prisma/client';

describe('ThreadsProvider PostRules Capability', () => {
  let provider: ThreadsProvider;
  let mockIntegration: Integration;
  const mockAccessToken = 'mock_access_token';

  beforeEach(() => {
    provider = new ThreadsProvider();
    mockIntegration = {
      id: 'test-integration-id',
      internalId: '123456789',
      token: mockAccessToken,
      profile: 'testuser',
    } as Integration;

    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe('metadata', () => {
    it('should return correct capability metadata', () => {
      const metadata = provider.postRules.metadata();
      expect(metadata).toEqual({
        actions: {
          remove: true,
          autoPlug: true,
          notify: true,
        },
        metrics: {
          likes: true,
          replies: true,
        },
      });
    });
  });

  describe('loadMetrics', () => {
    it('should successfully load likes and replies count', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          data: [
            {
              name: 'likes',
              values: [{ value: 75 }],
            },
            {
              name: 'replies',
              values: [{ value: 12 }],
            },
          ],
        }),
      });

      const result = await provider.postRules.loadMetrics(
        mockIntegration,
        mockAccessToken,
        'thread123'
      );

      expect(result).toEqual({
        status: 'success',
        metrics: {
          likes: 75,
          replies: 12,
        },
      });
    });

    it('should omit replies when not present', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          data: [
            {
              name: 'likes',
              values: [{ value: 75 }],
            },
          ],
        }),
      });

      const result = await provider.postRules.loadMetrics(
        mockIntegration,
        mockAccessToken,
        'thread123'
      );

      expect(result).toEqual({
        status: 'success',
        metrics: {
          likes: 75,
        },
      });
    });

    it('should return not_found for missing post', async () => {
      (global.fetch as jest.Mock).mockRejectedValue({ status: 404 });

      const result = await provider.postRules.loadMetrics(
        mockIntegration,
        mockAccessToken,
        'missing123'
      );

      expect(result).toEqual({ status: 'not_found' });
    });

    it('should return auth_error for unauthorized request', async () => {
      (global.fetch as jest.Mock).mockRejectedValue({ status: 401 });

      const result = await provider.postRules.loadMetrics(
        mockIntegration,
        mockAccessToken,
        'thread123'
      );

      expect(result).toEqual({ status: 'auth_error' });
    });
  });

  describe('removePost', () => {
    it('should successfully delete a post', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({}),
      });
      provider['fetch'] = mockFetch;

      const result = await provider.postRules.removePost(
        mockIntegration,
        mockAccessToken,
        'thread123'
      );

      expect(result).toEqual({ status: 'removed' });
    });

    it('should return already_absent for missing post', async () => {
      const mockFetch = jest.fn().mockRejectedValue({ status: 404 });
      provider['fetch'] = mockFetch;

      const result = await provider.postRules.removePost(
        mockIntegration,
        mockAccessToken,
        'missing123'
      );

      expect(result).toEqual({ status: 'already_absent' });
    });
  });

  describe('repost', () => {
    it('should return unsupported', async () => {
      const result = await provider.postRules.repost(
        mockIntegration,
        mockAccessToken,
        'thread123'
      );

      expect(result).toEqual({ status: 'unsupported' });
    });
  });

  describe('addPlugReply', () => {
    it('should successfully add a reply', async () => {
      const mockFetch = jest
        .fn()
        .mockResolvedValueOnce({
          json: jest.fn().mockResolvedValue({ id: 'reply_container_123' }),
        })
        .mockResolvedValueOnce({
          json: jest.fn().mockResolvedValue({ id: 'reply123' }),
        });
      provider['fetch'] = mockFetch;

      const result = await provider.postRules.addPlugReply(
        mockIntegration,
        mockAccessToken,
        'thread123',
        'Great post! Check out my content.'
      );

      expect(result).toEqual({
        status: 'added',
        remoteReleaseId: 'reply_container_123',
      });
    });

    it('should return auth_error for unauthorized reply', async () => {
      const mockFetch = jest.fn().mockRejectedValue({ status: 401 });
      provider['fetch'] = mockFetch;

      const result = await provider.postRules.addPlugReply(
        mockIntegration,
        mockAccessToken,
        'thread123',
        'Test content'
      );

      expect(result).toEqual({ status: 'auth_error' });
    });
  });

  describe('legacy compatibility', () => {
    it('should maintain autoPlugPost method with same behavior', async () => {
      const mockFetch = jest
        .fn()
        .mockResolvedValueOnce({
          json: jest.fn().mockResolvedValue({
            data: [
              {
                name: 'likes',
                values: [{ value: 100 }],
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          json: jest.fn().mockResolvedValue({ id: 'reply_container_123' }),
        })
        .mockResolvedValueOnce({
          json: jest.fn().mockResolvedValue({ id: 'reply123' }),
        });
      (global.fetch as jest.Mock) = mockFetch;
      provider['fetch'] = mockFetch;

      const result = await provider.autoPlugPost(mockIntegration, 'thread123', {
        likesAmount: '50',
        post: 'Check this out!',
      });

      expect(result).toBe(true);
    });
  });
});
