import { NotFoundException } from '@nestjs/common';
import { existsSync, readFileSync, renameSync, statSync } from 'fs';
import { join } from 'path';

import {
  expertiseRegistry,
  listExpertise,
  readExpertise,
} from './expertise.registry';
import { CHANNEL_STRATEGY_IDS } from './channel-strategy.types';

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

  it('has unique canonical metadata with valid strategy tags', () => {
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
      expect(
        definition.strategyTags.every((tag) =>
          CHANNEL_STRATEGY_IDS.includes(tag)
        )
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
