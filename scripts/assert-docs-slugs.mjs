import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalPageSlugs,
  docsNav,
  groupOverviewSlugs,
  syncedPages,
} from './docs-nav.config.mjs';
import { getHeadings, toAnchor } from './docs-slugger.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, '..');
const docsDir = path.join(repoDir, 'docs');

const INTERNAL_LINK_PATTERN = /\]\((\/[^)#?]+)(#[^)#?]+)?\)/g;
const SAME_PAGE_LINK_PATTERN = /\]\(#([^)\s]+)\)/g;

/**
 * Verifies heading slug parity for a markdown document.
 *
 * @param {string} label Document label for error output.
 * @param {{ level: number; title: string; anchor: string }[]} headings Heading metadata.
 */
const verifyHeadingSlugs = (label, headings) => {
  const mismatches = [];

  for (const heading of headings) {
    const baseAnchor = toAnchor(heading.title);

    if (heading.anchor !== baseAnchor && !heading.anchor.startsWith(`${baseAnchor}-`)) {
      mismatches.push({
        title: heading.title,
        anchor: heading.anchor,
        baseAnchor,
      });
    }
  }

  if (mismatches.length > 0) {
    console.error(`Unexpected heading anchor mismatches in ${label}:`);
    console.error(mismatches);
    process.exit(1);
  }
};

/**
 * Returns whether a path exists on disk.
 *
 * @param {string} filePath Absolute file path.
 * @returns {Promise<boolean>}
 */
const pathExists = async (filePath) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Loads canonical markdown pages referenced by the nav manifest.
 *
 * @returns {Promise<Map<string, { label: string; markdown: string; headings: ReturnType<typeof getHeadings> }>>}
 */
const loadCanonicalPages = async () => {
  /** @type {Map<string, { label: string; markdown: string; headings: ReturnType<typeof getHeadings> }>} */
  const pages = new Map();

  const indexPath = path.join(docsDir, 'index.md');
  const indexMarkdown = await readFile(indexPath, 'utf8');
  pages.set('/', {
    label: 'docs/index.md',
    markdown: indexMarkdown,
    headings: getHeadings(indexMarkdown),
  });

  for (const slug of canonicalPageSlugs) {
    const pagePath = path.join(docsDir, `${slug}.md`);
    const markdown = await readFile(pagePath, 'utf8');
    pages.set(`/${slug}`, {
      label: `docs/${slug}.md`,
      markdown,
      headings: getHeadings(markdown),
    });
  }

  for (const slug of groupOverviewSlugs) {
    const pagePath = path.join(docsDir, slug, 'index.md');
    const markdown = await readFile(pagePath, 'utf8');
    pages.set(`/${slug}/`, {
      label: `docs/${slug}/index.md`,
      markdown,
      headings: getHeadings(markdown),
    });
    pages.set(`/${slug}`, pages.get(`/${slug}/`));
  }

  for (const entry of docsNav) {
    if (entry.kind !== 'group') {
      continue;
    }

    for (const page of entry.pages) {
      const pagePath = path.join(docsDir, entry.slug, `${page.name}.md`);
      const markdown = await readFile(pagePath, 'utf8');
      pages.set(`/${entry.slug}/${page.name}`, {
        label: `docs/${entry.slug}/${page.name}.md`,
        markdown,
        headings: getHeadings(markdown),
      });
    }
  }

  return pages;
};

/**
 * Builds the set of routable docs paths and their heading anchors.
 *
 * @param {Map<string, { label: string; markdown: string; headings: ReturnType<typeof getHeadings> }>} canonicalPages Canonical page metadata.
 * @returns {Promise<Map<string, Set<string>>>}
 */
const buildRouteAnchorMap = async (canonicalPages) => {
  /** @type {Map<string, Set<string>>} */
  const routeAnchors = new Map();

  for (const [route, page] of canonicalPages.entries()) {
    routeAnchors.set(route, new Set(page.headings.map((heading) => heading.anchor)));
  }

  for (const entry of docsNav) {
    if (entry.kind !== 'group') {
      continue;
    }

    for (const page of entry.pages) {
      const pagePath = path.join(docsDir, entry.slug, `${page.name}.md`);

      if (await pathExists(pagePath)) {
        const markdown = await readFile(pagePath, 'utf8');
        routeAnchors.set(
          `/${entry.slug}/${page.name}`,
          new Set(getHeadings(markdown).map((heading) => heading.anchor)),
        );
      }
    }
  }

  for (const page of syncedPages) {
    const targetDir = page.targetDir ?? 'docs';
    const route =
      targetDir === 'docs'
        ? `/${page.name}`
        : `/${targetDir.replace(/^docs\//, '')}/${page.name}`;

    if (await pathExists(path.join(repoDir, targetDir, `${page.name}.md`))) {
      const markdown = await readFile(
        path.join(repoDir, targetDir, `${page.name}.md`),
        'utf8',
      );
      routeAnchors.set(route, new Set(getHeadings(markdown).map((heading) => heading.anchor)));
    }
  }

  return routeAnchors;
};

/**
 * Resolves a route path against known docs routes.
 *
 * @param {string} route Route path from a markdown link.
 * @param {Map<string, Set<string>>} routeAnchors Known route anchors.
 * @returns {string | undefined}
 */
const resolveRoute = (route, routeAnchors) => {
  if (routeAnchors.has(route)) {
    return route;
  }

  const withSlash = route.endsWith('/') ? route : `${route}/`;

  if (routeAnchors.has(withSlash)) {
    return withSlash;
  }

  const withoutSlash = route.endsWith('/') ? route.slice(0, -1) : route;

  if (routeAnchors.has(withoutSlash)) {
    return withoutSlash;
  }

  return undefined;
};

/**
 * Verifies manifest entries map to canonical files and no orphan pages remain.
 *
 * @returns {Promise<void>}
 */
const verifyManifestParity = async () => {
  const errors = [];

  if (!(await pathExists(path.join(docsDir, 'index.md')))) {
    errors.push('Missing canonical docs/index.md');
  }

  for (const slug of canonicalPageSlugs) {
    if (!(await pathExists(path.join(docsDir, `${slug}.md`)))) {
      errors.push(`Missing canonical docs/${slug}.md for manifest entry`);
    }
  }

  for (const slug of groupOverviewSlugs) {
    if (!(await pathExists(path.join(docsDir, slug, 'index.md')))) {
      errors.push(`Missing canonical docs/${slug}/index.md for manifest group`);
    }
  }

  for (const entry of docsNav) {
    if (entry.kind !== 'group') {
      continue;
    }

    for (const page of entry.pages) {
      const pagePath = path.join(docsDir, entry.slug, `${page.name}.md`);

      if (!(await pathExists(pagePath))) {
        errors.push(`Missing docs/${entry.slug}/${page.name}.md for manifest group`);
      }
    }
  }

  const manifestSlugs = new Set(['index', ...canonicalPageSlugs]);
  const rootEntries = await readdir(docsDir, { withFileTypes: true });

  for (const entry of rootEntries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      continue;
    }

    const slug = entry.name.replace(/\.md$/, '');

    if (!manifestSlugs.has(slug)) {
      errors.push(`Orphan canonical docs page not listed in manifest: docs/${entry.name}`);
    }
  }

  const manifestGroupSlugs = new Set(
    docsNav.filter((entry) => entry.kind === 'group').map((entry) => entry.slug),
  );

  for (const entry of rootEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (manifestGroupSlugs.has(entry.name)) {
      continue;
    }

    if (['.vitepress', 'images'].includes(entry.name)) {
      continue;
    }

    errors.push(`Unexpected docs subdirectory: docs/${entry.name}`);
  }

  if (errors.length > 0) {
    console.error('Docs manifest parity errors:');
    console.error(errors);
    process.exit(1);
  }
};

/**
 * Verifies internal VitePress links in canonical markdown pages.
 *
 * @param {Map<string, { label: string; markdown: string; headings: ReturnType<typeof getHeadings> }>} canonicalPages Canonical page metadata.
 * @param {Map<string, Set<string>>} routeAnchors Known route anchors.
 */
const verifyInternalLinks = (canonicalPages, routeAnchors) => {
  const errors = [];

  for (const page of canonicalPages.values()) {
    for (const match of page.markdown.matchAll(INTERNAL_LINK_PATTERN)) {
      const route = match[1];

      if (route.startsWith('/images/')) {
        continue;
      }

      const anchor = match[2]?.slice(1);
      const resolvedRoute = resolveRoute(route, routeAnchors);

      if (!resolvedRoute) {
        errors.push(`${page.label}: unresolved internal link ${match[0]}`);
        continue;
      }

      if (anchor && !routeAnchors.get(resolvedRoute)?.has(anchor)) {
        errors.push(`${page.label}: unresolved anchor in ${match[0]}`);
      }
    }

    for (const match of page.markdown.matchAll(SAME_PAGE_LINK_PATTERN)) {
      const anchor = match[1];

      if (!page.headings.some((heading) => heading.anchor === anchor)) {
        errors.push(`${page.label}: unresolved same-page anchor ${match[0]}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('Unresolved docs internal links:');
    console.error(errors);
    process.exit(1);
  }
};

/**
 * Verifies GitHub alert syntax in markdown documents.
 *
 * @param {string} label Document label for error output.
 * @param {string} markdown Markdown contents.
 */
const verifyGfmAlerts = (label, markdown) => {
  const malformedGfmAlerts = [
    ...markdown.matchAll(/^(?!\s*>)\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/gim),
  ];

  if (malformedGfmAlerts.length > 0) {
    console.error(
      `Malformed GitHub alerts in ${label}: the marker line must be a blockquote (\`> [!TIP]\`), not a bare \`[!TIP]\` line.`,
    );
    console.error(malformedGfmAlerts.map((match) => match[0]));
    process.exit(1);
  }
};

await verifyManifestParity();

const canonicalPages = await loadCanonicalPages();
const routeAnchors = await buildRouteAnchorMap(canonicalPages);

for (const page of canonicalPages.values()) {
  verifyHeadingSlugs(page.label, page.headings);
  verifyGfmAlerts(page.label, page.markdown);
}

verifyInternalLinks(canonicalPages, routeAnchors);

console.log(
  `Verified ${docsNav.length} manifest entries, ${canonicalPages.size} canonical docs routes, and ${routeAnchors.size} routable paths.`,
);
