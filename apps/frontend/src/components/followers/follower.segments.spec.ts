import {
  FOLLOWER_BOARD_SEGMENTS,
  FOLLOWER_SUMMARY_SEGMENTS,
  FOLLOWER_TAB_SEGMENTS,
} from './follower.segments';

describe('follower.segments', () => {
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
    expect(boardSlugs.indexOf('followed')).toBeLessThan(
      boardSlugs.indexOf('mutual')
    );
  });
});
