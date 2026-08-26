'use client';

import React, { FC, KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useSWRConfig } from 'swr';
import {
  ChannelStrategyPublicSummary,
  channelStrategyOptions,
} from '@gitroom/frontend/components/settings/use.channel.details';
import { FALLBACK_CHANNEL_STRATEGY_ID } from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.registry';
import type { ChannelStrategyId } from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.types';
import {
  CheckmarkIcon,
  HeadsetIcon,
  MagnetIcon,
  MegaphoneIcon,
  ResetIcon,
  SpeechBubblesIcon,
  StarOutlineIcon,
  TargetIcon,
  UsersGroupIcon,
} from '@gitroom/frontend/components/ui/icons';

type LocalizedCopy = {
  key: string;
  defaultValue: string;
};

type StrategyAccent = {
  text: string;
  well: string;
  selectedCard: string;
  ring: string;
  radioBorder: string;
  radioFill: string;
  rec: string;
};

const SECTION_CHROME = {
  well: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
};

const STRATEGY_ACCENTS: Record<ChannelStrategyId, StrategyAccent> = {
  grow_audience: {
    text: 'text-violet-600 dark:text-violet-400',
    well: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
    selectedCard: 'border-violet-500 dark:border-violet-400 bg-violet-500/10',
    ring: 'focus-visible:ring-violet-500',
    radioBorder: 'border-violet-500 dark:border-violet-400',
    radioFill: 'bg-violet-500',
    rec: 'border-violet-500/40 bg-violet-500/10',
  },
  lead_capture: {
    text: 'text-blue-600 dark:text-blue-400',
    well: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    selectedCard: 'border-blue-500 dark:border-blue-400 bg-blue-500/10',
    ring: 'focus-visible:ring-blue-500',
    radioBorder: 'border-blue-500 dark:border-blue-400',
    radioFill: 'bg-blue-500',
    rec: 'border-blue-500/40 bg-blue-500/10',
  },
  community_retention: {
    text: 'text-emerald-600 dark:text-emerald-400',
    well: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    selectedCard: 'border-emerald-500 dark:border-emerald-400 bg-emerald-500/10',
    ring: 'focus-visible:ring-emerald-500',
    radioBorder: 'border-emerald-500 dark:border-emerald-400',
    radioFill: 'bg-emerald-500',
    rec: 'border-emerald-500/40 bg-emerald-500/10',
  },
  brand_awareness: {
    text: 'text-orange-600 dark:text-orange-400',
    well: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
    selectedCard: 'border-orange-500 dark:border-orange-400 bg-orange-500/10',
    ring: 'focus-visible:ring-orange-500',
    radioBorder: 'border-orange-500 dark:border-orange-400',
    radioFill: 'bg-orange-500',
    rec: 'border-orange-500/40 bg-orange-500/10',
  },
  customer_support: {
    text: 'text-rose-600 dark:text-rose-400',
    well: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
    selectedCard: 'border-rose-500 dark:border-rose-400 bg-rose-500/10',
    ring: 'focus-visible:ring-rose-500',
    radioBorder: 'border-rose-500 dark:border-rose-400',
    radioFill: 'bg-rose-500',
    rec: 'border-rose-500/40 bg-rose-500/10',
  },
};

type StrategyPresentation = {
  Icon: FC<{ size?: number; className?: string }>;
  accent: StrategyAccent;
  highlights: Array<{ title: LocalizedCopy; body: LocalizedCopy }>;
  recommendation: { title: LocalizedCopy; body: LocalizedCopy };
};

const STRATEGY_PRESENTATION: Record<ChannelStrategyId, StrategyPresentation> = {
  grow_audience: {
    Icon: UsersGroupIcon,
    accent: STRATEGY_ACCENTS.grow_audience,
    highlights: [
      {
        title: {
          key: 'channelStrategies.grow_audience.highlights.0.title',
          defaultValue: 'Surfaces people you engage with and who engage back.',
        },
        body: {
          key: 'channelStrategies.grow_audience.highlights.0.body',
          defaultValue:
            'Strengthens existing connections and uncovers new ones.',
        },
      },
      {
        title: {
          key: 'channelStrategies.grow_audience.highlights.1.title',
          defaultValue: 'Expands your reach through quality relationships.',
        },
        body: {
          key: 'channelStrategies.grow_audience.highlights.1.body',
          defaultValue:
            'Highlights accounts likely to introduce you to new audiences.',
        },
      },
      {
        title: {
          key: 'channelStrategies.grow_audience.highlights.2.title',
          defaultValue: 'Balances growth with relevance.',
        },
        body: {
          key: 'channelStrategies.grow_audience.highlights.2.body',
          defaultValue: 'Focuses on people aligned with your brand and goals.',
        },
      },
    ],
    recommendation: {
      title: {
        key: 'channelStrategies.grow_audience.recommendation.title',
        defaultValue: 'Recommended for new or growth-focused channels',
      },
      body: {
        key: 'channelStrategies.grow_audience.recommendation.body',
        defaultValue: 'Great for building momentum and increasing your network.',
      },
    },
  },
  lead_capture: {
    Icon: MagnetIcon,
    accent: STRATEGY_ACCENTS.lead_capture,
    highlights: [
      {
        title: {
          key: 'channelStrategies.lead_capture.highlights.0.title',
          defaultValue: 'Prioritizes high-intent inbound signals.',
        },
        body: {
          key: 'channelStrategies.lead_capture.highlights.0.body',
          defaultValue:
            'Surfaces mentions, replies, and follows that look like real opportunities.',
        },
      },
      {
        title: {
          key: 'channelStrategies.lead_capture.highlights.1.title',
          defaultValue: 'Ranks leads by fit and urgency.',
        },
        body: {
          key: 'channelStrategies.lead_capture.highlights.1.body',
          defaultValue:
            'Helps you follow up with the people most likely to convert.',
        },
      },
      {
        title: {
          key: 'channelStrategies.lead_capture.highlights.2.title',
          defaultValue: 'Keeps growth outreach in context.',
        },
        body: {
          key: 'channelStrategies.lead_capture.highlights.2.body',
          defaultValue:
            'Balances lead pursuit with relationship quality so outreach stays relevant.',
        },
      },
    ],
    recommendation: {
      title: {
        key: 'channelStrategies.lead_capture.recommendation.title',
        defaultValue: 'Recommended for channels focused on pipeline and conversion',
      },
      body: {
        key: 'channelStrategies.lead_capture.recommendation.body',
        defaultValue:
          'Great when inbound conversations are your primary growth lever.',
      },
    },
  },
  community_retention: {
    Icon: SpeechBubblesIcon,
    accent: STRATEGY_ACCENTS.community_retention,
    highlights: [
      {
        title: {
          key: 'channelStrategies.community_retention.highlights.0.title',
          defaultValue: 'Strengthens two-way relationships.',
        },
        body: {
          key: 'channelStrategies.community_retention.highlights.0.body',
          defaultValue: 'Prioritizes mutual engagement and timely replies.',
        },
      },
      {
        title: {
          key: 'channelStrategies.community_retention.highlights.1.title',
          defaultValue: 'Spots cooling community ties.',
        },
        body: {
          key: 'channelStrategies.community_retention.highlights.1.body',
          defaultValue:
            'Highlights mutuals who need outbound attention before they go quiet.',
        },
      },
      {
        title: {
          key: 'channelStrategies.community_retention.highlights.2.title',
          defaultValue: 'Rewards reciprocity over volume.',
        },
        body: {
          key: 'channelStrategies.community_retention.highlights.2.body',
          defaultValue:
            'Focuses effort on people who already engage with your channel.',
        },
      },
    ],
    recommendation: {
      title: {
        key: 'channelStrategies.community_retention.recommendation.title',
        defaultValue: 'Recommended for established communities',
      },
      body: {
        key: 'channelStrategies.community_retention.recommendation.body',
        defaultValue:
          'Great when nurturing existing relationships matters more than broad reach.',
      },
    },
  },
  brand_awareness: {
    Icon: MegaphoneIcon,
    accent: STRATEGY_ACCENTS.brand_awareness,
    highlights: [
      {
        title: {
          key: 'channelStrategies.brand_awareness.highlights.0.title',
          defaultValue: 'Surfaces amplification and mentions.',
        },
        body: {
          key: 'channelStrategies.brand_awareness.highlights.0.body',
          defaultValue: 'Prioritizes people resharing or talking about your brand.',
        },
      },
      {
        title: {
          key: 'channelStrategies.brand_awareness.highlights.1.title',
          defaultValue: 'Highlights brand advocates.',
        },
        body: {
          key: 'channelStrategies.brand_awareness.highlights.1.body',
          defaultValue: 'Surfaces repeat amplifiers worth acknowledging.',
        },
      },
      {
        title: {
          key: 'channelStrategies.brand_awareness.highlights.2.title',
          defaultValue: 'Connects reach to verified activity.',
        },
        body: {
          key: 'channelStrategies.brand_awareness.highlights.2.body',
          defaultValue:
            'Explains visibility through interactions you can see, not follower counts alone.',
        },
      },
    ],
    recommendation: {
      title: {
        key: 'channelStrategies.brand_awareness.recommendation.title',
        defaultValue: 'Recommended for brand-building channels',
      },
      body: {
        key: 'channelStrategies.brand_awareness.recommendation.body',
        defaultValue:
          'Great when mentions and reshares signal the relationships that matter.',
      },
    },
  },
  customer_support: {
    Icon: HeadsetIcon,
    accent: STRATEGY_ACCENTS.customer_support,
    highlights: [
      {
        title: {
          key: 'channelStrategies.customer_support.highlights.0.title',
          defaultValue: 'Prioritizes unanswered inbound threads.',
        },
        body: {
          key: 'channelStrategies.customer_support.highlights.0.body',
          defaultValue: 'Surfaces people waiting on a reply from you.',
        },
      },
      {
        title: {
          key: 'channelStrategies.customer_support.highlights.1.title',
          defaultValue: 'Recognizes support effort already invested.',
        },
        body: {
          key: 'channelStrategies.customer_support.highlights.1.body',
          defaultValue: 'Highlights conversations where you have already replied.',
        },
      },
      {
        title: {
          key: 'channelStrategies.customer_support.highlights.2.title',
          defaultValue: 'Treats unresolved support as urgent.',
        },
        body: {
          key: 'channelStrategies.customer_support.highlights.2.body',
          defaultValue: 'Ranks open support threads above growth opportunities.',
        },
      },
    ],
    recommendation: {
      title: {
        key: 'channelStrategies.customer_support.recommendation.title',
        defaultValue: 'Recommended for support-heavy channels',
      },
      body: {
        key: 'channelStrategies.customer_support.recommendation.body',
        defaultValue:
          'Great when timely replies and clearing the queue are the priority.',
      },
    },
  },
};

const localizedStrategyCopy = (
  copy: LocalizedCopy,
  t: ReturnType<typeof useT>
) => t(copy.key, copy.defaultValue);

const StrategyIconWell: FC<{
  presentation: StrategyPresentation;
  size?: 'sm' | 'lg';
}> = ({ presentation, size = 'sm' }) => {
  const { Icon, accent } = presentation;
  const iconSize = size === 'lg' ? 24 : 18;

  return (
    <div
      className={clsx(
        'shrink-0 rounded-full flex items-center justify-center',
        size === 'lg' ? 'size-12' : 'size-9',
        accent.well
      )}
    >
      <Icon size={iconSize} />
    </div>
  );
};

const StrategyDetailPanel: FC<{
  option: ChannelStrategyPublicSummary;
  presentation: StrategyPresentation;
  t: ReturnType<typeof useT>;
}> = ({ option, presentation, t }) => {
  const label = localizedStrategyCopy(option.label, t);
  const description = localizedStrategyCopy(option.description, t);
  const { accent } = presentation;

  return (
    <div
      className="rounded-[8px] border border-newBorder p-[16px] flex flex-col gap-[16px] min-w-0"
      aria-live="polite"
    >
      <div className="flex flex-col gap-[12px]">
        <div
          className={clsx(
            'text-[11px] uppercase tracking-wide font-[500]',
            accent.text
          )}
        >
          {t('channel_strategy_selected_eyebrow', 'Selected strategy')}
        </div>
        <div className="flex items-start gap-[12px]">
          <StrategyIconWell presentation={presentation} size="lg" />
          <div className="min-w-0 flex flex-col gap-[4px]">
            <div className="text-[18px] font-[500]">{label}</div>
            <div className="text-[13px] text-newTextColor">{description}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-[12px]">
        <div className="text-[14px] font-[500]">
          {t('channel_strategy_what_it_does', 'What this strategy does')}
        </div>
        <div className="flex flex-col gap-[12px]">
          {presentation.highlights.map((highlight) => (
            <div key={highlight.title.key} className="flex gap-[10px] items-start">
              <div
                className={clsx(
                  'size-5 shrink-0 rounded-full flex items-center justify-center mt-[1px]',
                  accent.well
                )}
              >
                <CheckmarkIcon className="size-[10px]" />
              </div>
              <div className="min-w-0 flex flex-col gap-[2px]">
                <div className="text-[13px] font-[500]">
                  {localizedStrategyCopy(highlight.title, t)}
                </div>
                <div className="text-[12px] text-newTextColor">
                  {localizedStrategyCopy(highlight.body, t)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className={clsx(
          'rounded-[8px] border p-[12px] flex gap-[10px] items-start',
          accent.rec
        )}
      >
        <StarOutlineIcon
          size={18}
          className={clsx('shrink-0 mt-[1px]', accent.text)}
        />
        <div className="min-w-0 flex flex-col gap-[2px]">
          <div className={clsx('text-[13px] font-[500]', accent.text)}>
            {localizedStrategyCopy(presentation.recommendation.title, t)}
          </div>
          <div className="text-[12px] text-newTextColor">
            {localizedStrategyCopy(presentation.recommendation.body, t)}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ChannelStrategySection: FC<{
  integrationId: string;
  strategyApplicable?: boolean;
  strategy?: ChannelStrategyPublicSummary;
  recomputing?: boolean;
  loading: boolean;
  onStrategyUpdated: () => Promise<unknown>;
}> = ({
  integrationId,
  strategyApplicable,
  strategy,
  recomputing,
  loading,
  onStrategyUpdated,
}) => {
    const t = useT();
    const toast = useToaster();
    const fetch = useFetch();
    const { mutate } = useSWRConfig();
    const persistedStrategyId = strategy?.id ?? FALLBACK_CHANNEL_STRATEGY_ID;
    const [selectedId, setSelectedId] =
      useState<ChannelStrategyId>(persistedStrategyId);
    const [saving, setSaving] = useState(false);
    const [recomputeNotice, setRecomputeNotice] = useState(false);

    useEffect(() => {
      setSelectedId(persistedStrategyId);
    }, [persistedStrategyId]);

    useEffect(() => {
      if (recomputing) {
        setRecomputeNotice(true);
      }
    }, [recomputing]);

    const hasChanges = selectedId !== persistedStrategyId;
    const showRecomputeNotice = recomputeNotice || !!recomputing;
    const isActive = selectedId === persistedStrategyId;

    const selectedOption = useMemo(
      () =>
        channelStrategyOptions.find((option) => option.id === selectedId) ??
        channelStrategyOptions[0],
      [selectedId]
    );
    const selectedPresentation = STRATEGY_PRESENTATION[selectedId];

    const handleOptionKeyDown = useCallback(
      (strategyId: ChannelStrategyId) =>
        (event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!saving) {
              setSelectedId(strategyId);
            }
          }
        },
      [saving]
    );

    const cancelChanges = useCallback(() => {
      if (!hasChanges || saving) {
        return;
      }
      setSelectedId(persistedStrategyId);
    }, [hasChanges, persistedStrategyId, saving]);

    const saveStrategy = useCallback(async () => {
      if (!strategyApplicable || saving || !hasChanges) {
        return;
      }
      setSaving(true);
      try {
        const response = await fetch(`/integrations/${integrationId}/strategy`, {
          method: 'PUT',
          body: JSON.stringify({ strategyId: selectedId }),
        });
        if (!response.ok) {
          throw new Error('strategy save failed');
        }
        const body = (await response.json()) as {
          strategy?: ChannelStrategyPublicSummary;
          recomputeRequested?: boolean;
        };
        setRecomputeNotice(!!body.recomputeRequested || !!recomputing);
        await Promise.all([
          onStrategyUpdated(),
          mutate('/integrations/list'),
          mutate('/followers/channels'),
        ]);
        toast.show(
          t('channel_strategy_saved', 'Channel strategy updated.'),
          'success'
        );
      } catch {
        setSelectedId(persistedStrategyId);
        toast.show(
          t(
            'channel_strategy_save_failed',
            'Could not update the channel strategy.'
          )
        );
      } finally {
        setSaving(false);
      }
    }, [
      fetch,
      hasChanges,
      integrationId,
      mutate,
      onStrategyUpdated,
      persistedStrategyId,
      recomputing,
      saving,
      selectedId,
      strategyApplicable,
      t,
      toast,
    ]);

    if (loading && strategyApplicable === undefined) {
      return (
        <div className="flex flex-col gap-[10px] border border-newBorder rounded-[8px] p-[16px]">
          <div className="text-[16px] font-[500]">
            {t('channel_strategy', 'Channel strategy')}
          </div>
          <div className="text-[14px] text-newTextColor">
            {t('loading', 'Loading...')}
          </div>
        </div>
      );
    }

    if (strategyApplicable === false) {
      return (
        <div className="flex flex-col gap-[10px] border border-newBorder rounded-[8px] p-[16px]">
          <div className="text-[16px] font-[500]">
            {t('channel_strategy', 'Channel strategy')}
          </div>
          <div className="text-[14px] text-newTextColor">
            {t(
              'channel_strategy_not_applicable',
              'Not available for this channel because it does not expose follower identities.'
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-[16px] border border-newBorder rounded-[8px] p-[16px]">
        <div className="flex flex-col gap-[8px]">
          <div className="flex items-start justify-between gap-[12px]">
            <div className="flex items-center gap-[10px] min-w-0">
              <div
                className={clsx(
                  'size-9 shrink-0 rounded-full flex items-center justify-center',
                  SECTION_CHROME.well
                )}
              >
                <TargetIcon size={18} />
              </div>
              <div className="text-[16px] font-[500]">
                {t('channel_strategy', 'Channel strategy')}
              </div>
            </div>
            {isActive && (
              <div className="shrink-0 inline-flex items-center gap-[6px] rounded-full border border-emerald-500/30 bg-emerald-500/10 px-[10px] py-[4px] text-[12px] text-emerald-300">
                <span className="size-[6px] rounded-full bg-emerald-400" />
                {t('channel_strategy_active', 'Active')}
              </div>
            )}
          </div>
          <div className="text-[13px] text-newTextColor">
            {t(
              'channel_strategy_description',
              'Choose how relationship grades and Followers defaults prioritize people on this channel.'
            )}
          </div>
          <div className="flex items-center gap-[8px] text-[13px] text-newTextColor">
            <ResetIcon size={14} className="shrink-0 opacity-70" />
            <span>
              {t(
                'channel_strategy_switch_later',
                'You can switch strategies later as your goals change.'
              )}
            </span>
          </div>
        </div>

        {showRecomputeNotice && (
          <div className="rounded-[10px] border border-sky-500/30 bg-sky-500/10 px-[14px] py-[12px] text-[13px] text-sky-100">
            {t(
              'channel_strategy_recomputing',
              'Relationship rankings are updating. Existing grades stay visible while the new strategy is applied.'
            )}
          </div>
        )}

        <div className="grid grid-cols-2 mobile:grid-cols-1 gap-[16px] min-w-0 items-start">
          <div
            className="flex flex-col gap-[10px] min-w-0"
            role="radiogroup"
            aria-label={t('channel_strategy', 'Channel strategy')}
          >
            {channelStrategyOptions.map((option) => {
              const label = localizedStrategyCopy(option.label, t);
              const description = localizedStrategyCopy(option.description, t);
              const isSelected = selectedId === option.id;
              const isDefault = option.id === FALLBACK_CHANNEL_STRATEGY_ID;
              const optionLabel = isDefault
                ? `${label} (${t('channel_strategy_default', 'Default')})`
                : label;
              const presentation = STRATEGY_PRESENTATION[option.id];

              return (
                <div
                  key={option.id}
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={optionLabel}
                  tabIndex={saving ? -1 : 0}
                  onClick={() => {
                    if (!saving) {
                      setSelectedId(option.id);
                    }
                  }}
                  onKeyDown={handleOptionKeyDown(option.id)}
                  className={clsx(
                    'flex items-center gap-[12px] rounded-[8px] border p-[12px] cursor-pointer outline-none focus-visible:ring-2',
                    presentation.accent.ring,
                    isSelected
                      ? presentation.accent.selectedCard
                      : 'border-newBorder hover:bg-boxHover',
                    saving && 'opacity-60 cursor-not-allowed'
                  )}
                >
                  <div
                    className={clsx(
                      'size-4 shrink-0 rounded-full border flex items-center justify-center',
                      isSelected
                        ? presentation.accent.radioBorder
                        : 'border-newSep'
                    )}
                    aria-hidden="true"
                  >
                    {isSelected && (
                      <span
                        className={clsx(
                          'size-2 rounded-full',
                          presentation.accent.radioFill
                        )}
                      />
                    )}
                  </div>
                  <StrategyIconWell presentation={presentation} />
                  <div className="min-w-0 flex flex-col gap-[4px]">
                    <div className="text-[14px] font-[500]">{optionLabel}</div>
                    <div className="text-[13px] text-newTextColor">{description}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <StrategyDetailPanel
            option={selectedOption}
            presentation={selectedPresentation}
            t={t}
          />
        </div>

        <div className="flex justify-end gap-[8px]">
          <Button
            type="button"
            secondary
            disabled={saving || !hasChanges}
            onClick={cancelChanges}
          >
            {t('cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            loading={saving}
            disabled={saving || !hasChanges}
            onClick={saveStrategy}
            aria-label={t('save_channel_strategy_aria', 'Save channel strategy')}
          >
            {t('save', 'Save')}
          </Button>
        </div>
      </div>
    );
  };
