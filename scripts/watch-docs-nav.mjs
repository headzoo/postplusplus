import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, '..');
const debounceMs = 200;

/** Directories watched recursively for docs source changes. */
const watchDirs = [path.join(repoDir, 'docs')];

/** Individual files that trigger rebuilds when changed. */
const watchFiles = [
  path.join(repoDir, 'scripts/build-docs-nav.mjs'),
  path.join(repoDir, 'scripts/docs-nav.config.mjs'),
  path.join(repoDir, 'scripts/docs-slugger.mjs'),
  path.join(repoDir, 'scripts/docs-link-rewriter.mjs'),
  path.join(repoDir, 'scripts/docs-site.config.mjs'),
  path.join(repoDir, 'scripts/assert-docs-slugs.mjs'),
];

let debounceTimer = null;
let buildChain = Promise.resolve();
let watchers = [];
let isBuilding = false;

/**
 * Runs the docs nav generator and slug assertion scripts.
 *
 * @returns {Promise<void>}
 */
const runBuild = () => {
  if (isBuilding) {
    return buildChain;
  }

  isBuilding = true;
  buildChain = buildChain.then(
    () =>
      new Promise((resolve, reject) => {
        console.log('[docs:watch] rebuilding nav...');

        const nav = spawn(
          'node',
          [path.join(scriptDir, 'build-docs-nav.mjs')],
          {
            cwd: repoDir,
            stdio: 'inherit',
          }
        );

        nav.on('error', reject);
        nav.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`build-docs-nav.mjs exited with code ${code}`));
            return;
          }

          const slugs = spawn(
            'node',
            [path.join(scriptDir, 'assert-docs-slugs.mjs')],
            {
              cwd: repoDir,
              stdio: 'inherit',
            }
          );

          slugs.on('error', reject);
          slugs.on('close', (slugCode) => {
            if (slugCode !== 0) {
              reject(
                new Error(`assert-docs-slugs.mjs exited with code ${slugCode}`)
              );
              return;
            }

            console.log('[docs:watch] nav updated');
            resolve();
          });
        });
      })
  );

  buildChain = buildChain.finally(() => {
    isBuilding = false;
  });

  buildChain.catch((error) => {
    console.error(`[docs:watch] ${error.message}`);
  });

  return buildChain;
};

/**
 * Schedules a debounced nav rebuild.
 */
const scheduleBuild = () => {
  if (isBuilding) {
    return;
  }

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void runBuild();
  }, debounceMs);
};

/**
 * Returns whether a directory watch event should trigger a rebuild.
 *
 * @param {string | null | undefined} filename Changed file name from fs.watch.
 * @param {string} watchedDir Watched directory path.
 * @returns {boolean}
 */
const shouldTriggerRebuild = (filename, watchedDir) => {
  if (!filename) {
    return false;
  }

  const normalized = filename.replace(/\\/g, '/');

  if (normalized.includes('.vitepress/')) {
    return false;
  }

  if (watchedDir.endsWith(`${path.sep}docs`)) {
    if (normalized.startsWith('images/')) {
      return false;
    }

    return normalized.endsWith('.md');
  }

  return false;
};

/**
 * Registers fs.watch listeners for doc source paths.
 */
const startWatching = () => {
  for (const filePath of watchFiles) {
    watchers.push(
      watch(filePath, () => {
        scheduleBuild();
      })
    );
  }

  for (const dirPath of watchDirs) {
    watchers.push(
      watch(dirPath, { recursive: true }, (_eventType, filename) => {
        if (shouldTriggerRebuild(filename, dirPath)) {
          scheduleBuild();
        }
      })
    );
  }
};

/**
 * Closes active watchers and clears pending rebuilds.
 */
const stopWatching = () => {
  clearTimeout(debounceTimer);

  for (const watcher of watchers) {
    watcher.close();
  }

  watchers = [];
};

process.on('SIGINT', () => {
  stopWatching();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopWatching();
  process.exit(0);
});

startWatching();
console.log('[docs:watch] watching doc sources for changes...');
