#!/usr/bin/env node
/**
 * Runs ESLint for frontend and backend source trees.
 *
 * Locally the two trees run one after another. CI still lints them together.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConcurrency, runPool } from './run-limited.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const lintJobs = [
  {
    name: 'frontend',
    configPath: 'apps/frontend/eslint.config.mjs',
    targets: ['apps/frontend', 'libraries/react-shared-libraries'],
  },
  {
    name: 'backend',
    configPath: 'eslint.config.backend.mjs',
    targets: [
      'apps/backend',
      'apps/orchestrator',
      'apps/commands',
      'apps/extension',
      'libraries/nestjs-libraries',
      'libraries/helpers',
    ],
  },
];

/**
 * Runs ESLint with the given config and file globs.
 *
 * @param {string} name Label used when reporting failures.
 * @param {string} configPath Path to the ESLint config file.
 * @param {string[]} targets Paths or globs to lint.
 * @returns {Promise<{ name: string, status: number }>}
 */
function runEslint(name, configPath, targets) {
  return new Promise((resolve) => {
    const args = [
      'exec',
      'eslint',
      '--cache',
      '--cache-location',
      `.eslintcache-${name}`,
      '--config',
      configPath,
      ...targets,
    ];
    const child = spawn('pnpm', args, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('close', (status) => resolve({ name, status: status ?? 1 }));
    child.on('error', () => resolve({ name, status: 1 }));
  });
}

const concurrency = resolveConcurrency({
  envName: 'LINT_CONCURRENCY',
  localDefault: 1,
  ciDefault: lintJobs.length,
  itemCount: lintJobs.length,
});

console.log(`Running ESLint (concurrency ${concurrency})...`);

const results = await runPool(lintJobs, concurrency, (job) =>
  runEslint(job.name, job.configPath, job.targets)
);

const failures = results.filter((result) => result.status !== 0);
if (failures.length > 0) {
  console.error(
    `lint: failed steps: ${failures.map((failure) => failure.name).join(', ')}`
  );
  process.exit(1);
}

console.log('lint passed');
