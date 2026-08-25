import { NotFoundException } from '@nestjs/common';
import { existsSync, readFileSync, renameSync, statSync } from 'fs';
import { join } from 'path';

import {
  expertiseRegistry,
  listExpertise,
  MAX_EXPERTISE_CONTENT_BYTES,
  MAX_EXPERTISE_PLAYBOOKS,
  readExpertise,
  selectExpertiseForTriage,
} from './expertise.registry';
import {
  CHANNEL_STRATEGY_IDS,
  TRIAGE_PIPELINE_KINDS,
} from './channel-strategy.types';

const expertiseDirectory = join(__dirname, 'expertise');
const backendNestCliPath = join(
  __dirname,
  '../../../../apps/backend/nest-cli.json'
);

describe('expertiseRegistry', () => {
  it('contains each required playbook exactly once', () => {
    expect(expertiseRegistry.map(({ slug }) => slug)).toEqual([
      'reciprocal-mutual-deepening',
      'first-reply-warm-dm',
      'lead-follow-up-without-pressure',
      'amplification-mention-thank-yous',
      'cooling-relationship-reengagement',
      'when-not-to-engage',
      'over-invested-one-sided-cooling',
      'warm-network-bridging',
      'support-complaint-replies',
      'cadence-and-timing',
      'advocate-amplifier-stewardship',
    ]);
  });

  it('has unique canonical metadata with valid strategy and triage tags', () => {
    expect(new Set(expertiseRegistry.map(({ id }) => id)).size).toBe(
      expertiseRegistry.length
    );
    expect(new Set(expertiseRegistry.map(({ slug }) => slug)).size).toBe(
      expertiseRegistry.length
    );
    expect(
      new Set(expertiseRegistry.map(({ filename }) => filename)).size
    ).toBe(expertiseRegistry.length);

    for (const definition of expertiseRegistry) {
      expect(definition.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(definition.filename).toMatch(/\.md$/);
      expect(definition.tags.length).toBeGreaterThan(0);
      expect(definition.strategyTags.length).toBeGreaterThan(0);
      expect(definition.triageTags.length).toBeGreaterThan(0);
      expect(
        definition.strategyTags.every((tag) =>
          CHANNEL_STRATEGY_IDS.includes(tag)
        )
      ).toBe(true);
      expect(
        definition.triageTags.every((tag) => TRIAGE_PIPELINE_KINDS.includes(tag))
      ).toBe(true);
    }
  });

  it('maps every registry item to a source Markdown asset', () => {
    for (const { filename } of expertiseRegistry) {
      expect(existsSync(join(expertiseDirectory, filename))).toBe(true);
    }
  });

  it('configures the backend build to package the corpus beside compiled code', () => {
    const nestCli = JSON.parse(readFileSync(backendNestCliPath, 'utf8'));

    expect(nestCli.compilerOptions.assets).toContainEqual({
      include:
        '../../../libraries/nestjs-libraries/src/channel-strategies/expertise/**/*.md',
      outDir: 'dist/libraries/nestjs-libraries/src',
    });
  });

  it('selects at least one playbook for every strategy and triage pipeline', () => {
    for (const strategyId of CHANNEL_STRATEGY_IDS) {
      for (const triage of TRIAGE_PIPELINE_KINDS) {
        const selected = selectExpertiseForTriage({
          strategyId,
          triage,
        });

        expect(selected.length).toBeGreaterThan(0);
        expect(
          selected.every(
            (entry) =>
              entry.strategyTags.includes(strategyId) &&
              entry.triageTags.includes(triage)
          )
        ).toBe(true);
        expect(selected.every((entry) => !('filename' in entry))).toBe(true);
        expect(selected.every((entry) => !('path' in entry))).toBe(true);
      }
    }
  });

  it('orders selected expertise deterministically and enforces budgets', () => {
    const selected = selectExpertiseForTriage({
      strategyId: 'grow_audience',
      triage: 'hot',
    });
    const selectedAgain = selectExpertiseForTriage({
      strategyId: 'grow_audience',
      triage: 'hot',
    });

    expect(selected.map((entry) => entry.slug)).toEqual(
      selectedAgain.map((entry) => entry.slug)
    );
    expect(selected.length).toBeLessThanOrEqual(MAX_EXPERTISE_PLAYBOOKS);
    expect(
      selected.reduce(
        (bytes, entry) => bytes + Buffer.byteLength(entry.content, 'utf8'),
        0
      )
    ).toBeLessThanOrEqual(MAX_EXPERTISE_CONTENT_BYTES);
  });
});

describe('expertise loader', () => {
  it('lists metadata with actual file sizes without exposing content or paths', () => {
    const metadata = listExpertise();

    expect(metadata).toHaveLength(11);
    expect(metadata[0]).toEqual({
      id: 'reciprocal-mutual-deepening',
      slug: 'reciprocal-mutual-deepening',
      name: 'Reciprocal mutual deepening',
      description:
        'Deepen audience-building relationships that show mutual interest.',
      tags: ['reciprocity', 'relationships', 'audience-growth'],
      strategyTags: ['grow_audience'],
      triageTags: ['hot', 'cultivate'],
      fileSize: statSync(
        join(expertiseDirectory, 'reciprocal-mutual-deepening.md')
      ).size,
    });
    expect(metadata[0]).not.toHaveProperty('content');
    expect(metadata[0]).not.toHaveProperty('filename');
    expect(metadata[0]).not.toHaveProperty('path');

    const nextMetadata = listExpertise();
    expect(nextMetadata).not.toBe(metadata);
    expect(nextMetadata[0]).not.toBe(metadata[0]);
    expect(nextMetadata[0].tags).not.toBe(metadata[0].tags);
    expect(nextMetadata[0].strategyTags).not.toBe(metadata[0].strategyTags);
    expect(nextMetadata[0].triageTags).not.toBe(metadata[0].triageTags);
  });

  it('reads exactly one selected Markdown document', () => {
    const slug = 'reciprocal-mutual-deepening';
    expect(readExpertise(slug)).toBe(
      readFileSync(join(expertiseDirectory, `${slug}.md`), 'utf8')
    );
  });

  it('rejects unknown and traversal slugs', () => {
    expect(() => readExpertise('unknown')).toThrow(NotFoundException);
    expect(() => readExpertise('../reciprocal-mutual-deepening')).toThrow(
      NotFoundException
    );
  });

  it('reports a clear error when a selected asset is missing', () => {
    const filename = 'reciprocal-mutual-deepening.md';
    const filePath = join(expertiseDirectory, filename);
    const missingPath = `${filePath}.missing`;

    renameSync(filePath, missingPath);
    try {
      expect(() => readExpertise('reciprocal-mutual-deepening')).toThrow(
        'Expertise asset is missing'
      );
    } finally {
      renameSync(missingPath, filePath);
    }
  });
});
