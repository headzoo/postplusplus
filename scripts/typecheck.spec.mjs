import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseTypecheckArgs,
  parseTypecheckOnly,
  selectProjects,
} from './typecheck.mjs';
import { resolveConcurrency, withHeapCap } from './run-limited.mjs';

const namesOf = (projects) => projects.map((project) => project.name);

test('selectProjects maps a library file to its owning project', () => {
  assert.deepEqual(
    namesOf(
      selectProjects({
        changedFiles: [
          'libraries/nestjs-libraries/src/database/prisma/pipelines/pipeline.repository.ts',
        ],
      })
    ),
    ['nestjs-libraries']
  );
});

test('selectProjects maps helpers to the packages that import them', () => {
  assert.deepEqual(
    namesOf(
      selectProjects({
        changedFiles: ['libraries/helpers/src/utils/custom.fetch.tsx'],
      })
    ),
    ['frontend', 'backend', 'orchestrator', 'nestjs-libraries']
  );
});

test('selectProjects returns nothing for docs-only edits', () => {
  assert.deepEqual(
    namesOf(selectProjects({ changedFiles: ['AGENTS.md', 'README.md'] })),
    []
  );
});

test('selectProjects ignores package.json script-only edits', () => {
  assert.deepEqual(
    namesOf(selectProjects({ changedFiles: ['package.json'] })),
    []
  );
});

test('selectProjects typechecks everything when the root tsconfig changes', () => {
  assert.deepEqual(
    namesOf(selectProjects({ changedFiles: ['tsconfig.base.json'] })),
    [
      'frontend',
      'backend',
      'orchestrator',
      'commands',
      'nestjs-libraries',
      'react-shared-libraries',
    ]
  );
});

test('selectProjects intersects --changed with explicit project names', () => {
  assert.deepEqual(
    namesOf(
      selectProjects({
        changedFiles: [
          'apps/frontend/src/app/page.tsx',
          'libraries/nestjs-libraries/src/index.ts',
        ],
        onlyNames: ['nestjs-libraries'],
      })
    ),
    ['nestjs-libraries']
  );
});

test('selectProjects rejects unknown project names', () => {
  assert.throws(
    () => selectProjects({ onlyNames: ['not-a-project'] }),
    /unknown project/
  );
});

test('parseTypecheckArgs reads --changed and project names', () => {
  assert.deepEqual(parseTypecheckArgs(['node', 'typecheck.mjs', '--changed']), {
    changed: true,
    names: [],
  });
  assert.deepEqual(
    parseTypecheckArgs(['node', 'typecheck.mjs', '--', 'frontend', 'backend']),
    { changed: false, names: ['frontend', 'backend'] }
  );
  assert.throws(
    () => parseTypecheckArgs(['node', 'typecheck.mjs', '--wat']),
    /unknown option/
  );
});

test('parseTypecheckOnly splits TYPECHECK_ONLY', () => {
  assert.deepEqual(
    parseTypecheckOnly({ TYPECHECK_ONLY: 'frontend, backend' }),
    ['frontend', 'backend']
  );
  assert.deepEqual(parseTypecheckOnly({}), []);
});

test('resolveConcurrency prefers the env override, then CI, then local', () => {
  assert.equal(
    resolveConcurrency({
      env: {},
      envName: 'TYPECHECK_CONCURRENCY',
      localDefault: 1,
      ciDefault: 6,
      itemCount: 6,
    }),
    1
  );
  assert.equal(
    resolveConcurrency({
      env: { CI: 'true' },
      envName: 'TYPECHECK_CONCURRENCY',
      localDefault: 1,
      ciDefault: 6,
      itemCount: 6,
    }),
    6
  );
  assert.equal(
    resolveConcurrency({
      env: { TYPECHECK_CONCURRENCY: '2' },
      envName: 'TYPECHECK_CONCURRENCY',
      localDefault: 1,
      ciDefault: 6,
      itemCount: 6,
    }),
    2
  );
});

test('withHeapCap does not override an existing heap flag', () => {
  assert.match(withHeapCap({}).NODE_OPTIONS, /--max-old-space-size=4096/);
  assert.equal(
    withHeapCap({ NODE_OPTIONS: '--max-old-space-size=8192' }).NODE_OPTIONS,
    '--max-old-space-size=8192'
  );
});
