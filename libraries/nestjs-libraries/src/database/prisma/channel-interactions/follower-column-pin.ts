export const FOLLOWER_COLUMN_PIN_COLUMNS = [
  'hot',
  'cultivate',
  'mutual',
  'quiet',
  'costly',
  'converted',
  'bots',
] as const;

export type FollowerColumnPinColumn =
  (typeof FOLLOWER_COLUMN_PIN_COLUMNS)[number];

export const FOLLOWER_BOARD_MOVE_FORBIDDEN_SEGMENTS = [
  'leads',
  'followed',
  'unfollowed',
] as const;

export type FollowerBoardMoveForbiddenSegment =
  (typeof FOLLOWER_BOARD_MOVE_FORBIDDEN_SEGMENTS)[number];

export const FOLLOWER_BOARD_MOVE_ALLOWED_SEGMENTS = [
  'hot',
  'cultivate',
  'mutual',
  'quiet',
  'costly',
  'ignored',
  'conversions',
  'bots',
] as const;

export type FollowerBoardMoveAllowedSegment =
  (typeof FOLLOWER_BOARD_MOVE_ALLOWED_SEGMENTS)[number];

export const MANUAL_TRIAGE_PICK_SOURCE = 'manual';
export const MANUAL_TRIAGE_PICK_REASON = 'Manually added';

export const segmentSlugToColumnPin = (
  slug: string
): FollowerColumnPinColumn | null => {
  switch (slug) {
    case 'hot':
      return 'hot';
    case 'cultivate':
      return 'cultivate';
    case 'mutual':
      return 'mutual';
    case 'quiet':
      return 'quiet';
    case 'costly':
      return 'costly';
    case 'conversions':
      return 'converted';
    case 'bots':
      return 'bots';
    default:
      return null;
  }
};

export const columnPinToRelationshipTriage = (
  column: FollowerColumnPinColumn
): 'mutual' | 'quiet' | 'over_invested' | null => {
  switch (column) {
    case 'mutual':
      return 'mutual';
    case 'quiet':
      return 'quiet';
    case 'costly':
      return 'over_invested';
    default:
      return null;
  }
};

export const relationshipTriageToColumnPin = (
  triage: string
): FollowerColumnPinColumn | null => {
  switch (triage) {
    case 'mutual':
      return 'mutual';
    case 'quiet':
      return 'quiet';
    case 'over_invested':
      return 'costly';
    case 'hot_lead':
    case 'engaged_not_yet':
      return 'hot';
    case 'cultivate':
      return 'cultivate';
    default:
      return null;
  }
};

export const isFollowerColumnPinColumn = (
  value: string
): value is FollowerColumnPinColumn =>
  (FOLLOWER_COLUMN_PIN_COLUMNS as readonly string[]).includes(value);

export const isFollowerBoardMoveAllowedSegment = (
  value: string
): value is FollowerBoardMoveAllowedSegment =>
  (FOLLOWER_BOARD_MOVE_ALLOWED_SEGMENTS as readonly string[]).includes(value);

export const isFollowerBoardMoveForbiddenSegment = (
  value: string
): value is FollowerBoardMoveForbiddenSegment =>
  (FOLLOWER_BOARD_MOVE_FORBIDDEN_SEGMENTS as readonly string[]).includes(value);
