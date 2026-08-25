/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import {
  applyListMembershipToFollowerPage,
  applyImportedMemberToFollowerPage,
  applyIgnoreToFollowerPage,
  applyMyGradeToFollowerDetail,
  applyMyGradeToFollowerPage,
  applyRelationshipSnapshotToFollowerPage,
  applyTriageIgnoreToFollowerPage,
  buildFollowerDetailHref,
  buildFollowerDetailUrl,
  buildFollowersUrl,
  followerListsKey,
  getProfileLinkAutoSnoozeTriages,
  isFollowerChannelCacheKey,
  isFollowerListCacheKey,
  revalidateFollowerChannelCaches,
} from './use.followers';

describe('getProfileLinkAutoSnoozeTriages', () => {
  it('returns Hot and Cultivate when present', () => {
    expect(
      getProfileLinkAutoSnoozeTriages({
        relationshipTriage: 'hot_lead',
        isCultivate: true,
      })
    ).toEqual(['hot_lead', 'cultivate']);
  });

  it('ignores Lead Mutual Costly and Quiet', () => {
    expect(
      getProfileLinkAutoSnoozeTriages({
        relationshipTriage: 'mutual',
        isCultivate: false,
      })
    ).toEqual([]);
    expect(
      getProfileLinkAutoSnoozeTriages({
        relationshipTriage: 'over_invested',
      })
    ).toEqual([]);
    expect(
      getProfileLinkAutoSnoozeTriages({
        relationshipTriage: 'quiet',
      })
    ).toEqual([]);
  });

  it('returns Hot when isHot is set', () => {
    expect(
      getProfileLinkAutoSnoozeTriages({
        isHot: true,
      })
    ).toEqual(['hot_lead']);
  });

  it('returns only the matching auto-snooze triages', () => {
    expect(
      getProfileLinkAutoSnoozeTriages({
        relationshipTriage: 'hot_lead',
      })
    ).toEqual(['hot_lead']);
    expect(
      getProfileLinkAutoSnoozeTriages({
        isCultivate: true,
      })
    ).toEqual(['cultivate']);
  });
});

describe('buildFollowersUrl', () => {
  const baseParams = {
    integrationId: 'channel-1',
    limit: 24,
  };

  it('serializes triage filters into the follower endpoint URL', () => {
    expect(
      buildFollowersUrl({
        ...baseParams,
        triage: 'engaged_not_yet',
      })
    ).toBe('/followers/channel-1?limit=24&triage=engaged_not_yet');

    expect(
      buildFollowersUrl({
        ...baseParams,
        triage: 'hot_lead',
      })
    ).toBe('/followers/channel-1?limit=24&triage=hot_lead');

    expect(
      buildFollowersUrl({
        ...baseParams,
        triage: 'mutual',
      })
    ).toBe('/followers/channel-1?limit=24&triage=mutual');

    expect(
      buildFollowersUrl({
        ...baseParams,
        triage: 'over_invested',
      })
    ).toBe('/followers/channel-1?limit=24&triage=over_invested');

    expect(
      buildFollowersUrl({
        ...baseParams,
        triage: 'quiet',
      })
    ).toBe('/followers/channel-1?limit=24&triage=quiet');
  });

  it('serializes custom list filters into the follower endpoint URL', () => {
    expect(
      buildFollowersUrl({
        ...baseParams,
        listId: 'list-1',
      })
    ).toBe('/followers/channel-1?limit=24&listId=list-1');
  });

  it('serializes the likely-bot filter into the follower endpoint URL', () => {
    expect(
      buildFollowersUrl({
        ...baseParams,
        isBot: true,
      })
    ).toBe('/followers/channel-1?limit=24&isBot=true');
  });

  it('omits triage when the filter is cleared', () => {
    expect(buildFollowersUrl(baseParams)).toBe('/followers/channel-1?limit=24');
  });

  it('serializes the hot audience into the follower endpoint URL', () => {
    expect(
      buildFollowersUrl({
        ...baseParams,
        audience: 'hot',
      })
    ).toBe('/followers/channel-1?limit=24&audience=hot');
  });

  it('serializes the lead audience into the follower endpoint URL', () => {
    expect(
      buildFollowersUrl({
        ...baseParams,
        audience: 'lead',
      })
    ).toBe('/followers/channel-1?limit=24&audience=lead');
  });

  it('preserves search, sort, direction, and window alongside triage', () => {
    expect(
      buildFollowersUrl({
        ...baseParams,
        sort: 'their_effort',
        direction: 'desc',
        window: 'month',
        search: 'alex',
        triage: 'hot_lead',
        cursor: 'cursor-2',
      })
    ).toBe(
      '/followers/channel-1?limit=24&cursor=cursor-2&sort=their_effort&direction=desc&window=month&search=alex&triage=hot_lead'
    );
  });
});

describe('follower detail URLs', () => {
  it('builds a shareable page href from a username', () => {
    expect(buildFollowerDetailHref('channel-1', '@SummerYule')).toBe(
      '/followers/channel-1/@SummerYule'
    );
  });

  it('prefers externalId over username for the member API', () => {
    expect(
      buildFollowerDetailUrl('channel-1', {
        externalId: 'follower-1',
        username: 'SummerYule',
      })
    ).toBe('/followers/channel-1/member?externalId=follower-1');
    expect(
      buildFollowerDetailUrl('channel-1', { username: 'SummerYule' })
    ).toBe('/followers/channel-1/member?username=SummerYule');
  });
});

describe('follower list cache updates', () => {
  it('matches list keys for the same channel and ignores member detail keys', () => {
    expect(
      isFollowerListCacheKey('channel-1', '/followers/channel-1?limit=24')
    ).toBe(true);
    expect(
      isFollowerListCacheKey(
        'channel-1',
        '/followers/channel-1/member?externalId=follower-1'
      )
    ).toBe(false);
    expect(
      isFollowerListCacheKey('channel-1', '/followers/channel-2?limit=24')
    ).toBe(false);
  });

  it('matches channel-scoped list, member, timeline, and lists keys for refresh', () => {
    expect(
      isFollowerChannelCacheKey('channel-1', '/followers/channel-1?limit=24')
    ).toBe(true);
    expect(
      isFollowerChannelCacheKey(
        'channel-1',
        '/followers/channel-1/member?externalId=follower-1'
      )
    ).toBe(true);
    expect(
      isFollowerChannelCacheKey(
        'channel-1',
        '/followers/channel-1/member/timeline?externalId=follower-1'
      )
    ).toBe(true);
    expect(
      isFollowerChannelCacheKey('channel-1', followerListsKey('channel-1'))
    ).toBe(true);
    expect(
      isFollowerChannelCacheKey('channel-1', '/followers/channel-2?limit=24')
    ).toBe(false);
    expect(
      isFollowerChannelCacheKey('channel-1', '/followers/channels')
    ).toBe(false);
  });

  it('revalidates matching channel cache keys via mutate', async () => {
    const mutateCache = jest.fn().mockResolvedValue(undefined);

    await revalidateFollowerChannelCaches(mutateCache, 'channel-1');

    expect(mutateCache).toHaveBeenCalledWith(
      expect.any(Function),
      undefined,
      { revalidate: true }
    );
    const matcher = mutateCache.mock.calls[0][0] as (key: unknown) => boolean;
    expect(matcher('/followers/channel-1?limit=24')).toBe(true);
    expect(
      matcher('/followers/channel-1/member?externalId=follower-1')
    ).toBe(true);
    expect(matcher(followerListsKey('channel-1'))).toBe(true);
    expect(matcher('/followers/channel-2?limit=24')).toBe(false);
  });

  it('patches the matching follower card fields from a refreshed snapshot', () => {
    const page = {
      items: [
        {
          id: 'follower-1',
          name: 'Alex',
          effortStars: 2,
          reciprocationStars: 1.5,
        },
        { id: 'follower-2', name: 'Sam', effortStars: 1 },
      ],
      hasMore: false,
    };

    expect(
      applyRelationshipSnapshotToFollowerPage(page, 'follower-1', {
        snapshotAt: '2026-08-14T12:00:00.000Z',
        windowStartedAt: '2026-07-15T12:00:00.000Z',
        effortScore: 10,
        reciprocationScore: 30,
        reciprocity: 1 / 3,
        grade: 5,
        adjustedGrade: 5,
        effortStars: 2,
        reciprocationStars: 4,
        triage: 'hot_lead',
        formulaVersion: 2,
      })
    ).toEqual({
      items: [
        {
          id: 'follower-1',
          name: 'Alex',
          effortScore: 10,
          reciprocationScore: 30,
          netGap: 20,
          effortStars: 2,
          reciprocationStars: 4,
          relationshipGrade: 5,
          relationshipTriage: 'hot_lead',
          relationshipFormulaVersion: 2,
          relationshipSnapshotAt: '2026-08-14T12:00:00.000Z',
          adjustedGrade: 5,
        },
        { id: 'follower-2', name: 'Sam', effortStars: 1 },
      ],
      hasMore: false,
    });
  });

  it('patches personal grade on the matching follower card', () => {
    const page = {
      items: [
        { id: 'follower-1', name: 'Alex', myGrade: 2, adjustedGrade: 3 },
        { id: 'follower-2', name: 'Sam', myGrade: null },
      ],
      hasMore: false,
    };

    expect(
      applyMyGradeToFollowerPage(page, 'follower-1', {
        myGrade: 4.5,
        adjustedGrade: 4.5,
      })
    ).toEqual({
      items: [
        { id: 'follower-1', name: 'Alex', myGrade: 4.5, adjustedGrade: 4.5 },
        { id: 'follower-2', name: 'Sam', myGrade: null },
      ],
      hasMore: false,
    });
  });

  it('returns undefined when patching personal grade on a missing page', () => {
    expect(
      applyMyGradeToFollowerPage(undefined, 'follower-1', {
        myGrade: 4.5,
        adjustedGrade: 4.5,
      })
    ).toBeUndefined();
  });

  it('patches personal grade on follower detail', () => {
    const detail = {
      follower: { id: 'follower-1', name: 'Alex', myGrade: 2 },
      notes: [],
      interactions: [],
      myGrade: 2,
      relationship: {
        windowDays: 30 as const,
        cadenceDays: 3 as const,
        formulaVersion: 2,
        current: {
          snapshotAt: '2026-02-01T00:00:00.000Z',
          windowStartedAt: '2026-01-02T00:00:00.000Z',
          effortScore: 10,
          reciprocationScore: 5,
          reciprocity: 0.5,
          grade: 3.5,
          adjustedGrade: 3.5,
          effortStars: 2,
          reciprocationStars: 1.5,
          triage: null,
          formulaVersion: 2,
        },
        history: [],
      },
    };

    expect(
      applyMyGradeToFollowerDetail(detail, {
        myGrade: 4.5,
        adjustedGrade: 4,
      })
    ).toEqual({
      ...detail,
      myGrade: 4.5,
      follower: {
        ...detail.follower,
        myGrade: 4.5,
        adjustedGrade: 4,
      },
      relationship: {
        ...detail.relationship,
        current: {
          ...detail.relationship.current!,
          adjustedGrade: 4,
        },
      },
    });
  });

  it('returns undefined when patching personal grade on missing detail', () => {
    expect(
      applyMyGradeToFollowerDetail(undefined, {
        myGrade: 4.5,
        adjustedGrade: 4.5,
      })
    ).toBeUndefined();
  });

  it('adds and removes custom list membership on follower cards', () => {
    const page = {
      items: [
        { id: 'follower-1', name: 'Alex', listIds: ['list-1'] },
        { id: 'follower-2', name: 'Sam' },
      ],
      hasMore: false,
    };

    expect(
      applyListMembershipToFollowerPage(page, 'follower-2', 'list-1', true)
    ).toEqual({
      items: [
        { id: 'follower-1', name: 'Alex', listIds: ['list-1'] },
        { id: 'follower-2', name: 'Sam', listIds: ['list-1'] },
      ],
      hasMore: false,
    });
    expect(
      applyListMembershipToFollowerPage(page, 'follower-1', 'list-1', false)
    ).toEqual({
      items: [
        { id: 'follower-1', name: 'Alex', listIds: [] },
        { id: 'follower-2', name: 'Sam' },
      ],
      hasMore: false,
    });
  });

  it('inserts an imported profile onto the current list page', () => {
    const page = {
      items: [{ id: 'follower-1', name: 'Alex', listIds: ['list-1'] }],
      hasMore: false,
    };

    expect(
      applyImportedMemberToFollowerPage(
        page,
        {
          externalId: '42',
          name: 'Harbor',
          username: 'HarborClient',
          profileUrl: 'https://x.com/HarborClient',
        },
        'list-1'
      )
    ).toEqual({
      items: [
        {
          id: '42',
          name: 'Harbor',
          username: 'HarborClient',
          profileUrl: 'https://x.com/HarborClient',
          listIds: ['list-1'],
        },
        { id: 'follower-1', name: 'Alex', listIds: ['list-1'] },
      ],
      hasMore: false,
    });
  });

  it('clears or removes a follower after ignoring a triage badge', () => {
    const page = {
      items: [
        {
          id: 'follower-1',
          name: 'Alex',
          relationshipTriage: 'hot_lead' as const,
        },
        { id: 'follower-2', name: 'Sam', relationshipTriage: 'mutual' as const },
      ],
      hasMore: false,
    };

    expect(applyTriageIgnoreToFollowerPage(page, 'follower-1')).toEqual({
      items: [
        { id: 'follower-1', name: 'Alex', relationshipTriage: null },
        { id: 'follower-2', name: 'Sam', relationshipTriage: 'mutual' },
      ],
      hasMore: false,
    });
    expect(
      applyTriageIgnoreToFollowerPage(page, 'follower-1', {
        removeFromPage: true,
      })
    ).toEqual({
      items: [{ id: 'follower-2', name: 'Sam', relationshipTriage: 'mutual' }],
      hasMore: false,
    });
    expect(
      applyTriageIgnoreToFollowerPage(
        {
          items: [
            { id: 'lead-1', name: 'Alex', isLead: true },
            { id: 'lead-2', name: 'Sam', isLead: true },
          ],
          hasMore: false,
        },
        'lead-1',
        { triage: 'lead' }
      )
    ).toEqual({
      items: [
        { id: 'lead-1', name: 'Alex', isLead: false },
        { id: 'lead-2', name: 'Sam', isLead: true },
      ],
      hasMore: false,
    });
    expect(
      applyTriageIgnoreToFollowerPage(
        {
          items: [
            {
              id: 'follower-1',
              name: 'Alex',
              relationshipTriage: 'hot_lead' as const,
            },
            {
              id: 'follower-2',
              name: 'Sam',
              relationshipTriage: 'hot_lead' as const,
            },
          ],
          hasMore: false,
        },
        'follower-1',
        { triage: 'hot_lead' }
      )
    ).toEqual({
      items: [
        { id: 'follower-1', name: 'Alex', relationshipTriage: null, isHot: false },
        { id: 'follower-2', name: 'Sam', relationshipTriage: 'hot_lead' },
      ],
      hasMore: false,
    });
    expect(
      applyTriageIgnoreToFollowerPage(
        {
          items: [
            {
              id: 'hot-1',
              name: 'Alex',
              isHot: true,
              relationshipTriage: 'hot_lead' as const,
            },
          ],
          hasMore: false,
        },
        'hot-1',
        { triage: 'hot_lead' }
      )
    ).toEqual({
      items: [
        {
          id: 'hot-1',
          name: 'Alex',
          isHot: false,
          relationshipTriage: null,
        },
      ],
      hasMore: false,
    });
    expect(
      applyTriageIgnoreToFollowerPage(
        {
          items: [
            {
              id: 'cultivate-1',
              name: 'Alex',
              isCultivate: true,
            },
          ],
          hasMore: false,
        },
        'cultivate-1',
        { triage: 'cultivate' }
      )
    ).toEqual({
      items: [{ id: 'cultivate-1', name: 'Alex', isCultivate: false }],
      hasMore: false,
    });
  });

  it('applies ignore state and can remove ignored followers from a page', () => {
    const page = {
      items: [
        { id: 'follower-1', name: 'Alex' },
        { id: 'follower-2', name: 'Sam' },
      ],
      hasMore: false,
    };

    expect(
      applyIgnoreToFollowerPage(page, 'follower-1', { isIgnored: true })
    ).toEqual({
      items: [
        { id: 'follower-1', name: 'Alex', isIgnored: true },
        { id: 'follower-2', name: 'Sam' },
      ],
      hasMore: false,
    });
    expect(
      applyIgnoreToFollowerPage(page, 'follower-1', { removeFromPage: true })
    ).toEqual({
      items: [{ id: 'follower-2', name: 'Sam' }],
      hasMore: false,
    });
  });
});
