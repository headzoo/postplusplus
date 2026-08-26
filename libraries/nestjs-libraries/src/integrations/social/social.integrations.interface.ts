import type {
  FollowerAudience,
  FollowerInteractionWindow,
  FollowerSortDirectionValue,
  FollowerTriageFilterValue,
} from '@gitroom/nestjs-libraries/integrations/social/follower.sorts';

import { Integration } from '@prisma/client';
import { RelationshipTriage } from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.scoring';
import { ChannelStrategyId } from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.types';

export interface ClientInformation {
  client_id: string;
  client_secret: string;
  instanceUrl: string;
}
export interface IAuthenticator {
  authenticate(
    params: {
      code: string;
      codeVerifier: string;
      refresh?: string;
    },
    clientInformation?: ClientInformation
  ): Promise<AuthTokenDetails | string>;
  refreshToken(refreshToken: string): Promise<AuthTokenDetails>;
  reConnect?(
    id: string,
    requiredId: string,
    accessToken: string
  ): Promise<Omit<AuthTokenDetails, 'refreshToken' | 'expiresIn'>>;
  generateAuthUrl(
    clientInformation?: ClientInformation
  ): Promise<GenerateAuthUrlResponse>;
  analytics?(
    id: string,
    accessToken: string,
    date: number
  ): Promise<AnalyticsData[]>;
  postAnalytics?(
    integrationId: string,
    accessToken: string,
    postId: string,
    fromDate: number
  ): Promise<AnalyticsData[]>;
  changeNickname?(
    id: string,
    accessToken: string,
    name: string
  ): Promise<{ name: string }>;
  changeProfilePicture?(
    id: string,
    accessToken: string,
    url: string
  ): Promise<{ url: string }>;
  missing?(
    id: string,
    accessToken: string
  ): Promise<{ id: string; url: string }[]>;
}

export interface AnalyticsData {
  label: string;
  metricKey?: string;
  drilldownSlug?: string | null;
  data: Array<{ total: string | number; date: string }>;
  valueMode?: ChannelAnalyticsValueMode;
  displayUnit?: ChannelAnalyticsDisplayUnit;
  average?: boolean;
  percentageChange?: number;
}

/**
 * Provider-normalized liker for a published post. Omitted fields are unknown.
 * URLs must be absolute HTTP(S) URLs. Providers must never include credentials
 * or raw provider payloads.
 */
export type PostLiker = {
  id: string;
  name: string;
  username?: string;
  picture?: string;
  profileUrl?: string;
};

export type ChannelAnalyticsValueMode = 'sum' | 'average' | 'latest';

export type ChannelAnalyticsDisplayUnit =
  | 'count'
  | 'percentage'
  | 'duration'
  | 'decimal';

export type ChannelAnalyticsMetric = {
  metricKey: string;
  label: string;
  valueMode: ChannelAnalyticsValueMode;
  displayUnit?: ChannelAnalyticsDisplayUnit;
  value: number;
};

export type ChannelAnalyticsDatedPoint = ChannelAnalyticsMetric & {
  day: string;
};

export type ChannelAnalyticsPostLifetimePoint = ChannelAnalyticsMetric & {
  externalPostId: string;
};

export type ChannelAnalyticsCaptureRequest = {
  integration: Integration;
  accessToken: string;
  snapshotAt: Date;
  fromDay?: Date;
  toDay?: Date;
  pageSize: number;
  cursor?: string;
};

export type ChannelAnalyticsCapturePage =
  | {
    kind: 'daily';
    points: ChannelAnalyticsDatedPoint[];
    coverage: { fromDay: string; toDay: string };
    nextCursor?: string;
  }
  | {
    kind: 'post_lifetime';
    points: ChannelAnalyticsPostLifetimePoint[];
    /**
     * Optional account-level daily points (e.g. follower totals) persisted
     * alongside post_lifetime capture without updating coverage windows.
     */
    accountPoints?: ChannelAnalyticsDatedPoint[];
    nextCursor?: string;
  };

/**
 * Split provider-normalized daily points into deterministic, bounded pages.
 * The cursor is internal provider state and is validated before it is used.
 */
export const paginateDailyAnalyticsCapture = (
  request: ChannelAnalyticsCaptureRequest,
  coverage: { fromDay: string; toDay: string },
  points: ChannelAnalyticsDatedPoint[]
): ChannelAnalyticsCapturePage => {
  const cursor = request.cursor || '0';
  if (!/^(0|[1-9]\d*)$/.test(cursor)) {
    throw new Error('Invalid analytics capture cursor');
  }
  const offset = Number(cursor);
  if (!Number.isSafeInteger(offset) || offset > points.length) {
    throw new Error('Invalid analytics capture cursor');
  }
  const pageSize = Math.min(Math.max(request.pageSize, 1), 1_000);
  const pagePoints = points.slice(offset, offset + pageSize);
  const nextOffset = offset + pagePoints.length;

  return {
    kind: 'daily',
    coverage,
    points: pagePoints,
    ...(nextOffset < points.length ? { nextCursor: String(nextOffset) } : {}),
  };
};

export interface ChannelAnalyticsSnapshotCapability {
  capture(
    request: ChannelAnalyticsCaptureRequest
  ): Promise<ChannelAnalyticsCapturePage>;
}

export type PostRulesCapabilityMetrics = {
  likes?: boolean;
  replies?: boolean;
};

export type PostRulesCapabilityAction = {
  remove?: boolean;
  autoRepost?: boolean;
  autoPlug?: boolean;
  notify?: boolean;
};

export type PostRulesCapabilityMetadata = {
  actions: PostRulesCapabilityAction;
  metrics: PostRulesCapabilityMetrics;
};

export type PostRulesLoadMetricsResult =
  | { status: 'success'; metrics: { likes?: number; replies?: number } }
  | { status: 'not_found' }
  | { status: 'auth_error' }
  | { status: 'unsupported' }
  | { status: 'retryable_failure'; reason?: string };

export type PostRulesRemovePostResult =
  | { status: 'removed' }
  | { status: 'already_absent' }
  | { status: 'auth_error' }
  | { status: 'unsupported' }
  | { status: 'retryable_failure'; reason?: string };

export type PostRulesRepostResult =
  | { status: 'reposted'; remoteReleaseId: string }
  | { status: 'already_reposted' }
  | { status: 'auth_error' }
  | { status: 'unsupported' }
  | { status: 'retryable_failure'; reason?: string };

export type PostRulesAddPlugReplyResult =
  | { status: 'added'; remoteReleaseId: string }
  | { status: 'auth_error' }
  | { status: 'unsupported' }
  | { status: 'retryable_failure'; reason?: string };

export interface PostRulesCapability {
  metadata(): PostRulesCapabilityMetadata;

  loadMetrics(
    integration: Integration,
    accessToken: string,
    externalPostId: string
  ): Promise<PostRulesLoadMetricsResult>;

  removePost(
    integration: Integration,
    accessToken: string,
    externalPostId: string
  ): Promise<PostRulesRemovePostResult>;

  repost(
    integration: Integration,
    accessToken: string,
    externalPostId: string
  ): Promise<PostRulesRepostResult>;

  addPlugReply(
    integration: Integration,
    accessToken: string,
    externalPostId: string,
    content: string
  ): Promise<PostRulesAddPlugReplyResult>;
}

export type GenerateAuthUrlResponse = {
  url: string;
  codeVerifier: string;
  state: string;
};

export type AuthTokenDetails = {
  id: string;
  name: string;
  error?: string;
  accessToken: string; // The obtained access token
  refreshToken?: string; // The refresh token, if applicable
  expiresIn?: number; // The duration in seconds for which the access token is valid
  picture?: string;
  username: string;
  additionalSettings?: {
    title: string;
    description: string;
    type: 'checkbox' | 'text' | 'textarea';
    value: any;
    regex?: string;
  }[];
};

export type PublishedPostEditInput = {
  state: string;
  publishDate: Date;
  releaseId?: string | null;
  settings?: string | null;
};

export interface ISocialMediaIntegration {
  post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]>; // Schedules a new post

  postPending?(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]>; // Like `post`, but may return a `pending` response the workflow resolves via checkPostStatus / finalizePost

  comment?(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]>; // Schedules a new post

  editPost?(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration,
    releaseId: string
  ): Promise<PostResponse[]>;
}

export type PostResponse = {
  id: string; // The db internal id of the post
  postId: string; // The ID of the scheduled post returned by the platform
  releaseURL: string; // The URL of the post on the platform
  status: string; // Status of the operation or initial post status, 'pending' means the workflow must poll checkPostStatus
  pendingData?: any; // Opaque provider state used by checkPostStatus / finalizePost, never inspected by generic code
};

// Returned by checkPostStatus / finalizePost:
// 'pending' - the platform is still processing, poll again later
// 'ready' - processing is done, the workflow must call finalizePost to run the remaining mutations
// 'completed' - the post is fully published
//
// Contract: once finalizePost's mutations have actually gone through on the
// platform, checkPostStatus must return 'completed' - never 'ready' again -
// otherwise a finalizePost retry after an unknown-outcome failure would re-run
// the mutations and duplicate the post. The only exception: when finalizePost's
// mutation is idempotent (like setting a thumbnail), returning 'ready' again is
// allowed, since re-running it cannot duplicate anything.
export type PendingCheckResponse =
  | { status: 'pending'; pendingData: any }
  | { status: 'ready'; pendingData: any }
  | { status: 'completed'; postId: string; releaseURL: string };

export type PostDetails<T = any> = {
  id: string;
  message: string;
  settings: T;
  media?: MediaContent[];
  poll?: PollDetails;
};

export type PollDetails = {
  options: string[]; // Array of poll options
  duration: number; // Duration in hours for which the poll will be active
};

export type MediaContent = {
  type: 'image' | 'video'; // Type of the media content
  path: string;
  alt?: string;
  thumbnail?: string;
  thumbnailTimestamp?: number;
};

export type FetchPageInformationResult = {
  id: string;
  name: string;
  access_token: string;
  picture: string;
  username: string;
};

export type ChannelNoticeCategory =
  | 'mention'
  | 'reply'
  | 'like'
  | 'repost'
  | 'follow';

export type ChannelNoticeStatus =
  | {
    state: 'ok';
    unreadCount: number;
    categories?: Partial<Record<ChannelNoticeCategory, number>>;
  }
  | { state: 'unsupported' }
  | { state: 'unavailable' };

/**
 * Provider-normalized follower data. Omitted fields are unknown. URLs must be
 * absolute HTTP(S) URLs. Cursors are opaque provider data, not pagination URLs.
 * Providers must never include credentials or raw provider payloads.
 */
export type Follower = {
  id: string;
  name: string;
  username?: string;
  picture?: string;
  profileUrl?: string;
  bio?: string;
  followersCount?: number;
  followingCount?: number;
  influenceScore?: number;
  followedAt?: string;
  weFollowedAt?: string;
  isFollowed?: boolean;
  accountCreatedAt?: string;
  interactionCount?: number;
  interactionScore?: number;
  lastInteractionAt?: string;
  noteCount?: number;
  likesCount?: number;
  relationshipGrade?: number | null;
  effortScore?: number | null;
  reciprocationScore?: number | null;
  netGap?: number | null;
  effortStars?: number | null;
  reciprocationStars?: number | null;
  relationshipTriage?: RelationshipTriage | null;
  relationshipFormulaVersion?: number | null;
  relationshipSnapshotAt?: string | null;
  myGrade?: number | null;
  adjustedGrade?: number | null;
  botGrade?: number | null;
  isBot?: boolean | null;
  botConfidence?: number | null;
  botFormulaVersion?: number | null;
  botGradedAt?: string | null;
  listIds?: string[];
  isLead?: boolean;
  engagedNotYet?: boolean;
  isIgnored?: boolean;
  lastInboundAt?: string;
  lastOutboundAt?: string;
  leadBridgeScore?: number | null;
  leadFitScore?: number | null;
  leadFitReason?: string | null;
  leadBridges?: Array<{
    externalId: string;
    username?: string;
    grade?: number;
  }>;
  isCultivate?: boolean;
  cultivateReason?: string;
  isHot?: boolean;
  triageReason?: string;
  triageSource?: string;
  suggestedAction?: string;
};

export type FollowerSortDirection = FollowerSortDirectionValue;

export type FollowerSortScope = 'native' | 'page' | 'database';

export type FollowerSort = {
  key: string;
  label: string;
  directions: FollowerSortDirection[];
  defaultDirection: FollowerSortDirection;
  scope?: FollowerSortScope;
  requiresWindow?: boolean;
};

export type ChannelInteractionWindow = FollowerInteractionWindow;

export type FollowerQuery = {
  limit: number;
  cursor?: string;
  sort?: string;
  direction?: FollowerSortDirection;
  window?: ChannelInteractionWindow;
  search?: string;
  triage?: FollowerTriageFilter;
  audience?: FollowerAudience;
  listId?: string;
  isBot?: boolean;
};

export type FollowerTriageFilter = FollowerTriageFilterValue;

export type FollowerReadActor = {
  userId: string;
};

export type FollowerList = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type ChannelInteractionTrackingState =
  | 'unconfigured'
  | 'provisioning'
  | 'active'
  | 'partial'
  | 'error';

export type ChannelInteractionCoverageLevel =
  | 'supported'
  | 'partial'
  | 'unsupported';

export type ChannelInteractionTrackingFailureCategory =
  | 'configuration'
  | 'authentication'
  | 'authorization'
  | 'entitlement'
  | 'quota'
  | 'transient'
  | 'unknown';

export type ChannelInteractionKindCoverage = {
  kind: ChannelInteractionKind;
  inbound: ChannelInteractionCoverageLevel;
  outbound: ChannelInteractionCoverageLevel;
  reason?: string;
};

export type FollowerPageTracking = {
  state: ChannelInteractionTrackingState | 'unsupported';
  availability?: 'ready' | 'provisioning' | 'unavailable';
  /**
   * Rankings only include events received after tracking began. Historic
   * provider activity is never backfilled.
   */
  noBackfill: true;
  trackingStartedAt?: string;
  followerSnapshotAt?: string;
  computedAt?: string;
  failureCategory?: ChannelInteractionTrackingFailureCategory;
  reason?: string;
  failedSubscriptions?: {
    eventKey: string;
    direction: string;
    reason?: string;
  }[];
  coverage?: ChannelInteractionKindCoverage[];
};

export type FollowerPage = {
  items: Follower[];
  total?: number;
  nextCursor?: string;
  previousCursor?: string;
  hasMore: boolean;
  window?: ChannelInteractionWindow;
  tracking?: FollowerPageTracking;
};

export type MemberPostMedia = {
  url: string;
  type?: 'image' | 'video';
};

/**
 * Provider-normalized post from a channel audience member's public timeline.
 */
export type MemberPost = {
  externalId: string;
  url: string;
  content: string;
  publishedAt: string;
  media?: MemberPostMedia[];
};

export type MemberPostsQuery = {
  limit: number;
  cursor?: string;
};

export type MemberPostsPage = {
  items: MemberPost[];
  nextCursor?: string;
  hasMore: boolean;
};

export type FollowerMemberNoteAuthor = {
  id: string;
  name: string;
};

export type FollowerMemberNote = {
  id: string;
  content: string;
  author: FollowerMemberNoteAuthor;
  createdAt: string;
  updatedAt: string;
};

export type FollowerMemberInteraction = {
  id: string;
  kind: ChannelInteractionKind;
  direction: ChannelInteractionDirection;
  timestamp: string;
  relatedObjectId?: string;
};

export type FollowerRelationshipSnapshot = {
  snapshotAt: string;
  windowStartedAt: string;
  effortScore: number;
  reciprocationScore: number;
  reciprocity: number | null;
  grade: number | null;
  adjustedGrade: number | null;
  effortStars: number;
  reciprocationStars: number;
  triage: RelationshipTriage | null;
  formulaVersion: number;
  strategyId?: ChannelStrategyId;
  strategyVersion?: number;
};

export type FollowerRelationship = {
  windowDays: 30;
  cadenceDays: 3;
  formulaVersion: number;
  current: FollowerRelationshipSnapshot | null;
  history: FollowerRelationshipSnapshot[];
};

export type FollowerMemberDetail = {
  follower: Follower;
  notes: FollowerMemberNote[];
  interactions: FollowerMemberInteraction[];
  relationship: FollowerRelationship;
  myGrade: number | null;
  tracking?: FollowerPageTracking;
};

export type ChannelInteractionDirection = 'inbound' | 'outbound';

export type ChannelInteractionKind =
  | 'like'
  | 'reply'
  | 'repost'
  | 'follow'
  | 'mention';

export type ChannelAudienceMembership = 'follower' | 'not_follower' | 'unknown';

export type ChannelInteractionCounterparty = {
  externalId: string;
  name?: string;
  username?: string;
  picture?: string;
  profileUrl?: string;
};

export type NormalizedChannelInteractionEvent = {
  providerEventKey: string;
  kind: ChannelInteractionKind;
  direction: ChannelInteractionDirection;
  eventAt: string;
  counterparty: ChannelInteractionCounterparty;
  relatedObjectId?: string;
  metadata?: Record<string, string>;
  normalizationVersion: number;
  membershipUpdate?: ChannelAudienceMembership;
  eventType?: string;
};

export type NormalizedChannelContentEvent =
  | {
    type: 'post.upsert';
    externalId: string;
    url: string;
    content: string;
    publishedAt: string;
  }
  | {
    type: 'post.delete';
    externalId: string;
    deletedAt: string;
  };

export type ChannelWebhookChallengeRequest = {
  query: Record<string, string | string[] | undefined>;
};

export type ChannelWebhookChallengeResult =
  | { accepted: true; responseBody: Record<string, string> }
  | { accepted: false; statusCode?: number };

export type ChannelWebhookDeliveryRequest = {
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
};

export type ChannelWebhookDeliveryResult =
  | {
    accepted: true;
    connectedAccountId: string;
    events: NormalizedChannelInteractionEvent[];
    contentEvents?: NormalizedChannelContentEvent[];
  }
  | { accepted: false; statusCode?: number };

export type DesiredChannelInteractionSubscription = {
  eventKey: string;
  direction: ChannelInteractionDirection;
};

export type ReconciledChannelInteractionSubscription = {
  eventKey: string;
  direction: ChannelInteractionDirection;
  remoteIdentifier?: string;
  state: ChannelInteractionTrackingState;
  failureCategory?: ChannelInteractionTrackingFailureCategory;
  reason?: string;
};

export type ChannelInteractionSubscriptionReconciliationResult = {
  state: ChannelInteractionTrackingState;
  subscriptions: ReconciledChannelInteractionSubscription[];
  coverage: ChannelInteractionKindCoverage[];
};

export type ProviderWebhookEndpointReconciliationResult = {
  state: ChannelInteractionTrackingState;
  remoteWebhookId?: string;
  failureCategory?: ChannelInteractionTrackingFailureCategory;
  reason?: string;
};

export type ChannelInteractionAuthorizationGrant = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scopes?: string[];
};

export interface ChannelInteractionAuthorizationCapability {
  generateAuthUrl(): Promise<GenerateAuthUrlResponse>;
  authenticate(params: {
    code: string;
    codeVerifier: string;
  }): Promise<ChannelInteractionAuthorizationGrant>;
  refreshToken(
    refreshToken: string
  ): Promise<ChannelInteractionAuthorizationGrant>;
}

export interface ChannelInteractionWebhooksCapability {
  verifyChallenge(
    request: ChannelWebhookChallengeRequest
  ): Promise<ChannelWebhookChallengeResult>;
  verifyAndNormalizeDelivery(
    request: ChannelWebhookDeliveryRequest
  ): Promise<ChannelWebhookDeliveryResult>;
  getDesiredSubscriptions(
    integration: Integration
  ): DesiredChannelInteractionSubscription[];
  getInteractionCoverage(): ChannelInteractionKindCoverage[];
  reconcileEndpoint?(): Promise<ProviderWebhookEndpointReconciliationResult>;
  // Some providers require a separate user grant before private events can be
  // subscribed to; the resulting token is supplied to reconcileSubscriptions.
  authorization?: ChannelInteractionAuthorizationCapability;
  reconcileSubscriptions(
    integration: Integration,
    accessToken: string,
    authorizationToken?: string
  ): Promise<ChannelInteractionSubscriptionReconciliationResult>;
}

export interface SocialProvider
  extends IAuthenticator,
  ISocialMediaIntegration {
  identifier: string;
  isConfigured?: () => boolean;
  refreshWait?: boolean;
  convertToJPEG?: boolean;
  stripLinks?: () => boolean;
  refreshCron?: boolean;
  dto?: any;
  maxLength: (additionalSettings?: any, settings?: any) => number;
  checkValidity(
    posts: Array<{ path: string; thumbnail?: string }[]>,
    settings: any,
    additionalSettings: any[]
  ): Promise<string | true>;
  checkPostStatus(
    accessToken: string,
    pendingData: any,
    integration: Integration
  ): Promise<PendingCheckResponse>;
  finalizePost(
    accessToken: string,
    pendingData: any,
    integration: Integration
  ): Promise<PendingCheckResponse>;
  isWeb3?: boolean;
  isChromeExtension?: boolean;
  extensionCookies?: { name: string; domain: string }[];
  editor: 'none' | 'normal' | 'markdown' | 'html';
  customFields?: () => Promise<
    {
      key: string;
      label: string;
      defaultValue?: string;
      validation: string;
      type: 'text' | 'password';
      hint?: string;
    }[]
  >;
  name: string;
  toolTip?: string;
  oneTimeToken?: boolean;
  isBetweenSteps: boolean;
  scopes: string[];
  externalUrl?: (
    url: string
  ) => Promise<{ client_id: string; client_secret: string }>;
  mention?: (
    token: string,
    data: { query: string },
    id: string,
    integration: Integration
  ) => Promise<
    | { id: string; label: string; image: string; doNotCache?: boolean }[]
    | { none: true }
  >;
  mentionFormat?(idOrHandle: string, name: string): string;
  fetchPageInformation?(
    accessToken: string,
    data: any
  ): Promise<FetchPageInformationResult>;
  profileUrl?(integration: Integration): string | undefined;
  channelNotices?(
    integration: Integration,
    accessToken: string,
    since: Date
  ): Promise<ChannelNoticeStatus>;
  followerSorts?: FollowerSort[];
  followers?(
    integration: Integration,
    accessToken: string,
    query: FollowerQuery
  ): Promise<FollowerPage>;
  memberFollowers?(
    integration: Integration,
    accessToken: string,
    externalId: string,
    query: FollowerQuery
  ): Promise<FollowerPage>;
  memberPosts?(
    integration: Integration,
    accessToken: string,
    externalId: string,
    query: MemberPostsQuery
  ): Promise<MemberPostsPage>;
  /**
   * Resolve a pasted profile URL to a Follower whose `id` matches what
   * `followers()` stores. Return null when the URL is not for this provider
   * or the account cannot be found.
   */
  resolveAudienceProfileFromUrl?(
    accessToken: string,
    integration: Integration,
    url: string
  ): Promise<Follower | null>;
  followAudienceMember?(
    integration: Integration,
    accessToken: string,
    externalId: string
  ): Promise<void>;
  postLikers?(
    integration: Integration,
    accessToken: string,
    postId: string
  ): Promise<PostLiker[]>;
  supportsEdit?(
    post: PublishedPostEditInput,
    integration: Integration
  ): boolean;
  channelInteractionWebhooks?: ChannelInteractionWebhooksCapability;
  analyticsSnapshot?: ChannelAnalyticsSnapshotCapability;
  postRules?: PostRulesCapability;
}
