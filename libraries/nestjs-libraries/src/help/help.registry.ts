import { NotFoundException } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import type MiniSearch from 'minisearch';
import {
  createHelpSearchIndex,
  searchHelpManifest,
  type HelpSearchDocument,
} from './help.search';
import type {
  HelpArticle,
  HelpManifest,
  HelpTopicMetadata,
} from './help.types';

const CANONICAL_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

let cachedManifest: HelpManifest | null = null;
let cachedIndex: MiniSearch<HelpSearchDocument> | null = null;

export const getHelpManifestPathCandidates = (): string[] => [
  resolve(__dirname, 'help-manifest.generated.json'),
  resolve(
    __dirname,
    '../../../../../../../libraries/nestjs-libraries/src/help/help-manifest.generated.json'
  ),
  resolve(
    process.cwd(),
    'libraries/nestjs-libraries/src/help/help-manifest.generated.json'
  ),
  resolve(
    process.cwd(),
    '../../libraries/nestjs-libraries/src/help/help-manifest.generated.json'
  ),
  resolve(process.cwd(), 'src/help/help-manifest.generated.json'),
];

const resolveManifestPath = () => {
  const candidate = getHelpManifestPathCandidates().find(existsSync);

  if (candidate) {
    return candidate;
  }

  throw new Error(
    'Help manifest not found. Run `pnpm help:build` to generate it.'
  );
};

const isHelpHeading = (
  value: unknown
): value is HelpArticle['headings'][number] => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const heading = value as Record<string, unknown>;
  return (
    typeof heading.level === 'number' &&
    typeof heading.title === 'string' &&
    typeof heading.anchor === 'string'
  );
};

const isHelpArticle = (value: unknown): value is HelpArticle => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const article = value as Record<string, unknown>;
  return (
    typeof article.slug === 'string' &&
    CANONICAL_SLUG_PATTERN.test(article.slug) &&
    typeof article.title === 'string' &&
    typeof article.headingText === 'string' &&
    typeof article.excerpt === 'string' &&
    typeof article.markdown === 'string' &&
    Array.isArray(article.headings) &&
    article.headings.every(isHelpHeading)
  );
};

export const validateHelpManifest = (value: unknown): HelpManifest => {
  if (!value || typeof value !== 'object') {
    throw new Error('Help content is unavailable.');
  }

  const manifest = value as Record<string, unknown>;
  if (manifest.generated !== true || !Array.isArray(manifest.pages)) {
    throw new Error('Help content is unavailable.');
  }

  if (!manifest.pages.every(isHelpArticle)) {
    throw new Error('Help content is invalid.');
  }

  return {
    generated: true,
    pages: manifest.pages,
  };
};

export const loadHelpManifest = (): HelpManifest => {
  if (cachedManifest) {
    return cachedManifest;
  }

  const raw = JSON.parse(readFileSync(resolveManifestPath(), 'utf8'));
  cachedManifest = validateHelpManifest(raw);
  cachedIndex = createHelpSearchIndex(cachedManifest);
  return cachedManifest;
};

export const resetHelpManifestCache = () => {
  cachedManifest = null;
  cachedIndex = null;
};

const toTopicMetadata = (article: HelpArticle): HelpTopicMetadata => ({
  slug: article.slug,
  title: article.title,
  excerpt: article.excerpt,
  headings: article.headings,
});

export const listHelpTopics = (): HelpTopicMetadata[] =>
  loadHelpManifest().pages.map(toTopicMetadata);

export const searchHelpTopics = (query: string): HelpTopicMetadata[] => {
  const manifest = loadHelpManifest();
  return searchHelpManifest(manifest, query, cachedIndex ?? undefined).map(
    toTopicMetadata
  );
};

export const readHelpArticle = (
  slug: string,
  hash?: string
): HelpArticle & { hashValid: boolean; hash?: string } => {
  if (!CANONICAL_SLUG_PATTERN.test(slug)) {
    throw new NotFoundException(`Help topic not found: ${slug}`);
  }

  const article = loadHelpManifest().pages.find((page) => page.slug === slug);
  if (!article) {
    throw new NotFoundException(`Help topic not found: ${slug}`);
  }

  if (!hash) {
    return { ...article, hashValid: true };
  }

  const hashValid = article.headings.some((heading) => heading.anchor === hash);
  return { ...article, hash, hashValid };
};
