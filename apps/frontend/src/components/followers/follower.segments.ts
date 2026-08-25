import { FC } from 'react';
import {
  EyeSlashIcon,
  FlameIcon,
  HandshakeIcon,
  IconProps,
  SadFaceIcon,
  SeedlingIcon,
  UsersGroupIcon,
  UsersIcon,
} from '@gitroom/frontend/components/ui/icons';
import { FOLLOWER_CATEGORY_DESCRIPTIONS } from '@gitroom/nestjs-libraries/integrations/social/follower.sorts';
import {
  FollowerSortDirection,
  FollowerTriageFilter,
} from '@gitroom/frontend/components/followers/use.followers';

export type FollowerSegmentColor =
  | 'blue'
  | 'green'
  | 'red'
  | 'purple'
  | 'yellow'
  | 'orange'
  | 'neutral';

export type FollowerSegmentSlug =
  | 'all'
  | 'leads'
  | 'hot'
  | 'mutual'
  | 'cultivate'
  | 'quiet'
  | 'ignored'
  | 'costly'
  | 'bots';

export type FollowerSegmentDefinition = {
  slug: FollowerSegmentSlug;
  key: string;
  defaultLabel: string;
  descriptionKey: string;
  defaultDescription: string;
  color: FollowerSegmentColor;
  icon: FC<IconProps>;
  categoryKey?: keyof typeof FOLLOWER_CATEGORY_DESCRIPTIONS;
  audience?: 'lead' | 'ignored' | 'cultivate' | 'hot';
  triage?: FollowerTriageFilter;
  isBot?: true;
};

export const FOLLOWER_SEGMENT_COLOR_CLASSES: Record<
  FollowerSegmentColor,
  {
    text: string;
    iconBg: string;
    border: string;
    borderSelected: string;
    outlineButton: string;
    statusDot: string;
  }
> = {
  blue: {
    text: 'text-sky-400',
    iconBg: 'bg-sky-500/15',
    border: 'border-sky-500/40',
    borderSelected: 'border-sky-400 bg-sky-500/10 text-sky-300',
    outlineButton: 'border-sky-500/60 text-sky-400 hover:bg-sky-500/10',
    statusDot: 'bg-sky-400',
  },
  green: {
    text: 'text-emerald-400',
    iconBg: 'bg-emerald-500/15',
    border: 'border-emerald-500/40',
    borderSelected: 'border-emerald-400 bg-emerald-500/10 text-emerald-300',
    outlineButton: 'border-emerald-500/60 text-emerald-400 hover:bg-emerald-500/10',
    statusDot: 'bg-emerald-400',
  },
  red: {
    text: 'text-red-400',
    iconBg: 'bg-red-500/15',
    border: 'border-red-500/40',
    borderSelected: 'border-red-400 bg-red-500/10 text-red-300',
    outlineButton: 'border-red-500/60 text-red-400 hover:bg-red-500/10',
    statusDot: 'bg-red-400',
  },
  purple: {
    text: 'text-violet-400',
    iconBg: 'bg-violet-500/15',
    border: 'border-violet-500/40',
    borderSelected: 'border-violet-400 bg-violet-500/10 text-violet-300',
    outlineButton: 'border-violet-500/60 text-violet-400 hover:bg-violet-500/10',
    statusDot: 'bg-violet-400',
  },
  yellow: {
    text: 'text-amber-300',
    iconBg: 'bg-amber-400/15',
    border: 'border-amber-400/40',
    borderSelected: 'border-amber-300 bg-amber-400/10 text-amber-200',
    outlineButton: 'border-amber-400/60 text-amber-300 hover:bg-amber-400/10',
    statusDot: 'bg-amber-300',
  },
  orange: {
    text: 'text-orange-400',
    iconBg: 'bg-orange-500/15',
    border: 'border-orange-500/50',
    borderSelected: 'border-orange-500 bg-orange-500/10 text-orange-300',
    outlineButton: 'border-orange-500/60 text-orange-400 hover:bg-orange-500/10',
    statusDot: 'bg-orange-400',
  },
  neutral: {
    text: 'text-newTextColor',
    iconBg: 'bg-newTableHeader',
    border: 'border-newBorder',
    borderSelected: 'border-orange-500 bg-orange-500/10 text-orange-300',
    outlineButton: 'border-newBorder text-textItemBlur hover:bg-newTableHeader',
    statusDot: 'bg-newTableText',
  },
};

export const FOLLOWER_SUMMARY_SEGMENTS: FollowerSegmentDefinition[] = [
  {
    slug: 'all',
    key: 'followers_summary_all',
    defaultLabel: 'All Followers',
    descriptionKey: 'followers_summary_all_description',
    defaultDescription: 'Everyone in this channel’s audience view.',
    color: 'blue',
    icon: UsersIcon,
  },
  {
    slug: 'leads',
    key: 'followers_audience_leads',
    defaultLabel: 'Leads',
    descriptionKey: 'followers_board_leads_description',
    defaultDescription: FOLLOWER_CATEGORY_DESCRIPTIONS.lead,
    color: 'green',
    icon: UsersGroupIcon,
    categoryKey: 'lead',
    audience: 'lead',
  },
  {
    slug: 'mutual',
    key: 'followers_triage_mutual',
    defaultLabel: 'Mutual',
    descriptionKey: 'followers_board_mutual_description',
    defaultDescription: FOLLOWER_CATEGORY_DESCRIPTIONS.mutual,
    color: 'green',
    icon: HandshakeIcon,
    categoryKey: 'mutual',
    triage: 'mutual',
  },
  {
    slug: 'hot',
    key: 'followers_triage_hot_lead',
    defaultLabel: 'Hot',
    descriptionKey: 'followers_board_hot_description',
    defaultDescription: FOLLOWER_CATEGORY_DESCRIPTIONS.hot,
    color: 'red',
    icon: FlameIcon,
    categoryKey: 'hot',
    audience: 'hot',
  },
  {
    slug: 'cultivate',
    key: 'followers_audience_cultivate',
    defaultLabel: 'Cultivate',
    descriptionKey: 'followers_board_cultivate_description',
    defaultDescription: FOLLOWER_CATEGORY_DESCRIPTIONS.cultivate,
    color: 'green',
    icon: SeedlingIcon,
    categoryKey: 'cultivate',
    audience: 'cultivate',
  },
  {
    slug: 'quiet',
    key: 'followers_triage_quiet',
    defaultLabel: 'Quiet',
    descriptionKey: 'followers_board_quiet_description',
    defaultDescription: FOLLOWER_CATEGORY_DESCRIPTIONS.quiet,
    color: 'purple',
    icon: SadFaceIcon,
    categoryKey: 'quiet',
    triage: 'quiet',
  },
  {
    slug: 'ignored',
    key: 'followers_ignored_list',
    defaultLabel: 'Ignored',
    descriptionKey: 'followers_board_ignored_description',
    defaultDescription: FOLLOWER_CATEGORY_DESCRIPTIONS.ignored,
    color: 'yellow',
    icon: EyeSlashIcon,
    categoryKey: 'ignored',
    audience: 'ignored',
  },
];

/** Board columns on the All overview (no Ignored column). */
export const FOLLOWER_BOARD_SEGMENTS: FollowerSegmentDefinition[] = [
  FOLLOWER_SUMMARY_SEGMENTS.find((s) => s.slug === 'leads')!,
  FOLLOWER_SUMMARY_SEGMENTS.find((s) => s.slug === 'hot')!,
  FOLLOWER_SUMMARY_SEGMENTS.find((s) => s.slug === 'mutual')!,
  FOLLOWER_SUMMARY_SEGMENTS.find((s) => s.slug === 'cultivate')!,
  FOLLOWER_SUMMARY_SEGMENTS.find((s) => s.slug === 'quiet')!,
];

export const FOLLOWER_TAB_SEGMENTS: Array<{
  slug?: FollowerSegmentSlug;
  key: string;
  defaultLabel: string;
  color: FollowerSegmentColor;
  audience?: 'lead' | 'ignored' | 'cultivate' | 'hot';
  triage?: FollowerTriageFilter;
  isBot?: true;
}> = [
  {
    key: 'followers_triage_filter_all',
    defaultLabel: 'All',
    color: 'neutral',
  },
  {
    slug: 'leads',
    key: 'followers_audience_leads',
    defaultLabel: 'Leads',
    color: 'green',
    audience: 'lead',
  },
  {
    slug: 'hot',
    key: 'followers_triage_hot_lead',
    defaultLabel: 'Hot',
    color: 'red',
    audience: 'hot',
  },
  {
    slug: 'mutual',
    key: 'followers_triage_mutual',
    defaultLabel: 'Mutual',
    color: 'green',
    triage: 'mutual',
  },
  {
    slug: 'cultivate',
    key: 'followers_audience_cultivate',
    defaultLabel: 'Cultivate',
    color: 'green',
    audience: 'cultivate',
  },
  {
    slug: 'quiet',
    key: 'followers_triage_quiet',
    defaultLabel: 'Quiet',
    color: 'purple',
    triage: 'quiet',
  },
  {
    slug: 'ignored',
    key: 'followers_ignored_list',
    defaultLabel: 'Ignored',
    color: 'yellow',
    audience: 'ignored',
  },
  {
    slug: 'costly',
    key: 'followers_triage_over_invested',
    defaultLabel: 'Costly',
    color: 'yellow',
    triage: 'over_invested',
  },
  {
    slug: 'bots',
    key: 'followers_bot_filter',
    defaultLabel: 'Bots',
    color: 'neutral',
    isBot: true,
  },
];

export const categoryCount = (
  categories: Record<string, number | null> | undefined,
  key: string
): number | null => {
  const value = categories?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

export const formatSegmentCount = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return Math.abs(Math.round(value)).toLocaleString('en-US');
};

export type FollowerBoardHrefInput = {
  slug?: string;
  search?: string;
  sort?: string;
  direction?: FollowerSortDirection;
  listId?: string;
};
