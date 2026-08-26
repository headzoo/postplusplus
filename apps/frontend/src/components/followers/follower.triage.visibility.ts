import { FollowerSegmentSlug } from '@gitroom/frontend/components/followers/follower.segments';

const TRIAGE_VISIBILITY_KEY_PREFIX = 'followers.triage.visibility.';

export type FollowerTriageVisibilityState = {
  hiddenSlugs: FollowerSegmentSlug[];
};

const visibilityStorageKey = (integrationId: string) =>
  `${TRIAGE_VISIBILITY_KEY_PREFIX}${integrationId}`;

const parseStoredVisibility = (
  raw: string | null
): FollowerTriageVisibilityState => {
  if (!raw) {
    return { hiddenSlugs: [] };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<FollowerTriageVisibilityState>;
    if (!Array.isArray(parsed.hiddenSlugs)) {
      return { hiddenSlugs: [] };
    }
    return {
      hiddenSlugs: parsed.hiddenSlugs.filter(
        (slug): slug is FollowerSegmentSlug => typeof slug === 'string'
      ),
    };
  } catch {
    return { hiddenSlugs: [] };
  }
};

export const readHiddenTriageSlugs = (
  integrationId?: string
): FollowerSegmentSlug[] => {
  if (typeof window === 'undefined' || !integrationId) {
    return [];
  }
  return parseStoredVisibility(
    localStorage.getItem(visibilityStorageKey(integrationId))
  ).hiddenSlugs;
};

export const writeHiddenTriageSlugs = (
  integrationId: string,
  hiddenSlugs: FollowerSegmentSlug[]
) => {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(
    visibilityStorageKey(integrationId),
    JSON.stringify({ hiddenSlugs })
  );
};
