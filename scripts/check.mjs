#!/usr/bin/env node
/**
 * Runs lint, format:check, typecheck, and test:changed.
 *
 * Locally the four steps run one after another so they cannot stack on top of
 * six tsc processes. CI still runs them in parallel.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConcurrency, runPool } from './run-limited.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const steps = [
  { name: 'lint', script: 'lint' },
  { name: 'format:check', script: 'format:check' },
  { name: 'typecheck', script: 'typecheck' },
  { name: 'test:changed', script: 'test:changed' },
];

/**
 * Runs a pnpm script asynchronously with output streamed to the console.
 *
 * @param {string} name Label used when reporting failures.
 * @param {string} script Script name passed to `pnpm run`.
 * @returns {Promise<{ name: string, status: number }>}
 */
function runStep(name, script) {
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

const concurrency = resolveConcurrency({
  envName: 'CHECK_CONCURRENCY',
  localDefault: 1,
  ciDefault: steps.length,
  itemCount: steps.length,
});

console.log(
  `Running lint, format:check, typecheck, and test:changed (concurrency ${concurrency})...`
);

const results = await runPool(steps, concurrency, (step) =>
  runStep(step.name, step.script)
);

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
