import {
  FOLLOWER_BOARD_SEGMENTS,
  FOLLOWER_SUMMARY_SEGMENTS,
  FOLLOWER_TAB_SEGMENTS,
  FOLLOWER_BUILTIN_TRIAGE_SEGMENTS,
  getFollowerBoardColumnAction,
  isFollowerSegmentVisible,
} from './follower.segments';

describe('follower.segments', () => {
  it('maps board columns to triage actions and unfollow', () => {
    expect(getFollowerBoardColumnAction('leads')).toEqual({
      type: 'triage',
      triage: 'lead',
    });
    expect(getFollowerBoardColumnAction('hot')).toEqual({
      type: 'triage',
      triage: 'hot_lead',
    });
    expect(getFollowerBoardColumnAction('followed')).toEqual({
      type: 'unfollow',
    });
    expect(getFollowerBoardColumnAction('unfollowed')).toEqual({
      type: 'unfollow',
    });
    expect(getFollowerBoardColumnAction('all')).toBeNull();
  });

  it('places Followed before Mutual in green triage group', () => {
    const summaryIndex = (slug: string) =>
      FOLLOWER_SUMMARY_SEGMENTS.findIndex((segment) => segment.slug === slug);

    expect(summaryIndex('followed')).toBeGreaterThan(summaryIndex('cultivate'));
    expect(summaryIndex('followed')).toBeLessThan(summaryIndex('mutual'));
    expect(
      FOLLOWER_SUMMARY_SEGMENTS.find((segment) => segment.slug === 'followed')
        ?.color
    ).toBe('green');

    const tabSlugs = FOLLOWER_TAB_SEGMENTS.map((segment) => segment.slug);
    expect(tabSlugs.indexOf('followed')).toBeLessThan(tabSlugs.indexOf('mutual'));

    const boardSlugs = FOLLOWER_BOARD_SEGMENTS.map((segment) => segment.slug);
    expect(boardSlugs).toEqual([
      'leads',
      'hot',
      'cultivate',
      'followed',
      'mutual',
      'quiet',
      'costly',
      'ignored',
      'unfollowed',
      'bots',
    ]);
    expect(boardSlugs.indexOf('followed')).toBeLessThan(
      boardSlugs.indexOf('mutual')
    );
  });

  it('excludes All from built-in triage visibility options', () => {
    expect(FOLLOWER_BUILTIN_TRIAGE_SEGMENTS.map((segment) => segment.slug)).not.toContain(
      'all'
    );
    expect(FOLLOWER_BUILTIN_TRIAGE_SEGMENTS).toHaveLength(
      FOLLOWER_SUMMARY_SEGMENTS.length - 1
    );
  });

  it('treats All as always visible', () => {
    expect(isFollowerSegmentVisible('all', ['bots'])).toBe(true);
    expect(isFollowerSegmentVisible('bots', ['bots'])).toBe(false);
    expect(isFollowerSegmentVisible('hot', new Set())).toBe(true);
  });
});
