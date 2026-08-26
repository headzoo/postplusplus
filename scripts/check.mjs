#!/usr/bin/env node
/**
 * Runs lint, format:check, typecheck, and test:changed in parallel.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

/**
 * Runs a pnpm script asynchronously with output streamed to the console.
 *
 * @param {string} name Label used when reporting failures.
 * @param {string} script Script name passed to `pnpm run`.
 * @returns {Promise<{ name: string, status: number }>}
 */
function runParallel(name, script) {
  return new Promise((resolve) => {
    const child = spawn('pnpm', ['run', script], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('close', (status) => resolve({ name, status: status ?? 1 }));
    child.on('error', () => resolve({ name, status: 1 }));
  });
}

console.log(
  'Running lint, format:check, typecheck, and test:changed in parallel...'
);

const results = await Promise.all([
  runParallel('lint', 'lint'),
  runParallel('format:check', 'format:check'),
  runParallel('typecheck', 'typecheck'),
  runParallel('test:changed', 'test:changed'),
]);

const failures = results.filter((result) => result.status !== 0);
if (failures.length > 0) {
  console.error(
    `\ncheck: failed steps: ${failures
      .map((failure) => failure.name)
      .join(', ')}`
  );
  process.exit(1);
}

console.log('\ncheck: all steps passed');
