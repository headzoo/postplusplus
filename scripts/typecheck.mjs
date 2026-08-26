#!/usr/bin/env node
/**
 * Runs TypeScript noEmit checks for each major project in parallel.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const projects = [
  { name: 'frontend', config: 'apps/frontend/tsconfig.json' },
  { name: 'backend', config: 'apps/backend/tsconfig.typecheck.json' },
  { name: 'orchestrator', config: 'apps/orchestrator/tsconfig.typecheck.json' },
  { name: 'commands', config: 'apps/commands/tsconfig.typecheck.json' },
  {
    name: 'nestjs-libraries',
    config: 'libraries/nestjs-libraries/tsconfig.typecheck.json',
  },
  {
    name: 'react-shared-libraries',
    config: 'libraries/react-shared-libraries/tsconfig.typecheck.json',
  },
];

/**
 * Runs tsc --noEmit for a single tsconfig.
 *
 * @param {string} name Label used when reporting failures.
 * @param {string} config Path to tsconfig relative to repo root.
 * @returns {Promise<{ name: string, status: number }>}
 */
function runTypecheck(name, config) {
  return new Promise((resolve) => {
    const args = ['exec', 'tsc', '--noEmit', '-p', config];
    const child = spawn('pnpm', args, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('close', (status) => resolve({ name, status: status ?? 1 }));
    child.on('error', () => resolve({ name, status: 1 }));
  });
}

console.log('Running typecheck...');

const results = await Promise.all(
  projects.map((project) => runTypecheck(project.name, project.config))
);

const failures = results.filter((result) => result.status !== 0);
if (failures.length > 0) {
  console.error(
    `typecheck: failed steps: ${failures
      .map((failure) => failure.name)
      .join(', ')}`
  );
  process.exit(1);
}

console.log('typecheck passed');
