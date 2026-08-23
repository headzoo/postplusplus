'use client';

import useSWR from 'swr';
import { HelpArticle, HelpHeading, HelpManifest } from './help.types';

const isHeading = (value: unknown): value is HelpHeading => {
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

const isArticle = (value: unknown): value is HelpArticle => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const article = value as Record<string, unknown>;
  return (
    typeof article.slug === 'string' &&
    typeof article.title === 'string' &&
    typeof article.headingText === 'string' &&
    typeof article.excerpt === 'string' &&
    typeof article.markdown === 'string' &&
    Array.isArray(article.headings) &&
    article.headings.every(isHeading)
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

  if (!manifest.pages.every(isArticle)) {
    throw new Error('Help content is invalid.');
  }

  return {
    generated: true,
    pages: manifest.pages,
  };
};

const loadHelpManifest = async (): Promise<HelpManifest> => {
  const module = await import('../../help/help-manifest.generated.json');
  return validateHelpManifest(module.default ?? module);
};

export const useHelpManifest = (open: boolean) =>
  useSWR<HelpManifest>(open ? 'help-manifest' : null, loadHelpManifest, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
