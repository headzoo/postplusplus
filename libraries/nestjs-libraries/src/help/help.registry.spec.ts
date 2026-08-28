import {
  getHelpManifestPathCandidates,
  listHelpTopics,
  readHelpArticle,
  resetHelpManifestCache,
  searchHelpTopics,
  validateHelpManifest,
} from './help.registry';
import { existsSync } from 'fs';
import { resolve } from 'path';

describe('help.registry', () => {
  beforeEach(() => {
    resetHelpManifestCache();
  });

  it('lists topics without markdown bodies', () => {
    const topics = listHelpTopics();
    expect(topics.length).toBeGreaterThan(0);
    expect(topics[0]).toEqual(
      expect.objectContaining({
        slug: expect.any(String),
        title: expect.any(String),
        excerpt: expect.any(String),
        headings: expect.any(Array),
      })
    );
    expect(topics[0]).not.toHaveProperty('markdown');
  });

  it('searches topics by title and headings', () => {
    const results = searchHelpTopics('schedule');
    expect(results.some((topic) => topic.slug === 'calendar')).toBe(true);
  });

  it('finds channel connection topics for connect-channel queries', () => {
    const results = searchHelpTopics('connect channel');
    expect(
      results.some((topic) =>
        ['dashboard', 'calendar', 'settings'].includes(topic.slug)
      )
    ).toBe(true);
  });

  it('reads an article and validates optional hash', () => {
    const article = readHelpArticle('calendar');
    expect(article.slug).toBe('calendar');
    expect(article.markdown).toContain('# Calendar');
    expect(article.hashValid).toBe(true);

    const withValidHash = readHelpArticle(
      'calendar',
      article.headings[0]?.anchor
    );
    expect(withValidHash.hashValid).toBe(true);

    const withInvalidHash = readHelpArticle('calendar', 'missing-section');
    expect(withInvalidHash.hashValid).toBe(false);
  });

  it('rejects invalid manifests', () => {
    expect(() => validateHelpManifest({ generated: false, pages: [] })).toThrow(
      /unavailable/
    );
  });

  it('resolves the manifest from compiled backend dist layout', () => {
    const distHelpDir = resolve(
      __dirname,
      '../../../../apps/backend/dist/libraries/nestjs-libraries/src/help'
    );
    const manifestFromDistLayout = getHelpManifestPathCandidates().find(
      (candidate) =>
        candidate.endsWith(
          'libraries/nestjs-libraries/src/help/help-manifest.generated.json'
        ) && existsSync(candidate)
    );

    expect(existsSync(distHelpDir)).toBe(true);
    expect(manifestFromDistLayout).toBeTruthy();
    expect(
      existsSync(
        resolve(
          distHelpDir,
          '../../../../../../../libraries/nestjs-libraries/src/help/help-manifest.generated.json'
        )
      )
    ).toBe(true);
  });
});
