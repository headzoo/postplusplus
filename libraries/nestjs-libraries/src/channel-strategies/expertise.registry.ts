import { NotFoundException } from '@nestjs/common';
import { existsSync, readFileSync, statSync } from 'fs';
import { resolve } from 'path';

import {
  CHANNEL_STRATEGY_IDS,
  ChannelStrategyId,
} from './channel-strategy.types';

const CANONICAL_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ExpertiseMetadata = Readonly<{
  id: string;
  slug: string;
  name: string;
  description: string;
  tags: readonly string[];
  strategyTags: readonly ChannelStrategyId[];
  fileSize: number;
}>;

type ExpertiseDefinition = Readonly<
  Omit<ExpertiseMetadata, 'fileSize'> & {
    filename: string;
  }
>;

const expertiseDefinitions: readonly ExpertiseDefinition[] = [
  {
    id: 'reciprocal-mutual-deepening',
    slug: 'reciprocal-mutual-deepening',
    name: 'Reciprocal mutual deepening',
    description:
      'Deepen audience-building relationships that show mutual interest.',
    tags: ['reciprocity', 'relationships', 'audience-growth'],
    strategyTags: ['grow_audience'],
    filename: 'reciprocal-mutual-deepening.md',
  },
  {
    id: 'first-reply-warm-dm',
    slug: 'first-reply-warm-dm',
    name: 'First reply warm DM',
    description: 'Turn a first reply into a welcome, relevant conversation.',
    tags: ['replies', 'direct-messages', 'audience-growth'],
    strategyTags: ['grow_audience'],
    filename: 'first-reply-warm-dm.md',
  },
  {
    id: 'lead-follow-up-without-pressure',
    slug: 'lead-follow-up-without-pressure',
    name: 'Lead follow-up without pressure',
    description: 'Follow up with prospective customers while preserving trust.',
    tags: ['leads', 'follow-up', 'relationships'],
    strategyTags: ['lead_capture'],
    filename: 'lead-follow-up-without-pressure.md',
  },
  {
    id: 'amplification-mention-thank-yous',
    slug: 'amplification-mention-thank-yous',
    name: 'Amplification mention thank-yous',
    description:
      'Thank people who amplify the brand in a specific, useful way.',
    tags: ['mentions', 'amplification', 'gratitude'],
    strategyTags: ['brand_awareness'],
    filename: 'amplification-mention-thank-yous.md',
  },
  {
    id: 'cooling-relationship-reengagement',
    slug: 'cooling-relationship-reengagement',
    name: 'Cooling relationship re-engagement',
    description:
      'Re-engage a cooling relationship with relevance and restraint.',
    tags: ['re-engagement', 'relationships', 'retention'],
    strategyTags: ['community_retention'],
    filename: 'cooling-relationship-reengagement.md',
  },
  {
    id: 'when-not-to-engage',
    slug: 'when-not-to-engage',
    name: 'When not to engage',
    description:
      'Recognize when engagement would not serve the relationship or fit.',
    tags: ['boundaries', 'fit', 'disengagement'],
    strategyTags: ['lead_capture', 'customer_support'],
    filename: 'when-not-to-engage.md',
  },
  {
    id: 'over-invested-one-sided-cooling',
    slug: 'over-invested-one-sided-cooling',
    name: 'Over-invested one-sided cooling',
    description:
      'Reduce one-sided effort while leaving space for healthy reciprocity.',
    tags: ['boundaries', 'one-sided', 'retention'],
    strategyTags: ['community_retention'],
    filename: 'over-invested-one-sided-cooling.md',
  },
  {
    id: 'warm-network-bridging',
    slug: 'warm-network-bridging',
    name: 'Warm network bridging',
    description:
      'Bridge trusted relationships into relevant new audience and lead connections.',
    tags: ['networking', 'introductions', 'relationships'],
    strategyTags: ['grow_audience', 'lead_capture'],
    filename: 'warm-network-bridging.md',
  },
  {
    id: 'support-complaint-replies',
    slug: 'support-complaint-replies',
    name: 'Support complaint replies',
    description:
      'Respond to public complaints with care, clarity, and a path to resolution.',
    tags: ['support', 'complaints', 'replies'],
    strategyTags: ['customer_support'],
    filename: 'support-complaint-replies.md',
  },
  {
    id: 'cadence-and-timing',
    slug: 'cadence-and-timing',
    name: 'Cadence and timing',
    description:
      'Choose a considerate follow-up cadence across relationship goals.',
    tags: ['timing', 'cadence', 'follow-up'],
    strategyTags: [
      'grow_audience',
      'lead_capture',
      'community_retention',
      'brand_awareness',
      'customer_support',
    ],
    filename: 'cadence-and-timing.md',
  },
  {
    id: 'advocate-amplifier-stewardship',
    slug: 'advocate-amplifier-stewardship',
    name: 'Advocate and amplifier stewardship',
    description:
      'Sustain relationships with advocates and recurring amplifiers.',
    tags: ['advocates', 'amplification', 'retention'],
    strategyTags: ['community_retention', 'brand_awareness'],
    filename: 'advocate-amplifier-stewardship.md',
  },
];

function assertRegistryInvariants(
  definitions: readonly ExpertiseDefinition[]
): void {
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const filenames = new Set<string>();

  for (const definition of definitions) {
    if (
      !definition.id ||
      !definition.slug ||
      !definition.name ||
      !definition.description ||
      !definition.tags.length ||
      !definition.strategyTags.length
    ) {
      throw new Error(`Incomplete expertise definition: ${definition.slug}`);
    }
    if (!CANONICAL_SLUG_PATTERN.test(definition.slug)) {
      throw new Error(`Invalid expertise slug: ${definition.slug}`);
    }
    if (!definition.filename.endsWith('.md')) {
      throw new Error(`Invalid expertise filename: ${definition.filename}`);
    }
    if (
      definition.tags.some((tag) => !tag.trim()) ||
      definition.strategyTags.some(
        (strategyTag) => !CHANNEL_STRATEGY_IDS.includes(strategyTag)
      )
    ) {
      throw new Error(`Invalid expertise tags: ${definition.slug}`);
    }
    if (
      ids.has(definition.id) ||
      slugs.has(definition.slug) ||
      filenames.has(definition.filename)
    ) {
      throw new Error(`Duplicate expertise definition: ${definition.slug}`);
    }

    ids.add(definition.id);
    slugs.add(definition.slug);
    filenames.add(definition.filename);
  }
}

assertRegistryInvariants(expertiseDefinitions);

export const expertiseRegistry: readonly ExpertiseDefinition[] = Object.freeze(
  expertiseDefinitions.map((definition) =>
    Object.freeze({
      ...definition,
      tags: Object.freeze([...definition.tags]),
      strategyTags: Object.freeze([...definition.strategyTags]),
    })
  )
);

const expertiseBySlug = new Map(
  expertiseRegistry.map((definition) => [definition.slug, definition])
);

function getExpertiseDirectoryCandidates(): readonly string[] {
  return [
    resolve(__dirname, 'expertise'),
    resolve(
      __dirname,
      '../../../../../../../libraries/nestjs-libraries/src/channel-strategies/expertise'
    ),
    resolve(
      process.cwd(),
      'libraries/nestjs-libraries/src/channel-strategies/expertise'
    ),
    resolve(
      process.cwd(),
      '../../libraries/nestjs-libraries/src/channel-strategies/expertise'
    ),
  ];
}

function resolveExpertiseDirectory(): string {
  return getExpertiseDirectoryCandidates().find(existsSync) ?? '';
}

function resolveAssetPath(definition: ExpertiseDefinition): string {
  const directory = resolveExpertiseDirectory();
  if (!directory) {
    throw new Error('Expertise assets are missing from this runtime.');
  }

  const filePath = resolve(directory, definition.filename);
  if (!existsSync(filePath)) {
    throw new Error(`Expertise asset is missing: ${definition.slug}`);
  }

  return filePath;
}

function getDefinition(slug: string): ExpertiseDefinition {
  const definition = expertiseBySlug.get(slug);
  if (!definition) {
    throw new NotFoundException(`Unknown expertise slug: ${slug}`);
  }
  return definition;
}

export function listExpertise(): ExpertiseMetadata[] {
  return expertiseRegistry.map((definition) => ({
    id: definition.id,
    slug: definition.slug,
    name: definition.name,
    description: definition.description,
    tags: [...definition.tags],
    strategyTags: [...definition.strategyTags],
    fileSize: statSync(resolveAssetPath(definition)).size,
  }));
}

export function readExpertise(slug: string): string {
  return readFileSync(resolveAssetPath(getDefinition(slug)), 'utf8');
}
