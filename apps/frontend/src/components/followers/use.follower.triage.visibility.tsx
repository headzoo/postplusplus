'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FollowerSegmentSlug } from '@gitroom/frontend/components/followers/follower.segments';
import {
  readHiddenTriageSlugs,
  writeHiddenTriageSlugs,
} from '@gitroom/frontend/components/followers/follower.triage.visibility';

export const useFollowerTriageVisibility = (integrationId?: string) => {
  const [hiddenSlugs, setHiddenSlugs] = useState<Set<FollowerSegmentSlug>>(
    () => new Set(readHiddenTriageSlugs(integrationId))
  );

  useEffect(() => {
    setHiddenSlugs(new Set(readHiddenTriageSlugs(integrationId)));
  }, [integrationId]);

  const isVisible = useCallback(
    (slug: FollowerSegmentSlug) => !hiddenSlugs.has(slug),
    [hiddenSlugs]
  );

  const toggleVisibility = useCallback(
    (slug: FollowerSegmentSlug) => {
      if (!integrationId || slug === 'all') {
        return;
      }
      setHiddenSlugs((previous) => {
        const next = new Set(previous);
        if (next.has(slug)) {
          next.delete(slug);
        } else {
          next.add(slug);
        }
        writeHiddenTriageSlugs(integrationId, [...next]);
        return next;
      });
    },
    [integrationId]
  );

  return useMemo(
    () => ({
      hiddenSlugs,
      isVisible,
      toggleVisibility,
    }),
    [hiddenSlugs, isVisible, toggleVisibility]
  );
};
