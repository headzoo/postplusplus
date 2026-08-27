import {
  compareFollowers,
  FOLLOWER_AUDIENCES,
  FOLLOWER_CATEGORY_DESCRIPTIONS,
  FOLLOWER_DATABASE_BOT_GRADE_SORT,
  FOLLOWER_DATABASE_MY_GRADE_SORT,
  FOLLOWER_DATABASE_NET_GAP_SORT,
  FOLLOWER_DATABASE_RELATIONSHIP_GRADE_SORT,
  FOLLOWER_DATABASE_THEIR_EFFORT_SORT,
  getAudienceFollowerSortField,
  normalizeFollowerSearch,
  sortFollowers,
} from '@gitroom/nestjs-libraries/integrations/social/follower.sorts';

describe('follower.sorts', () => {
  it('includes hot in follower audiences', () => {
    expect(FOLLOWER_AUDIENCES).toContain('hot');
    expect(FOLLOWER_AUDIENCES).toContain('unfollowed');
    expect(FOLLOWER_CATEGORY_DESCRIPTIONS.hot).toContain('materialized');
    expect(FOLLOWER_CATEGORY_DESCRIPTIONS.unfollowed).toContain(
      'used to follow'
    );
  });

  const followers = [
    {
      id: 'b',
      name: 'Bravo',
      followersCount: 20,
      followingCount: 5,
      accountCreatedAt: '2024-02-01T00:00:00.000Z',
    },
    {
      id: 'a',
      name: 'Alpha',
      followersCount: 100,
      followingCount: 50,
      accountCreatedAt: '2023-01-01T00:00:00.000Z',
    },
  ];

  it('sorts followers by count descending', () => {
    expect(
      sortFollowers(followers, 'followers_count', 'desc').map((item) => item.id)
    ).toEqual(['a', 'b']);
  });

  it('sorts followers by name ascending', () => {
    expect(
      sortFollowers(followers, 'name', 'asc').map((item) => item.id)
    ).toEqual(['a', 'b']);
  });

  it('normalizes follower search by trimming and stripping a leading @', () => {
    expect(normalizeFollowerSearch('  @Alice  ')).toBe('Alice');
    expect(normalizeFollowerSearch('@@alice')).toBe('@alice');
    expect(normalizeFollowerSearch('   ')).toBeUndefined();
    expect(normalizeFollowerSearch('@')).toBeUndefined();
    expect(normalizeFollowerSearch(undefined)).toBeUndefined();
  });

  it('maps audience search sorts onto database columns', () => {
    expect(getAudienceFollowerSortField('recent')).toBe('followedAt');
    expect(getAudienceFollowerSortField('name')).toBe('name');
    expect(getAudienceFollowerSortField('followers_count')).toBe(
      'followersCount'
    );
    expect(getAudienceFollowerSortField('unknown')).toBe('followedAt');
  });

  it('places missing values last when sorting ascending', () => {
    expect(
      compareFollowers(
        { id: 'missing', name: 'Missing' },
        { id: 'present', name: 'Present', followersCount: 1 },
        'followers_count',
        'asc'
      )
    ).toBeGreaterThan(0);
  });

  it('advertises effort-first database sorts without removing grade keys', () => {
    expect(FOLLOWER_DATABASE_THEIR_EFFORT_SORT).toMatchObject({
      key: 'their_effort',
      label: 'Their effort',
      scope: 'database',
    });
    expect(FOLLOWER_DATABASE_NET_GAP_SORT).toMatchObject({
      key: 'net_gap',
      label: 'Net effort gap',
      scope: 'database',
    });
    expect(FOLLOWER_DATABASE_RELATIONSHIP_GRADE_SORT.label).toBe(
      'Priority grade'
    );
    expect(FOLLOWER_DATABASE_MY_GRADE_SORT.label).toBe('Your grade');
    expect(FOLLOWER_DATABASE_BOT_GRADE_SORT).toMatchObject({
      key: 'bot_grade',
      label: 'Bot grade',
      scope: 'database',
    });
  });
});
