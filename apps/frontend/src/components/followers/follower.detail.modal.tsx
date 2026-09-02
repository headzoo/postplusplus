'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import { Button } from '@gitroom/react/form/button';
import { Textarea } from '@gitroom/react/form/textarea';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useDecisionModal } from '@gitroom/frontend/components/layout/new-modal';
import { FollowerRelationshipChart } from '@gitroom/frontend/components/followers/follower.relationship.chart';
import {
  DismissTriageOptions,
  FollowerIdentityBadges,
} from '@gitroom/frontend/components/followers/follower.card';
import { RelationshipStars } from '@gitroom/frontend/components/followers/follower.relationship.stars';
import { CustomScrollArea } from '@gitroom/frontend/components/ui/custom.scroll.area';
import {
  ResetIcon,
  TimelineIcon,
  SparkleIcon,
} from '@gitroom/frontend/components/ui/icons';
import { launchFollowerCopilotChat } from '@gitroom/frontend/components/followers/use.copilot.follower.assistant';
import {
  ChannelInteractionKind,
  FollowerMemberDetail,
  FollowerMemberInteraction,
  FollowerMemberNote,
  RelationshipScoreDirection,
  DismissibleTriage,
  useFollowerDetail,
  buildFollowerTimelineHref,
  useFollowerChannels,
  useFollowerGradeMutation,
  useFollowerListMutations,
  useFollowerLists,
  useFollowerNoteMutations,
  useFollowerRelationshipScoreMutation,
  FollowerList,
} from '@gitroom/frontend/components/followers/use.followers';
import { LeadFitDismissReason } from '@gitroom/nestjs-libraries/dtos/integrations/lead-fit-feedback.types';

const INTERACTION_SENTENCE_LABELS: Record<
  ChannelInteractionKind,
  {
    inbound: { key: string; defaultLabel: string };
    outbound: { key: string; defaultLabel: string };
  }
> = {
  like: {
    inbound: {
      key: 'followers_interaction_like_inbound',
      defaultLabel: 'They liked you',
    },
    outbound: {
      key: 'followers_interaction_like_outbound',
      defaultLabel: 'You liked them',
    },
  },
  reply: {
    inbound: {
      key: 'followers_interaction_reply_inbound',
      defaultLabel: 'They replied to you',
    },
    outbound: {
      key: 'followers_interaction_reply_outbound',
      defaultLabel: 'You replied to them',
    },
  },
  repost: {
    inbound: {
      key: 'followers_interaction_repost_inbound',
      defaultLabel: 'They reposted you',
    },
    outbound: {
      key: 'followers_interaction_repost_outbound',
      defaultLabel: 'You reposted them',
    },
  },
  follow: {
    inbound: {
      key: 'followers_interaction_follow_inbound',
      defaultLabel: 'They followed you',
    },
    outbound: {
      key: 'followers_interaction_follow_outbound',
      defaultLabel: 'You followed them',
    },
  },
  mention: {
    inbound: {
      key: 'followers_interaction_mention_inbound',
      defaultLabel: 'They mentioned you',
    },
    outbound: {
      key: 'followers_interaction_mention_outbound',
      defaultLabel: 'You mentioned them',
    },
  },
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatShortDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatCompactCount = (value: number) => {
  const count = Math.abs(Math.round(value));
  if (count < 10000) {
    return count.toLocaleString('en-US');
  }
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(count);
};

const CONVERSION_TYPE_LABELS: Record<string, string> = {
  follower_gained: 'Follower gained',
  website_goal: 'Website goal',
  amplification_threshold: 'Amplification',
  support_sla_hit: 'Support SLA',
  support_issue_resolved: 'Support resolved',
};

const formatConversionTypeLabel = (conversionType: string) =>
  CONVERSION_TYPE_LABELS[conversionType] ??
  conversionType
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const formatReciprocity = (value: number | null) => {
  if (value == null) {
    return '—';
  }
  return `${Math.round(value * 100)}%`;
};

const InteractionRow: FC<{
  interaction: FollowerMemberInteraction;
}> = ({ interaction }) => {
  const t = useT();
  const labels = INTERACTION_SENTENCE_LABELS[interaction.kind];
  const direction =
    interaction.direction === 'inbound' ? 'inbound' : 'outbound';
  const sentence = labels?.[direction];
  const headline = sentence
    ? t(sentence.key, sentence.defaultLabel)
    : t(
      `followers_interaction_${interaction.kind}_${direction}`,
      interaction.direction === 'inbound'
        ? `They ${interaction.kind} you`
        : `You ${interaction.kind} them`
    );
  const timestamp = formatDate(interaction.timestamp);

  return (
    <li className="flex flex-col gap-[2px] rounded-[8px] border border-newTableBorder bg-newTableHeader px-[12px] py-[10px] text-[13px]">
      <div className="text-newTextColor">
        <span className="font-[600]">{headline}</span>
      </div>
      {timestamp && <span className="text-textItemBlur">{timestamp}</span>}
    </li>
  );
};

const NoteCard: FC<{
  note: FollowerMemberNote;
  onUpdate: (noteId: string, content: string) => Promise<void>;
  onDelete: (noteId: string) => Promise<void>;
}> = ({ note, onUpdate, onDelete }) => {
  const t = useT();
  const decision = useDecisionModal();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const [error, setError] = useState('');
  const [isPending, setIsPending] = useState(false);

  const handleSave = useCallback(async () => {
    setError('');
    setIsPending(true);
    try {
      await onUpdate(note.id, draft);
      setIsEditing(false);
    } catch {
      setError(
        t('followers_note_save_error', 'Could not save this note. Try again.')
      );
    } finally {
      setIsPending(false);
    }
  }, [draft, note.id, onUpdate, t]);

  const handleDelete = useCallback(async () => {
    const approved = await decision.open({
      title: t('followers_note_delete_title', 'Delete note?'),
      description: t(
        'followers_note_delete_description',
        'This note will be permanently removed for your team.'
      ),
      approveLabel: t('delete', 'Delete'),
      cancelLabel: t('cancel', 'Cancel'),
    });
    if (!approved) {
      return;
    }
    setError('');
    try {
      setIsPending(true);
      await onDelete(note.id);
    } catch {
      setError(
        t(
          'followers_note_delete_error',
          'Could not delete this note. Try again.'
        )
      );
    } finally {
      setIsPending(false);
    }
  }, [decision, note.id, onDelete, t]);

  const createdAt = formatDate(note.createdAt);
  const updatedAt =
    note.updatedAt !== note.createdAt ? formatDate(note.updatedAt) : null;

  return (
    <div className="flex flex-col gap-[8px] rounded-[10px] border border-newTableBorder bg-newTableHeader p-[12px]">
      {isEditing ? (
        <>
          <Textarea
            label=""
            name={`note-edit-${note.id}`}
            disableForm={true}
            className="box-border w-full max-w-full"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          {error && <p className="text-[13px] text-red-400">{error}</p>}
          <div className="flex gap-[8px]">
            <Button disabled={isPending || !draft.trim()} onClick={handleSave}>
              {t('save', 'Save')}
            </Button>
            <Button
              secondary
              disabled={isPending}
              onClick={() => {
                setDraft(note.content);
                setIsEditing(false);
                setError('');
              }}
            >
              {t('cancel', 'Cancel')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words text-[14px] text-newTextColor">
            {note.content}
          </p>
          <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[4px] text-[12px] text-textItemBlur">
            <span>{note.author.name}</span>
            {createdAt && <span>{createdAt}</span>}
            {updatedAt && (
              <span>
                {t('followers_note_updated', 'Updated {{date}}', {
                  date: updatedAt,
                })}
              </span>
            )}
          </div>
          {error && <p className="text-[13px] text-red-400">{error}</p>}
          <div className="flex gap-[8px]">
            <button
              type="button"
              className="text-[13px] text-newTextColor hover:underline"
              disabled={isPending}
              onClick={() => setIsEditing(true)}
            >
              {t('edit', 'Edit')}
            </button>
            <button
              type="button"
              className="text-[13px] text-red-400 hover:underline"
              disabled={isPending}
              onClick={handleDelete}
            >
              {t('delete', 'Delete')}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const FollowerDetailContent: FC<{
  detail: FollowerMemberDetail;
  integrationId: string;
  externalId: string;
  mutate: () => Promise<FollowerMemberDetail | undefined>;
  close?: () => void;
}> = ({ detail, integrationId, externalId, mutate, close }) => {
  const t = useT();
  const toast = useToaster();
  const { data: channels = [] } = useFollowerChannels();
  const { data: followerLists = [] } = useFollowerLists(integrationId);
  const canFollowAudienceMember = !!channels.find(
    (channel) => channel.id === integrationId
  )?.canFollowAudienceMember;
  const [newNote, setNewNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [isNotePending, setIsNotePending] = useState(false);
  const [gradeError, setGradeError] = useState('');
  const [isGradePending, setIsGradePending] = useState(false);
  const [scoreError, setScoreError] = useState('');
  const [pendingScoreDirection, setPendingScoreDirection] =
    useState<RelationshipScoreDirection | null>(null);

  const revalidateDetail = useCallback(() => mutate(), [mutate]);
  const { createNote, updateNote, deleteNote } = useFollowerNoteMutations(
    integrationId,
    externalId,
    revalidateDetail
  );
  const { updateGrade } = useFollowerGradeMutation(
    integrationId,
    externalId,
    revalidateDetail
  );
  const { refreshScore } = useFollowerRelationshipScoreMutation(
    integrationId,
    externalId,
    revalidateDetail
  );
  const {
    ignoreTriage,
    followMember,
    addMember,
    removeMember,
    ignoreFollower,
    unignoreFollower,
  } = useFollowerListMutations(integrationId);

  const handleDismissTriage = useCallback(
    async (
      triage: DismissibleTriage,
      reasons?: LeadFitDismissReason[],
      options?: DismissTriageOptions
    ) => {
      if (triage === 'lead' && options?.follow) {
        try {
          await followMember(externalId);
          await revalidateDetail();
          close?.();
        } catch (error) {
          toast.show(
            error instanceof Error
              ? error.message
              : t(
                'followers_lead_follow_error',
                'Could not follow this profile'
              ),
            'warning'
          );
        }
        return;
      }
      if (triage === 'lead' && options?.moveToListId) {
        await addMember(options.moveToListId, externalId);
        await revalidateDetail();
        close?.();
        return;
      }
      await ignoreTriage(externalId, triage, reasons, options);
      await revalidateDetail();
      close?.();
    },
    [
      addMember,
      close,
      externalId,
      followMember,
      ignoreTriage,
      revalidateDetail,
      t,
      toast,
    ]
  );

  const handleToggleList = useCallback(
    async (list: FollowerList, assigned: boolean) => {
      if (assigned) {
        await removeMember(list.id, externalId);
      } else {
        await addMember(list.id, externalId);
      }
      await revalidateDetail();
    },
    [addMember, externalId, removeMember, revalidateDetail]
  );

  const handleToggleIgnored = useCallback(
    async (ignored: boolean) => {
      if (ignored) {
        await ignoreFollower(externalId);
      } else {
        await unignoreFollower(externalId);
      }
      await revalidateDetail();
    },
    [externalId, ignoreFollower, revalidateDetail, unignoreFollower]
  );

  const sortedNotes = useMemo(
    () =>
      [...detail.notes].sort(
        (left, right) =>
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime()
      ),
    [detail.notes]
  );

  const current = detail.relationship.current;
  const chartHistory = useMemo(() => {
    if (detail.relationship.history.length) {
      return detail.relationship.history;
    }
    return current ? [current] : [];
  }, [current, detail.relationship.history]);

  const handleSelectGrade = useCallback(
    async (grade: number) => {
      setGradeError('');
      setIsGradePending(true);
      try {
        await updateGrade(grade);
      } catch {
        setGradeError(
          t(
            'followers_grade_save_error',
            'Could not save your grade. Try again.'
          )
        );
      } finally {
        setIsGradePending(false);
      }
    },
    [t, updateGrade]
  );

  const handleRefreshScore = useCallback(
    async (direction: RelationshipScoreDirection) => {
      setScoreError('');
      setPendingScoreDirection(direction);
      try {
        await refreshScore(direction);
      } catch {
        setScoreError(
          t(
            'followers_score_refresh_error',
            'Could not refresh this score. Try again.'
          )
        );
      } finally {
        setPendingScoreDirection(null);
      }
    },
    [refreshScore, t]
  );

  const handleCreateNote = useCallback(async () => {
    const trimmed = newNote.trim();
    if (!trimmed) {
      return;
    }
    setNoteError('');
    setIsNotePending(true);
    try {
      await createNote(trimmed);
      setNewNote('');
    } catch {
      setNoteError(
        t('followers_note_create_error', 'Could not add this note. Try again.')
      );
    } finally {
      setIsNotePending(false);
    }
  }, [createNote, newNote, t]);

  const handleUpdateNote = useCallback(
    async (noteId: string, content: string) => {
      await updateNote(noteId, content);
    },
    [updateNote]
  );

  const handleDeleteNote = useCallback(
    async (noteId: string) => {
      await deleteNote(noteId);
    },
    [deleteNote]
  );

  const follower = detail.follower;
  const handle = follower.username ? `@${follower.username}` : undefined;
  const accountCreatedAt = follower.accountCreatedAt
    ? formatShortDate(follower.accountCreatedAt)
    : null;
  const conversionLabel = follower.latestConversionType
    ? formatConversionTypeLabel(follower.latestConversionType)
    : null;
  const convertedAt = follower.lastConvertedAt
    ? formatShortDate(follower.lastConvertedAt)
    : null;

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-[20px] overflow-x-hidden">
      <div className="flex items-start justify-between gap-[12px]">
        <div className="flex items-start gap-[12px] min-w-0 flex-1">
          {follower.profileUrl ? (
            <a
              href={follower.profileUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="shrink-0 rounded-full hover:opacity-80"
              aria-label={t(
                'followers_view_profile_for',
                'View profile for {{name}}',
                { name: follower.name }
              )}
            >
              <ImageWithFallback
                fallbackSrc="/no-picture.jpg"
                src={follower.picture || '/no-picture.jpg'}
                className="rounded-full shrink-0 object-cover"
                alt={follower.name}
                width={48}
                height={48}
              />
            </a>
          ) : (
            <ImageWithFallback
              fallbackSrc="/no-picture.jpg"
              src={follower.picture || '/no-picture.jpg'}
              className="rounded-full shrink-0 object-cover"
              alt={follower.name}
              width={48}
              height={48}
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-[8px]">
              <h3 className="text-[15px] font-[600] text-newTextColor truncate">
                {follower.name}
              </h3>
              <FollowerIdentityBadges
                follower={follower}
                lists={followerLists}
                canFollow={canFollowAudienceMember}
                onDismissTriage={handleDismissTriage}
                onToggleList={handleToggleList}
                onToggleIgnored={handleToggleIgnored}
              />
            </div>
            {handle &&
              (follower.profileUrl ? (
                <a
                  href={follower.profileUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-block w-fit max-w-full text-[13px] text-textItemBlur truncate hover:underline hover:opacity-80"
                >
                  {handle}
                </a>
              ) : (
                <p className="text-[13px] text-textItemBlur truncate">
                  {handle}
                </p>
              ))}
            {(Number.isFinite(follower.followingCount) ||
              Number.isFinite(follower.followersCount) ||
              accountCreatedAt ||
              (conversionLabel && convertedAt)) && (
                <div className="mt-[6px] grid grid-cols-1 gap-x-[20px] gap-y-[6px] text-[13px] sm:grid-cols-2 xl:grid-cols-3">
                  {Number.isFinite(follower.followingCount) && (
                    <span className="min-w-0">
                      <span className="font-[700] text-newTextColor">
                        {formatCompactCount(follower.followingCount!)}
                      </span>{' '}
                      <span className="text-textItemBlur">
                        {t('followers_following_label', 'Following')}
                      </span>
                    </span>
                  )}
                  {Number.isFinite(follower.followersCount) && (
                    <span className="min-w-0">
                      <span className="font-[700] text-newTextColor">
                        {formatCompactCount(follower.followersCount!)}
                      </span>{' '}
                      <span className="text-textItemBlur">
                        {t('followers_followers_label', 'Followers')}
                      </span>
                    </span>
                  )}
                  {accountCreatedAt && (
                    <span className="min-w-0">
                      <span className="font-[700] text-newTextColor">
                        {t('followers_joined_label', 'Joined')}
                      </span>{' '}
                      <span className="text-textItemBlur">
                        {accountCreatedAt}
                      </span>
                    </span>
                  )}
                  {conversionLabel && convertedAt && (
                    <span
                      className="min-w-0"
                      data-testid="followers-conversion-recorded"
                    >
                      <span className="font-[700] text-newTextColor">
                        {conversionLabel}
                      </span>{' '}
                      <span className="text-textItemBlur">{convertedAt}</span>
                    </span>
                  )}
                </div>
              )}
            {follower.bio && (
              <p className="mt-[8px] whitespace-pre-wrap break-words text-[13px] text-newTextColor">
                {follower.bio}
              </p>
            )}
          </div>
        </div>
        {follower.username && (
          <div className="flex shrink-0 items-center gap-[8px]">
            <button
              type="button"
              onClick={() => launchFollowerCopilotChat(follower.username!)}
              className={clsx(
                'inline-flex h-[28px] w-[28px] items-center justify-center rounded-full border',
                'border-newTableBorder text-textItemBlur hover:border-newTextColor/40 hover:text-newTextColor'
              )}
              aria-label={t(
                'followers_ask_ai_about',
                'Ask AI about @{{username}}',
                { username: follower.username }
              )}
            >
              <SparkleIcon size={14} />
            </button>
            <Link
              href={buildFollowerTimelineHref(
                integrationId,
                follower.username,
                externalId
              )}
              className={clsx(
                'inline-flex h-[28px] w-[28px] items-center justify-center rounded-full border',
                'border-newTableBorder text-textItemBlur hover:border-newTextColor/40 hover:text-newTextColor'
              )}
              aria-label={t('followers_timeline_button', 'Timeline')}
            >
              <TimelineIcon size={14} />
            </Link>
          </div>
        )}
      </div>

      {(follower.botGrade != null ||
        follower.isBot != null ||
        follower.botConfidence != null) && (
          <section className="flex flex-col gap-[8px] text-[13px] text-textItemBlur">
            <h4 className="text-[16px] font-[600] text-newTextColor">
              {t('followers_bot_classification', 'Bot classification')}
            </h4>
            <div className="flex max-w-full flex-wrap items-center gap-x-[8px] gap-y-[4px]">
              <span className="min-w-0 max-w-full break-words">
                {follower.isBot === true
                  ? t('followers_bot_status_likely', 'Likely bot')
                  : follower.isBot === false
                    ? t('followers_bot_status_unlikely', 'Likely human')
                    : t('followers_bot_status_uncertain', 'Not enough data')}
              </span>
              {follower.botGrade != null && (
                <>
                  <span aria-hidden="true" className="shrink-0">
                    ·
                  </span>
                  <span className="min-w-0 max-w-full break-words">
                    {t('followers_bot_grade_label', 'Grade {{grade}} of 5', {
                      grade: String(follower.botGrade),
                    })}
                  </span>
                </>
              )}
              {follower.botConfidence != null && (
                <>
                  <span aria-hidden="true" className="shrink-0">
                    ·
                  </span>
                  <span className="min-w-0 max-w-full break-words">
                    {t('followers_bot_confidence_label', 'Confidence {{pct}}%', {
                      pct: String(Math.round(follower.botConfidence * 100)),
                    })}
                  </span>
                </>
              )}
            </div>
          </section>
        )}

      <section className="flex min-w-0 flex-col gap-[12px]">
        <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-3">
          <div className="flex flex-col gap-[8px]">
            <div className="flex items-center gap-[8px]">
              <h4 className="text-[16px] font-[600] text-newTextColor">
                {t('followers_their_effort', 'Their effort')}
              </h4>
              <button
                type="button"
                className="text-textItemBlur hover:text-newTextColor disabled:opacity-50"
                disabled={pendingScoreDirection !== null}
                aria-label={t(
                  'followers_refresh_their_effort',
                  'Refresh their effort'
                )}
                onClick={() => handleRefreshScore('their')}
              >
                <ResetIcon
                  size={16}
                  className={clsx(
                    pendingScoreDirection === 'their' && 'animate-spin'
                  )}
                />
              </button>
            </div>
            <RelationshipStars grade={current?.reciprocationStars ?? null} />
          </div>
          <div className="flex flex-col gap-[8px]">
            <div className="flex items-center gap-[8px]">
              <h4 className="text-[16px] font-[600] text-newTextColor">
                {t('followers_your_effort', 'Your effort')}
              </h4>
              <button
                type="button"
                className="text-textItemBlur hover:text-newTextColor disabled:opacity-50"
                disabled={pendingScoreDirection !== null}
                aria-label={t(
                  'followers_refresh_your_effort',
                  'Refresh your effort'
                )}
                onClick={() => handleRefreshScore('your')}
              >
                <ResetIcon
                  size={16}
                  className={clsx(
                    pendingScoreDirection === 'your' && 'animate-spin'
                  )}
                />
              </button>
            </div>
            <RelationshipStars grade={current?.effortStars ?? null} />
          </div>
          <div className="flex flex-col gap-[8px]">
            <h4 className="text-[16px] font-[600] text-newTextColor">
              {t('followers_your_grade', 'Your grade')}
            </h4>
            <RelationshipStars
              grade={detail.myGrade}
              interactive={true}
              disabled={isGradePending}
              onSelect={handleSelectGrade}
            />
            {gradeError && (
              <p className="text-[13px] text-red-400">{gradeError}</p>
            )}
          </div>
        </div>
        {scoreError && <p className="text-[13px] text-red-400">{scoreError}</p>}
        {current && (
          <div className="flex flex-col gap-[8px]">
            <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[6px] text-[13px] text-textItemBlur">
              <p>
                {t(
                  'followers_grade_snapshot',
                  'Snapshot {{date}} · {{days}}-day window',
                  {
                    date:
                      formatShortDate(current.snapshotAt) || current.snapshotAt,
                    days: detail.relationship.windowDays,
                  }
                )}
              </p>
              <p>
                {t('followers_grade_reciprocity', 'Reciprocity: {{value}}', {
                  value: formatReciprocity(current.reciprocity),
                })}
              </p>
            </div>
            <h4 className="text-[16px] font-[600] text-newTextColor">
              {t('followers_relationship_grade', 'Relationship grade')}
            </h4>
            <p className="text-[13px] text-textItemBlur">
              {t(
                'followers_grade_score_metadata',
                'E: {{effort}} · R: {{reciprocation}} · Gap: {{gap}}',
                {
                  effort: current.effortScore,
                  reciprocation: current.reciprocationScore,
                  gap:
                    current.reciprocationScore - current.effortScore >= 0
                      ? `+${current.reciprocationScore - current.effortScore}`
                      : String(
                        current.reciprocationScore - current.effortScore
                      ),
                }
              )}
            </p>
          </div>
        )}
        {chartHistory.length > 0 && (
          <FollowerRelationshipChart history={chartHistory} />
        )}
      </section>

      <section className="flex min-w-0 flex-col gap-[12px]">
        <h4 className="text-[16px] font-[600] text-newTextColor">
          {t('followers_notes', 'Notes')}
        </h4>
        {sortedNotes.length ? (
          <div className="flex min-w-0 flex-col gap-[10px]">
            {sortedNotes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onUpdate={handleUpdateNote}
                onDelete={handleDeleteNote}
              />
            ))}
          </div>
        ) : (
          <p className="text-[14px] text-textItemBlur">
            {t('followers_no_notes', 'No notes yet. Add one for your team.')}
          </p>
        )}
        <div className="flex min-w-0 flex-col gap-[8px]">
          <Textarea
            label={t('followers_add_note', 'Add a note')}
            name="follower-new-note"
            disableForm={true}
            className="box-border w-full max-w-full"
            value={newNote}
            onChange={(event) => setNewNote(event.target.value)}
          />
          {noteError && <p className="text-[13px] text-red-400">{noteError}</p>}
          <div>
            <Button
              disabled={isNotePending || !newNote.trim()}
              onClick={handleCreateNote}
            >
              {t('followers_add_note_button', 'Add note')}
            </Button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-[12px]">
        <h4 className="text-[16px] font-[600] text-newTextColor">
          {t('followers_recent_interactions', 'Recent interactions')}
        </h4>
        {detail.interactions.length ? (
          <CustomScrollArea maxHeight="300px">
            <ul className="flex flex-col gap-[8px]">
              {detail.interactions.map((interaction) => (
                <InteractionRow
                  key={interaction.id}
                  interaction={interaction}
                />
              ))}
            </ul>
          </CustomScrollArea>
        ) : (
          <p className="text-[14px] text-textItemBlur">
            {t(
              'followers_no_interactions',
              'No tracked interactions yet for this follower.'
            )}
          </p>
        )}
      </section>
    </div>
  );
};

export const FollowerDetailModal: FC<{
  integrationId: string;
  externalId?: string;
  username?: string;
  close?: () => void;
}> = ({ integrationId, externalId, username, close }) => {
  const t = useT();
  const { data, error, isLoading, mutate } = useFollowerDetail(integrationId, {
    externalId,
    username,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <LoadingComponent />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center gap-[12px] py-[24px] text-center">
        <p className="text-[16px] text-newTextColor">
          {t(
            'followers_detail_error',
            'We could not load this follower right now.'
          )}
        </p>
        <Button onClick={() => mutate()}>
          {t('followers_retry', 'Retry')}
        </Button>
      </div>
    );
  }

  return (
    <FollowerDetailContent
      detail={data}
      integrationId={integrationId}
      externalId={data.follower.id}
      mutate={mutate}
      close={close}
    />
  );
};
