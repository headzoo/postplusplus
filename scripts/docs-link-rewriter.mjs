import path from 'node:path';
import { repoBlobUrl, repoUrl } from './docs-site.config.mjs';

/** GitHub blob line anchors (e.g. #L87 or #L10-L20), not README heading ids. */
const GITHUB_LINE_ANCHOR_PATTERN = /^L\d+(-L\d+)?$/i;

/**
 * @param {string} anchor Fragment without leading #.
 * @returns {boolean}
 */
const isGithubLineAnchor = (anchor) => GITHUB_LINE_ANCHOR_PATTERN.test(anchor);

/**
 * Normalizes a markdown link path by stripping leading ./ and ../ segments.
 *
 * @param {string} href Link path without hash or query.
 * @returns {string} Normalized path.
 */
const normalizePath = (href) =>
  href.replace(/^\.\//, '').replace(/^(?:\.\.\/)+/, '');

/**
 * Resolves a relative href against an optional source directory in the repo.
 *
 * @param {string} href Link path.
 * @param {string} sourceDir Source directory relative to repo root.
 * @returns {string} Repo-relative path using forward slashes.
 */
const resolveRepoPath = (href, sourceDir) => {
  if (!sourceDir) {
    return normalizePath(href);
  }

  return path.posix.normalize(
    path.posix.join(sourceDir.replace(/\\/g, '/'), href)
  );
};

/**
 * @param {string} pathPart Link path before # or ?.
 * @param {string} sourceDir Source directory relative to repo root.
 * @returns {boolean}
 */
const isReadmeRelativePath = (pathPart, sourceDir) => {
  const normalized = resolveRepoPath(pathPart, sourceDir);

  return (
    !normalized ||
    normalized === '.' ||
    normalized === 'README.md' ||
    normalized.endsWith('/README.md')
  );
};

/**
 * Resolves an in-doc anchor link using the optional anchor map.
 *
 * @param {string} anchor Anchor id without leading #.
 * @param {Map<string, { slug: string; isSectionRoot: boolean }>} anchorMap Anchor lookup map.
 * @returns {string} VitePress path for the anchor target.
 */
const resolveAnchorHref = (anchor, anchorMap) => {
  const entry = anchorMap.get(anchor);

  if (!entry) {
    throw new Error(`Unknown docs anchor: #${anchor}`);
  }

  if (entry.isSectionRoot) {
    return `/${entry.slug}`;
  }

  return `/${entry.slug}#${anchor}`;
};

/**
 * Rewrites a single markdown href for the VitePress docs site.
 *
 * @param {string} href Original href.
 * @param {{ sourceDir?: string; anchorMap?: Map<string, { slug: string; isSectionRoot: boolean }> }} [options] Rewrite options.
 * @returns {string} Rewritten href.
 */
export const rewriteDocsHref = (href, options = {}) => {
  const { sourceDir = '', anchorMap } = options;

  if (!href) {
    return href;
  }

  if (href.startsWith('#')) {
    const anchor = href.slice(1);

    if (anchorMap && !isGithubLineAnchor(anchor)) {
      return resolveAnchorHref(anchor, anchorMap);
    }

    return href;
  }

  if (
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('mailto:')
  ) {
    return href;
  }

  const hashIndex = href.indexOf('#');
  const queryIndex = href.indexOf('?');
  let pathPart = href;
  let suffix = '';

  if (hashIndex >= 0) {
    pathPart = href.slice(0, hashIndex);
    suffix = href.slice(hashIndex);
  } else if (queryIndex >= 0) {
    pathPart = href.slice(0, queryIndex);
    suffix = href.slice(queryIndex);
  }

  if (suffix.startsWith('#') && anchorMap) {
    const anchor = suffix.slice(1);

    if (
      !isGithubLineAnchor(anchor) &&
      isReadmeRelativePath(pathPart, sourceDir)
    ) {
      suffix = resolveAnchorHref(anchor, anchorMap);
      suffix = suffix.startsWith('/') ? suffix : `/${suffix}`;
    }
  }

  const normalized = resolveRepoPath(pathPart, sourceDir);

  if (!normalized || normalized === '.') {
    return suffix.startsWith('/') ? suffix : `/${suffix}`;
  }

  if (normalized.startsWith('docs/images/')) {
    return `/${normalized.slice('docs/'.length)}${suffix}`;
  }

  if (normalized === 'README.md' || normalized.endsWith('/README.md')) {
    return suffix.startsWith('/') ? suffix : `/${suffix}`;
  }

  if (normalized.endsWith('.md')) {
    return `${repoBlobUrl}/${normalized}${suffix}`;
  }

  const isDotfile = /(?:^|\/)\.[^/]+$/.test(normalized);

  if (
    normalized.endsWith('/') ||
    isDotfile ||
    /\.(ts|tsx|js|jsx|mjs|cjs|json|rules)$/.test(normalized)
  ) {
    const repoBaseUrl = normalized.endsWith('/') ? repoUrl : repoBlobUrl;

    return `${repoBaseUrl}/${normalized}${suffix}`;
  }

  return href;
};

/**
 * Rewrites markdown link and image targets for VitePress.
 *
 * @param {string} markdown Markdown contents.
 * @param {{ sourceDir?: string; anchorMap?: Map<string, { slug: string; isSectionRoot: boolean }> }} [options] Rewrite options.
 * @returns {string} Markdown with rewritten links.
 */
export const rewriteMarkdownLinks = (markdown, options = {}) =>
  markdown.replace(
    /(!?\[[^\]]*\]\()([^)]+)(\))/g,
    (_match, prefix, href, suffix) => {
      return `${prefix}${rewriteDocsHref(href, options)}${suffix}`;
    }
  );
