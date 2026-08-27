import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rewriteMarkdownLinks } from './docs-link-rewriter.mjs';
import { docsNav, syncedPages } from './docs-nav.config.mjs';
import { getHeadings, normalizeHeadingText } from './docs-slugger.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, '..');
const docsDir = path.join(repoDir, 'docs');
const sidebarGeneratedPath = path.join(
  repoDir,
  'docs/.vitepress/sidebar.generated.ts'
);
const featureScreenshotsSourceDir = path.join(repoDir, 'images/features');
const featureScreenshotsTargetDir = path.join(
  repoDir,
  'docs/.vitepress/static/images/features'
);

/**
 * Builds a VitePress page link for a section slug and optional anchor.
 *
 * @param {string} pathPrefix URL path prefix without leading or trailing slashes.
 * @param {string} sectionSlug Section page slug.
 * @param {string} [anchor] Optional in-page anchor.
 * @returns {string} VitePress link path.
 */
const buildPageLink = (pathPrefix, sectionSlug, anchor) => {
  const base = pathPrefix ? `/${pathPrefix}/${sectionSlug}` : `/${sectionSlug}`;

  return anchor ? `${base}#${anchor}` : base;
};

/**
 * Builds the display label used in the generated sidebar for a heading.
 *
 * @param {string} title Markdown heading text.
 * @returns {string} Sidebar label.
 */
const toSidebarText = (title) => normalizeHeadingText(title);

/**
 * Builds nested sidebar sub-items for a single canonical docs page.
 *
 * @param {string} slug Page slug.
 * @param {{ level: number; title: string; anchor: string }[]} headings Heading metadata.
 * @param {number} [maxSectionDepth] Maximum heading depth to include.
 * @returns {object[]} VitePress sidebar child items.
 */
const buildPageSidebarItems = (slug, headings, maxSectionDepth = 4) => {
  const items = [];
  /** @type {{ node: object; level: number } | undefined} */
  let currentSection;
  /** @type {{ node: object; level: number } | undefined} */
  let currentSubSection;

  for (const heading of headings.filter(
    (item) => item.level >= 2 && item.level <= maxSectionDepth
  )) {
    if (heading.level === 2) {
      const node = {
        text: toSidebarText(heading.title),
        link: buildPageLink('', slug, heading.anchor),
      };

      items.push(node);
      currentSection = { node, level: 2 };
      currentSubSection = undefined;
      continue;
    }

    if (
      heading.level === 3 &&
      currentSection?.level === 2 &&
      maxSectionDepth >= 3
    ) {
      const child = {
        text: toSidebarText(heading.title),
        link: buildPageLink('', slug, heading.anchor),
      };

      if (!currentSection.node.items) {
        currentSection.node.items = [];
      }

      currentSection.node.items.push(child);
      currentSubSection = { node: child, level: 3 };
      continue;
    }

    if (
      heading.level === 4 &&
      currentSection?.level === 2 &&
      currentSubSection?.level === 3 &&
      maxSectionDepth >= 4
    ) {
      const child = {
        text: toSidebarText(heading.title),
        link: buildPageLink('', slug, heading.anchor),
      };

      if (!currentSubSection.node.items) {
        currentSubSection.node.items = [];
      }

      currentSubSection.node.items.push(child);
    }
  }

  return items;
};

/**
 * Marks every sidebar node that has child items as collapsible.
 *
 * @param {object[]} items VitePress sidebar items.
 * @returns {object[]} The same items with `collapsed` set on every group.
 */
const markGroupsCollapsible = (items) => {
  for (const item of items) {
    if (Array.isArray(item.items) && item.items.length > 0) {
      if (typeof item.collapsed !== 'boolean') {
        item.collapsed = false;
      }

      markGroupsCollapsible(item.items);
    }
  }

  return items;
};

/**
 * Builds the VitePress sidebar structure from the nav manifest.
 *
 * @param {typeof docsNav} nav Ordered nav manifest entries.
 * @returns {Promise<object[]>} VitePress sidebar items.
 */
const buildVitePressSidebar = async (nav) => {
  const mainItems = [];
  const bottomItems = [];

  for (const entry of nav) {
    const target =
      'pinnedBottom' in entry && entry.pinnedBottom ? bottomItems : mainItems;

    if (entry.kind === 'overview') {
      target.push({ text: entry.title, link: '/' });
      continue;
    }

    if (entry.kind === 'group') {
      const group = {
        text: entry.title,
        collapsed: false,
        items: entry.pages.map((page) => ({
          text: page.title,
          link: `/${entry.slug}/${page.name}`,
        })),
      };

      if (entry.hasOverview !== false) {
        group.link = `/${entry.slug}/`;
      }

      target.push(group);
      continue;
    }

    const pagePath = path.join(docsDir, `${entry.slug}.md`);
    const markdown = await readFile(pagePath, 'utf8');
    const headings = getHeadings(markdown);
    const subItems = buildPageSidebarItems(
      entry.slug,
      headings,
      entry.maxDepth ?? 3
    );
    const node = {
      text: entry.title,
      link: `/${entry.slug}`,
    };

    if (subItems.length > 0) {
      node.items = subItems;
    }

    target.push(node);
  }

  return markGroupsCollapsible([...mainItems, ...bottomItems]);
};

/**
 * Serializes the generated VitePress sidebar module.
 *
 * @param {object[]} sidebar VitePress sidebar items.
 * @returns {string} TypeScript module source.
 */
const buildVitePressSidebarFile = (sidebar) =>
  [
    '// Generated by scripts/build-docs-nav.mjs. Do not edit manually.',
    '',
    "import type { DefaultTheme } from 'vitepress'",
    '',
    'export const sidebar: DefaultTheme.SidebarItem[] = ',
    `${JSON.stringify(sidebar, null, 2)}`,
    '',
  ].join('\n');

/**
 * Ensures a directory exists before writing files into it.
 *
 * @param {string} dirPath Directory path.
 * @returns {Promise<void>}
 */
const ensureDir = async (dirPath) => {
  await mkdir(dirPath, { recursive: true });
};

/**
 * Copies and rewrites a markdown source file into the VitePress docs tree.
 *
 * @param {string} sourcePath Source markdown path relative to repo root.
 * @param {string} targetPath Target markdown path relative to repo root.
 * @returns {Promise<void>}
 */
const syncMarkdownPage = async (sourcePath, targetPath) => {
  const { readFile: read } = await import('node:fs/promises');
  const absoluteSource = path.join(repoDir, sourcePath);
  const absoluteTarget = path.join(repoDir, targetPath);
  const markdown = await read(absoluteSource, 'utf8');
  const sourceDir = path.posix.dirname(sourcePath.replace(/\\/g, '/'));

  await ensureDir(path.dirname(absoluteTarget));
  await writeFile(
    absoluteTarget,
    rewriteMarkdownLinks(markdown, { sourceDir })
  );
};

const sidebar = await buildVitePressSidebar(docsNav);

await ensureDir(path.join(repoDir, 'docs/.vitepress'));
await writeFile(sidebarGeneratedPath, buildVitePressSidebarFile(sidebar));

await ensureDir(featureScreenshotsTargetDir);
await cp(featureScreenshotsSourceDir, featureScreenshotsTargetDir, {
  recursive: true,
  force: true,
});

let syncedCount = 0;
const syncedTargetDirs = new Set(
  syncedPages
    .map((page) => page.targetDir)
    .filter((targetDir) => targetDir && targetDir !== 'docs')
);

for (const targetDir of syncedTargetDirs) {
  await rm(path.join(repoDir, targetDir), { recursive: true, force: true });
}

for (const page of syncedPages) {
  const targetDir = page.targetDir ?? 'docs';
  await syncMarkdownPage(page.source, `${targetDir}/${page.name}.md`);
  syncedCount += 1;
}

console.log(
  `Updated ${path.relative(repoDir, sidebarGeneratedPath)}` +
    `, synced feature screenshots` +
    (syncedCount > 0 ? `, and synced ${syncedCount} markdown page(s)` : '')
);
