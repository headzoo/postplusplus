/**
 * Ordered VitePress sidebar manifest for canonical docs pages.
 *
 * Edit this file to reorder pages, add/remove docs, or configure nav groups.
 * Run `pnpm docs:build:nav` to regenerate the sidebar.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, '..');
const helpManifestPath = path.join(
  repoDir,
  'apps/frontend/src/help/help-manifest.generated.json',
);
const helpManifest = JSON.parse(readFileSync(helpManifestPath, 'utf8'));

/** @typedef {{ name: string; source: string; title: string; targetDir?: string }} SyncedDocPage */

/** @type {SyncedDocPage[]} Optional synced pages copied from elsewhere in the repo. */
export const syncedPages = helpManifest.pages.map((page) => ({
  name: page.slug,
  source: `apps/frontend/src/help/${page.slug}.md`,
  title: page.title,
  targetDir: 'docs/help',
}));

/**
 * Top-level docs navigation entries in sidebar order.
 *
 * @type {Array<
 *   | { kind: 'overview'; title: string }
 *   | { kind: 'page'; slug: string; title: string; maxDepth?: number; pinnedBottom?: true }
 *   | { kind: 'group'; slug: string; title: string; pages: SyncedDocPage[]; hasOverview?: boolean }
 * >}
 */
export const docsNav = [
  { kind: 'overview', title: 'Internal Overview' },
  { kind: 'page', slug: 'features', title: 'Features', maxDepth: 3 },
  { kind: 'page', slug: 'architecture', title: 'Architecture', maxDepth: 3 },
  { kind: 'page', slug: 'backend-api', title: 'Backend API', maxDepth: 3 },
  { kind: 'page', slug: 'public-api', title: 'Public API', maxDepth: 3 },
  { kind: 'page', slug: 'workflows', title: 'Temporal Workflows', maxDepth: 3 },
  { kind: 'page', slug: 'database', title: 'Database', maxDepth: 3 },
  {
    kind: 'page',
    slug: 'frontend-api',
    title: 'Frontend API Clients',
    maxDepth: 3,
  },
  { kind: 'page', slug: 'operations', title: 'Operations', maxDepth: 3 },
  {
    kind: 'group',
    slug: 'help',
    title: 'Help',
    pages: syncedPages,
    hasOverview: false,
  },
];

/** Slugs of canonical overview pages committed under docs/<slug>/index.md. */
export const groupOverviewSlugs = new Set(
  docsNav
    .filter((entry) => entry.kind === 'group' && entry.hasOverview !== false)
    .map((entry) => entry.slug)
);

/** Slugs of canonical guide pages committed as docs/<slug>.md. */
export const canonicalPageSlugs = new Set(
  docsNav.filter((entry) => entry.kind === 'page').map((entry) => entry.slug)
);
