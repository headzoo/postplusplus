'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Button } from '@gitroom/react/form/button';
import { Slider } from '@gitroom/react/form/slider';
import { useModals, useDecisionModal } from '@gitroom/frontend/components/layout/new-modal';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useRulesList, RULES_KEY } from '@gitroom/frontend/components/rules/use.rules.list';
import { useRuleCapabilities } from '@gitroom/frontend/components/rules/use.rule.capabilities';
import {
  useDeleteRule,
  useSetRuleActivation,
} from '@gitroom/frontend/components/rules/use.rule.mutations';
import { RuleEditor } from '@gitroom/frontend/components/rules/rule.editor';
import {
  filterRulesByChannel,
  formatActionLabel,
  formatConditionPreview,
  formatTimingPreview,
  formatReschedulePreview,
  RULES_EMPTY_STATE_CUTOVER_NOTE,
} from '@gitroom/frontend/components/rules/rule.utils';
import { PostRuleListItemResponse } from '@gitroom/nestjs-libraries/dtos/rules/rule.types';
import {
  ChannelMenu,
  ChannelsSidebar,
} from '@gitroom/frontend/components/launches/channels.sidebar';
import {
  IntegrationListItem,
  useIntegrationList,
} from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { setLastChannelId } from '@gitroom/frontend/components/launches/helpers/last-channel';

export default function RulesPage() {
  const t = useT();
  const modal = useModals();
  const decision = useDecisionModal();
  const toaster = useToaster();
  const { data: rules, error, isLoading, mutate } = useRulesList();
  const { data: capabilities } = useRuleCapabilities();
  const { data: integrations = [], isLoading: integrationsLoading } =
    useIntegrationList();
  const setRuleActivation = useSetRuleActivation();
  const deleteRule = useDeleteRule();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string>();

  const visibleRules = useMemo(
    () => filterRulesByChannel(rules || [], selectedChannelId),
    [rules, selectedChannelId]
  );

  const handleChannelSelect = useCallback(
    (integration: IntegrationListItem) => {
      const nextId =
        selectedChannelId === integration.id ? undefined : integration.id;
      if (nextId) {
        setLastChannelId(nextId);
      }
      setSelectedChannelId(nextId);
    },
    [selectedChannelId]
  );

  const openCreate = useCallback(() => {
    modal.openModal({
      title: t('create_rule', 'Create Rule'),
      withCloseButton: true,
      classNames: {
        modal: 'w-[100%] max-w-[900px] text-textColor',
      },
      children: <RuleEditor onSaved={() => mutate()} />,
    });
  }, [modal, mutate, t]);

  const openEdit = useCallback(
    (rule: PostRuleListItemResponse) => {
      modal.openModal({
        title: t('edit_rule', 'Edit Rule'),
        withCloseButton: true,
        classNames: {
          modal: 'w-[100%] max-w-[900px] text-textColor',
        },
        children: <RuleEditor ruleId={rule.id} onSaved={() => mutate()} />,
      });
    },
    [modal, mutate, t]
  );

  const toggleActive = useCallback(
    (rule: PostRuleListItemResponse) => async (value: 'on' | 'off') => {
      setPendingId(rule.id);
      try {
        await setRuleActivation(rule.id, { enabled: value === 'on' });
        await mutate();
      } catch (err: any) {
        toaster.show(err?.message || 'Failed to update Rule activation.', 'warning');
      } finally {
        setPendingId(null);
      }
    },
    [mutate, setRuleActivation, toaster]
  );

  const confirmDelete = useCallback(
    (rule: PostRuleListItemResponse) => async () => {
      const approved = await decision.open({
        title: t('delete_rule', 'Delete Rule?'),
        description: `Deleting "${rule.name}" will permanently remove this Rule. Active scheduled actions will continue processing. This cannot be undone.`,
        approveLabel: t('delete_rule_confirm', 'Delete Rule'),
        cancelLabel: t('cancel', 'Cancel'),
      });
      if (!approved) {
        return;
      }
      setPendingId(rule.id);
      try {
        await deleteRule(rule.id);
        toaster.show(
          t('rule_deleted_successfully', 'Rule deleted successfully.'),
          'success'
        );
        await mutate();
      } catch (err: any) {
        toaster.show(err?.message || 'Failed to delete Rule.', 'warning');
      } finally {
        setPendingId(null);
      }
    },
    [decision, deleteRule, mutate, t, toaster]
  );

  if (isLoading || integrationsLoading || !capabilities) {
    return (
      <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px] transition-all items-center justify-center">
        <LoadingComponent />
      </div>
    );
  }

  return (
    <>
      <ChannelsSidebar
        integrationCount={integrations.length}
        showAddProvider={false}
      >
        {(collapsed) => (
          <ChannelMenu
            collapsed={collapsed}
            integrations={integrations}
            selectedIds={selectedChannelId ? [selectedChannelId] : undefined}
            onSelect={handleChannelSelect}
          />
        )}
      </ChannelsSidebar>
      <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[20px] transition-all text-textColor min-w-0 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col gap-[6px]">
          <h1 className="text-[24px] font-[600]">
            {t('rules', 'Rules')} ({visibleRules.length})
          </h1>
          <p className="text-[14px] opacity-70 max-w-[760px]">
            {t(
              'rules_description',
              'Automate post lifecycle: remove underperforming content, repost successful posts, or add follow-up plugs based on engagement metrics.'
            )}
          </p>
        </div>

        {error && (
          <div className="rounded-[12px] border border-red-500/30 bg-newBgColor px-[16px] py-[12px] text-[14px] text-red-500">
            {t('rules_load_error', 'Failed to load Rules. Please refresh and try again.')}
          </div>
        )}

        <div className="flex justify-between items-center gap-[12px] flex-wrap">
          <div className="flex items-center gap-[10px] flex-wrap">
            <Button onClick={openCreate}>{t('create', '+ Create')}</Button>
          </div>
        </div>

        {!rules?.length ? (
          <div className="rounded-[12px] border border-newBorder bg-newBgColor p-[32px] flex flex-col items-center justify-center gap-[12px] text-center">
            <div className="text-[18px] font-[600]">
              {t('no_rules_yet', 'No Rules yet')}
            </div>
            <div className="text-[14px] opacity-70 max-w-[520px]">
              {t('no_rules_description', RULES_EMPTY_STATE_CUTOVER_NOTE)}
            </div>
            <Button onClick={openCreate}>{t('create', '+ Create')}</Button>
          </div>
        ) : !visibleRules.length ? (
          <div className="rounded-[12px] border border-newBorder bg-newBgColor p-[32px] flex flex-col items-center justify-center gap-[12px] text-center">
            <div className="text-[18px] font-[600]">
              {t('no_rules_for_channel', 'No Rules for this channel')}
            </div>
            <div className="text-[14px] opacity-70 max-w-[520px]">
              {t(
                'no_rules_for_channel_description',
                'None of your Rules include this channel. Select a different channel or click it again to show all Rules.'
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-[12px]">
            {visibleRules.map((rule) => (
              <div
                key={rule.id}
                className={clsx(
                  'rounded-[12px] border border-newBorder bg-newBgColor overflow-hidden',
                  pendingId === rule.id && 'opacity-70 pointer-events-none'
                )}
              >
                <div className="px-[20px] py-[16px] border-b border-newBorder flex flex-col gap-[12px] lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-col gap-[8px] min-w-0">
                    <div className="flex items-center gap-[10px] flex-wrap">
                      <div className="text-[18px] font-[600] truncate">{rule.name}</div>
                      <span
                        className={clsx(
                          'text-[12px] px-[8px] py-[2px] rounded-full border',
                          rule.enabled
                            ? 'border-green-500/40 text-green-500'
                            : 'border-newBorder opacity-70'
                        )}
                      >
                        {rule.enabled
                          ? t('enabled', 'Enabled')
                          : t('disabled', 'Disabled')}
                      </span>
                    </div>
                    <div className="text-[13px] opacity-70">
                      {t('action', 'Action')}: {formatActionLabel(rule.action)}
                    </div>
                  </div>
                  <div className="flex items-center gap-[10px] flex-wrap">
                    <Button secondary onClick={() => openEdit(rule)}>
                      {t('edit', 'Edit')}
                    </Button>
                    <Button secondary onClick={confirmDelete(rule)}>
                      {t('delete', 'Delete')}
                    </Button>
                    <div className="flex items-center gap-[8px] px-[8px]">
                      <span className="text-[12px] opacity-70">
                        {rule.enabled ? t('disable', 'Disable') : t('enable', 'Enable')}
                      </span>
                      <Slider
                        value={rule.enabled ? 'on' : 'off'}
                        onChange={toggleActive(rule)}
                        fill={true}
                      />
                    </div>
                  </div>
                </div>
                <div className="px-[20px] py-[16px] grid grid-cols-1 md:grid-cols-3 gap-[16px]">
                  <div className="flex flex-col gap-[6px]">
                    <div className="text-[12px] uppercase opacity-60">
                      {t('conditions', 'Conditions')}
                    </div>
                    <div className="text-[14px]">
                      {formatConditionPreview(rule.conditionMatch, rule.conditions)}
                    </div>
                  </div>
                  <div className="flex flex-col gap-[6px]">
                    <div className="text-[12px] uppercase opacity-60">
                      {t('timing', 'Timing')}
                    </div>
                    <div className="text-[14px]">
                      {formatTimingPreview(
                        rule.action,
                        rule.initialDelayHours,
                        rule.evaluationIntervalHours,
                        rule.maxEvaluations
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-[6px]">
                    <div className="text-[12px] uppercase opacity-60">
                      {t('assignments', 'Assignments')}
                    </div>
                    <div className="text-[14px]">
                      {rule.integrationCount} {t('channels', 'channels')}
                      {rule.pipelineCount > 0 &&
                        `, ${rule.pipelineCount} ${t('pipelines', 'pipelines')}`}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
