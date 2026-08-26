#!/usr/bin/env node
/**
 * Runs ESLint for frontend and backend source trees in parallel.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

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

console.log('Running ESLint...');

const results = await Promise.all([
  runEslint('frontend', 'apps/frontend/eslint.config.mjs', [
    'apps/frontend',
    'libraries/react-shared-libraries',
  ]),
  runEslint('backend', 'eslint.config.backend.mjs', [
    'apps/backend',
    'apps/orchestrator',
    'apps/commands',
    'apps/extension',
    'libraries/nestjs-libraries',
    'libraries/helpers',
  ]),
]);

const failures = results.filter((result) => result.status !== 0);
if (failures.length > 0) {
  console.error(
    `lint: failed steps: ${failures.map((failure) => failure.name).join(', ')}`
  );
  process.exit(1);
}

console.log('lint passed');
