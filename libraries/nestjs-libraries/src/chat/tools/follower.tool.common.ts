import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import {
  FOLLOWER_AUDIENCES,
  FOLLOWER_CATEGORY_DESCRIPTIONS,
  FOLLOWER_INTERACTION_WINDOWS,
  FOLLOWER_SORT_DIRECTIONS,
  FOLLOWER_TRIAGE_FILTERS,
  normalizeFollowerSearch,
} from '@gitroom/nestjs-libraries/integrations/social/follower.sorts';
import { BadRequestException } from '@nestjs/common';
import z from 'zod';

export const followerToolAnnotations = {
  title: 'Follower audience read',
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const followerWriteToolAnnotations = {
  title: 'Follower audience write',
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

export const FOLLOWER_LIST_MEMBER_WRITE_BATCH = 50;

export const followerCategoriesDescription = Object.entries(
  FOLLOWER_CATEGORY_DESCRIPTIONS
)
  .map(([category, description]) => `${category}: ${description}`)
  .join(' ');

const followerQueryShape = z.object({
  limit: z.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().min(1).max(2048).optional(),
  sort: z.string().min(1).max(64).optional(),
  direction: z.enum(FOLLOWER_SORT_DIRECTIONS).optional(),
  window: z.enum(FOLLOWER_INTERACTION_WINDOWS).optional(),
  search: z
    .string()
    .max(64)
    .optional()
    .transform((value) => normalizeFollowerSearch(value)),
  triage: z.enum(FOLLOWER_TRIAGE_FILTERS).optional(),
  audience: z.enum(FOLLOWER_AUDIENCES).optional(),
  listId: z.string().min(1).max(64).optional(),
});

const validateFollowerQueryExclusivity = (query: {
  audience?: string;
  triage?: string;
  listId?: string;
}) => [query.audience, query.triage, query.listId].filter(Boolean).length <= 1;

export const followerQuerySchema = followerQueryShape.refine(
  validateFollowerQueryExclusivity,
  'audience, triage, and listId cannot be combined'
);

export const followerQueryWithChannelSchema = followerQueryShape
  .extend({
    channelId: z.string().min(1).max(64),
  })
  .refine(
    validateFollowerQueryExclusivity,
    'audience, triage, and listId cannot be combined'
  );

const followerSelectorShape = z.object({
  externalId: z.string().min(1).max(512).optional(),
  username: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .transform((value) => normalizeFollowerSearch(value)),
});

const validateFollowerSelector = (selector: {
  externalId?: string;
  username?: string;
}) =>
  Number(Boolean(selector.externalId)) + Number(Boolean(selector.username)) ===
  1;

export const followerSelectorSchema = followerSelectorShape.refine(
  validateFollowerSelector,
  'Provide exactly one of externalId or username.'
);

export const followerSelectorWithChannelSchema = followerSelectorShape
  .extend({
    channelId: z.string().min(1).max(64),
  })
  .refine(
    validateFollowerSelector,
    'Provide exactly one of externalId or username.'
  );

export type FollowerToolActor = { userId: string };

export const getFollowerToolContext = (inputData: unknown, context: any) => {
  checkAuth(inputData, context);
  const organization = JSON.parse(
    context?.requestContext?.get('organization') as string
  );
  const actorValue = context?.requestContext?.get('user');
  const actor =
    typeof actorValue === 'string' ? JSON.parse(actorValue) : actorValue;

  return {
    organization,
    actor:
      actor && typeof actor.userId === 'string'
        ? { userId: actor.userId }
        : undefined,
  };
};

export const requireFollowerWriteActor = (
  actor: FollowerToolActor | undefined
): FollowerToolActor => {
  if (!actor?.userId) {
    throw new BadRequestException(
      'Follower write tools require an authenticated UI user'
    );
  }
  return actor;
};

export const requireFollowerChannelId = (channelId: string | undefined) => {
  if (!channelId) {
    throw new BadRequestException('A follower channel id is required');
  }
  return channelId;
};

export const safeHttpUrl = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? value
      : undefined;
  } catch {
    return undefined;
  }
};
