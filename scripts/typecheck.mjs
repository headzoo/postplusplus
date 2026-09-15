#!/usr/bin/env node
/**
 * Runs TypeScript noEmit checks for each major project.
 *
 * Locally this is sequential (one tsc at a time) so six compilers cannot
 * exhaust RAM or thrash a full disk. CI still fans out. Scope with
 * `--changed`, project names, or TYPECHECK_ONLY.
 */
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConcurrency, runPool, withHeapCap } from './run-limited.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

export const TYPECHECK_PROJECTS = [
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

const PREFIX_TO_PROJECTS = {
  'apps/frontend/': ['frontend'],
  'apps/backend/': ['backend'],
  'apps/orchestrator/': ['orchestrator'],
  'apps/commands/': ['commands'],
  'libraries/nestjs-libraries/': ['nestjs-libraries'],
  'libraries/react-shared-libraries/': ['react-shared-libraries'],
  'libraries/helpers/': [
    'frontend',
    'backend',
    'orchestrator',
    'nestjs-libraries',
  ],
};

const ALL_PROJECT_FILES = new Set(['tsconfig.json', 'tsconfig.base.json']);

/**
 * @param {object} options
 * @param {string[] | null} [options.changedFiles] Git paths, or null to skip.
 * @param {string[]} [options.onlyNames] Explicit project name filters.
 * @param {typeof TYPECHECK_PROJECTS} [options.projects]
 * @returns {typeof TYPECHECK_PROJECTS}
 */
export function selectProjects({
  changedFiles,
  onlyNames = [],
  projects = TYPECHECK_PROJECTS,
} = {}) {
  const byName = new Map(projects.map((project) => [project.name, project]));
  let selected = projects;

  if (changedFiles) {
    const forcesAll = changedFiles.some((file) => ALL_PROJECT_FILES.has(file));

    if (!forcesAll) {
      const names = new Set();
      for (const file of changedFiles) {
        for (const [prefix, projectNames] of Object.entries(
          PREFIX_TO_PROJECTS
        )) {
          if (file.startsWith(prefix)) {
            for (const name of projectNames) {
              names.add(name);
            }
          }
        }
      }
      selected = projects.filter((project) => names.has(project.name));
    }
  }

  if (onlyNames.length > 0) {
    const unknown = onlyNames.filter((name) => !byName.has(name));
    if (unknown.length > 0) {
      throw new Error(
        `typecheck: unknown project(s): ${unknown.join(', ')}. Known: ${projects
          .map((project) => project.name)
          .join(', ')}`
      );
    }
    const allow = new Set(onlyNames);
    selected = selected.filter((project) => allow.has(project.name));
  }

  return selected;
}

/**
 * @param {string[]} argv
 * @returns {{ changed: boolean, names: string[] }}
 */
export function parseTypecheckArgs(argv) {
  const args = argv.slice(2).filter((arg) => arg !== '--');
  let changed = false;
  const names = [];

  for (const arg of args) {
    if (arg === '--changed') {
      changed = true;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`typecheck: unknown option ${arg}`);
    }
    names.push(arg);
  }

  return { changed, names };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export function parseTypecheckOnly(env = process.env) {
  return (env.TYPECHECK_ONLY ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

/**
 * @returns {string[] | null} Relative paths, or null when git is unavailable.
 */
export function listChangedFiles() {
  const diff = spawnSync('git', ['diff', '--name-only', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const untracked = spawnSync(
    'git',
    ['ls-files', '--others', '--exclude-standard'],
    { cwd: repoRoot, encoding: 'utf8' }
  );

  if (diff.status !== 0 || untracked.status !== 0) {
    return null;
  }

  return [
    ...new Set(
      `${diff.stdout}\n${untracked.stdout}`
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    ),
  ];
}

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
      env: withHeapCap(process.env),
    });
    child.on('close', (status) => resolve({ name, status: status ?? 1 }));
    child.on('error', () => resolve({ name, status: 1 }));
  });
}

/**
 * @returns {Promise<number>}
 */
export async function main() {
  const { changed: wantChanged, names: cliNames } = parseTypecheckArgs(
    process.argv
  );
  const onlyNames = [...new Set([...cliNames, ...parseTypecheckOnly()])];
  const changedFiles = wantChanged ? listChangedFiles() : undefined;

  if (wantChanged && changedFiles === null) {
    console.warn(
      'typecheck: could not read git changes; checking all selected projects'
    );
  }

  const selected = selectProjects({
    changedFiles: wantChanged ? changedFiles : undefined,
    onlyNames,
  });

  if (selected.length === 0) {
    console.log('typecheck: no TypeScript projects affected');
    return 0;
  }

  const concurrency = resolveConcurrency({
    envName: 'TYPECHECK_CONCURRENCY',
    localDefault: 1,
    ciDefault: selected.length,
    itemCount: selected.length,
  });

  console.log(
    `Running typecheck: ${selected
      .map((project) => project.name)
      .join(', ')} (concurrency ${concurrency})`
  );

  const results = await runPool(selected, concurrency, (project) =>
    runTypecheck(project.name, project.config)
  );

  const failures = results.filter((result) => result.status !== 0);
  if (failures.length > 0) {
    console.error(
      `typecheck: failed steps: ${failures
        .map((failure) => failure.name)
        .join(', ')}`
    );
    return 1;
  }

  console.log('typecheck passed');
  return 0;
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  process.exit(await main());
}
