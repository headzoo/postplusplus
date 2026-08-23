import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getHeadings,
  normalizeHeadingText,
  withoutFencedCodeBlocks,
} from './docs-slugger.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, '..');
const HELP_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXCERPT_MAX_LENGTH = 240;

const toExcerpt = (markdown) => {
  const plainText = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return plainText.length <= EXCERPT_MAX_LENGTH
    ? plainText
    : `${plainText.slice(0, EXCERPT_MAX_LENGTH - 1).trimEnd()}…`;
};

const getSingleH1 = (markdown, label) => {
  const h1s = [...withoutFencedCodeBlocks(markdown).matchAll(/^#(?!#)\s+(.+)$/gm)].map((match) =>
    normalizeHeadingText(match[1]),
  );

  if (h1s.length !== 1) {
    throw new Error(`${label}: expected exactly one H1, found ${h1s.length}`);
  }

  if (!h1s[0]) {
    throw new Error(`${label}: H1 must contain text`);
  }

  return h1s[0];
};

const getMarkdownLinks = (markdown) =>
  [
    ...withoutFencedCodeBlocks(markdown).matchAll(
      /(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g,
    ),
  ].map(
    (match) => match[1],
  );

const validateLinks = (pages) => {
  const errors = [];
  const pageBySlug = new Map(pages.map((page) => [page.slug, page]));

  for (const page of pages) {
    for (const href of getMarkdownLinks(page.markdown)) {
      if (/^(?:https?:|mailto:)/i.test(href)) {
        continue;
      }

      let targetPage = page;
      let anchor;

      if (href.startsWith('#')) {
        anchor = href.slice(1);
      } else {
        const match = /^\/help\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:#([^/?#]+))?$/.exec(
          href,
        );

        if (!match) {
          errors.push(`${page.file}: unsupported help link ${href}`);
          continue;
        }

        targetPage = pageBySlug.get(match[1]);
        anchor = match[2];

        if (!targetPage) {
          errors.push(`${page.file}: unresolved help link ${href}`);
          continue;
        }
      }

      if (anchor && !targetPage.headings.some((heading) => heading.anchor === anchor)) {
        errors.push(`${page.file}: unresolved help anchor ${href}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Unresolved help internal links:\n${errors.map((error) => `- ${error}`).join('\n')}`);
  }
};

/**
 * Discovers, validates, and serializes canonical help markdown.
 *
 * @param {{ helpDir?: string }} [options]
 * @returns {Promise<{ generated: true; pages: Array<{ slug: string; title: string; headings: Array<{ level: number; title: string; anchor: string }>; headingText: string; excerpt: string; markdown: string }> }>}
 */
export const buildHelpManifest = async (options = {}) => {
  const helpDir = options.helpDir ?? path.join(repoDir, 'apps/frontend/src/help');
  const entries = await readdir(helpDir, { withFileTypes: true });
  const seenSlugs = new Set();
  const pages = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      continue;
    }

    const slug = entry.name.slice(0, -'.md'.length);
    const file = path.join(helpDir, entry.name);

    if (!HELP_SLUG_PATTERN.test(slug)) {
      throw new Error(`${file}: invalid help slug "${slug}"`);
    }

    if (seenSlugs.has(slug)) {
      throw new Error(`${file}: duplicate help slug "${slug}"`);
    }

    seenSlugs.add(slug);
    const markdown = await readFile(file, 'utf8');
    const title = getSingleH1(markdown, file);
    const headings = getHeadings(markdown).map((heading) => ({
      ...heading,
      title: normalizeHeadingText(heading.title),
    }));

    pages.push({
      slug,
      title,
      headings,
      headingText: headings.map((heading) => heading.title).join(' '),
      excerpt: toExcerpt(markdown),
      markdown,
      file,
    });
  }

  pages.sort((left, right) => left.slug.localeCompare(right.slug));
  validateLinks(pages);

  return {
    generated: true,
    pages: pages.map(({ file, ...page }) => page),
  };
};

export const writeHelpManifest = async (options = {}) => {
  const helpDir = options.helpDir ?? path.join(repoDir, 'apps/frontend/src/help');
  const outputPath =
    options.outputPath ?? path.join(helpDir, 'help-manifest.generated.json');
  const manifest = await buildHelpManifest({ helpDir });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  return manifest;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const manifest = await writeHelpManifest();
    console.log(`Built help manifest with ${manifest.pages.length} page(s).`);
  } catch (error) {
    console.error(`Help corpus build failed: ${error.message}`);
    process.exitCode = 1;
  }
}
