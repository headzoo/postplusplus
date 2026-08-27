'use client';

import { FC, useCallback, useState, useEffect } from 'react';
import { Button } from '@gitroom/react/form/button';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useRuleDetail } from '@gitroom/frontend/components/rules/use.rule.detail';
import { useRuleCapabilities } from '@gitroom/frontend/components/rules/use.rule.capabilities';
import {
  useCreateRule,
  useUpdateRule,
  useReplaceRuleAssignments,
} from '@gitroom/frontend/components/rules/use.rule.mutations';
import { ConditionEditor } from '@gitroom/frontend/components/rules/condition.editor';
import { RescheduleConfigEditor } from '@gitroom/frontend/components/rules/reschedule.config.editor';
import { RuleAssignmentPicker } from '@gitroom/frontend/components/rules/rule.assignment.picker';
import {
  PostRuleAction,
  PostRuleConditionMatch,
  PostRuleCondition,
  PostRuleRescheduleConfig,
} from '@gitroom/nestjs-libraries/dtos/rules/rule.types';
import {
  CreatePostRuleDto,
  UpdatePostRuleDto,
} from '@gitroom/nestjs-libraries/dtos/rules/rule.dto';
import { formatActionLabel } from '@gitroom/frontend/components/rules/rule.utils';

export const RuleEditor: FC<{
  ruleId?: string;
  onSaved: () => void;
}> = ({ ruleId, onSaved }) => {
  const t = useT();
  const modal = useModals();
  const toaster = useToaster();
  const { data: rule, isLoading } = useRuleDetail(ruleId);
  const { data: capabilities } = useRuleCapabilities();
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();
  const replaceAssignments = useReplaceRuleAssignments();

  const [saving, setSaving] = useState(false);
  const [actionReady, setActionReady] = useState(!!ruleId);
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [action, setAction] = useState<PostRuleAction>('REMOVE');
  const [initialDelayHours, setInitialDelayHours] = useState(0);
  const [evaluationIntervalHours, setEvaluationIntervalHours] = useState<
    number | undefined
  >(24);
  const [maxEvaluations, setMaxEvaluations] = useState<number | undefined>(3);
  const [conditionMatch, setConditionMatch] =
    useState<PostRuleConditionMatch>('ANY');
  const [conditions, setConditions] = useState<PostRuleCondition[]>([]);
  const [autoPlugContent, setAutoPlugContent] = useState('');
  const [rescheduleConfig, setRescheduleConfig] =
    useState<PostRuleRescheduleConfig | null>(null);
  const [maxRescheduleAttempts, setMaxRescheduleAttempts] = useState<
    number | undefined
  >(undefined);
  const [integrationIds, setIntegrationIds] = useState<string[]>([]);
  const [pipelineIds, setPipelineIds] = useState<string[]>([]);

  useEffect(() => {
    if (rule) {
      setName(rule.name);
      setEnabled(rule.enabled);
      setAction(rule.action);
      setInitialDelayHours(rule.initialDelayHours);
      setEvaluationIntervalHours(rule.evaluationIntervalHours ?? undefined);
      setMaxEvaluations(rule.maxEvaluations ?? undefined);
      setConditionMatch(rule.conditionMatch);
      setConditions(rule.conditions);
      if (rule.action === 'AUTO_PLUG' && rule.actionConfig) {
        setAutoPlugContent(
          (rule.actionConfig as { content?: string }).content || ''
        );
      }
      setRescheduleConfig(rule.rescheduleConfig);
      setMaxRescheduleAttempts(rule.maxRescheduleAttempts ?? undefined);
      setIntegrationIds(rule.integrationIds);
      setPipelineIds(rule.pipelineIds);
    }
  }, [rule]);

  const handleActionChange = useCallback((newAction: PostRuleAction) => {
    setAction(newAction);
    if (newAction === 'REMOVE') {
      setEvaluationIntervalHours(undefined);
      setMaxEvaluations(undefined);
    } else {
      setEvaluationIntervalHours(24);
      setMaxEvaluations(3);
      setRescheduleConfig(null);
      setMaxRescheduleAttempts(undefined);
    }
  }, []);

  useEffect(() => {
    if (!capabilities?.actions.length || actionReady) {
      return;
    }
    handleActionChange(capabilities.actions[0].key);
    setActionReady(true);
  }, [capabilities, actionReady, handleActionChange]);

  useEffect(() => {
    if (!capabilities?.actions.length) {
      return;
    }
    const available = capabilities.actions.map((actionDef) => actionDef.key);
    if (!available.includes(action)) {
      handleActionChange(capabilities.actions[0].key);
    }
  }, [capabilities, action, handleActionChange]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      toaster.show('Please enter a Rule name.', 'warning');
      return;
    }

    if (action === 'AUTO_PLUG' && !autoPlugContent.trim()) {
      toaster.show(
        'Please enter plug content for Auto Plug action.',
        'warning'
      );
      return;
    }

    if (integrationIds.length === 0 && pipelineIds.length === 0) {
      toaster.show(
        'Please assign at least one channel or Pipeline.',
        'warning'
      );
      return;
    }

    setSaving(true);
    try {
      const dto = {
        name: name.trim(),
        enabled,
        action,
        initialDelayHours,
        evaluationIntervalHours,
        maxEvaluations,
        conditionMatch,
        conditions,
        actionConfig:
          action === 'AUTO_PLUG'
            ? { content: autoPlugContent.trim() }
            : undefined,
        rescheduleConfig,
        maxRescheduleAttempts,
      };

      let savedRuleId = ruleId;

      if (ruleId) {
        await updateRule(ruleId, dto as UpdatePostRuleDto);
      } else {
        const created = await createRule(dto as CreatePostRuleDto);
        savedRuleId = created.id;
      }

      if (!savedRuleId) {
        throw new Error('Failed to save Rule.');
      }

      await replaceAssignments(savedRuleId, { integrationIds, pipelineIds });

      toaster.show(
        ruleId
          ? t('rule_updated_successfully', 'Rule updated successfully.')
          : t('rule_created_successfully', 'Rule created successfully.'),
        'success'
      );
      onSaved();
      modal.closeAll();
    } catch (err: any) {
      toaster.show(err?.message || 'Failed to save Rule.', 'warning');
    } finally {
      setSaving(false);
    }
  }, [
    name,
    enabled,
    action,
    initialDelayHours,
    evaluationIntervalHours,
    maxEvaluations,
    conditionMatch,
    conditions,
    autoPlugContent,
    rescheduleConfig,
    maxRescheduleAttempts,
    integrationIds,
    pipelineIds,
    ruleId,
    createRule,
    updateRule,
    replaceAssignments,
    toaster,
    t,
    onSaved,
    modal,
  ]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-[40px]">
        <LoadingComponent height={60} width={60} />
      </div>
    );
  }

  if (!capabilities) {
    return (
      <div className="text-[14px] text-red-500 p-[20px]">
        Failed to load Rule capabilities.
      </div>
    );
  }

  const needsRepetition =
    action === 'AUTO_REPOST' || action === 'AUTO_PLUG' || action === 'NOTIFY';
  const needsReschedule = action === 'REMOVE';

  return (
    <div className="flex flex-col gap-[20px] p-[20px] max-h-[80vh] overflow-y-auto">
      <div className="flex flex-col gap-[12px]">
        <label className="text-[14px] font-[600]">
          {t('rule_name', 'Rule Name')}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('enter_rule_name', 'Enter rule name')}
          className="h-[44px] w-full rounded-[8px] border border-newBorder bg-newBgColorInner px-[12px] text-[14px] outline-none"
        />
      </div>

      <div className="flex flex-col gap-[12px]">
        <label className="text-[14px] font-[600]">
          {t('action', 'Action')}
        </label>
        <select
          value={action}
          onChange={(e) => handleActionChange(e.target.value as PostRuleAction)}
          className="h-[44px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[12px] text-[14px] outline-none"
        >
          {capabilities.actions.map((actionDef) => (
            <option key={actionDef.key} value={actionDef.key}>
              {actionDef.label}
            </option>
          ))}
        </select>
        {action === 'REMOVE' && (
          <p className="text-[12px] opacity-70">
            {t(
              'remove_action_description',
              'Remove the post from the platform if conditions are met.'
            )}
          </p>
        )}
        {action === 'AUTO_REPOST' && (
          <p className="text-[12px] opacity-70">
            {t(
              'auto_repost_action_description',
              'Automatically repost the content if conditions are met.'
            )}
          </p>
        )}
        {action === 'AUTO_PLUG' && (
          <p className="text-[12px] opacity-70">
            {t(
              'auto_plug_action_description',
              'Add a follow-up plug (comment/thread) if conditions are met.'
            )}
          </p>
        )}
        {action === 'NOTIFY' && (
          <p className="text-[12px] opacity-70">
            {t(
              'notify_action_description',
              'Send an in-app notification when conditions are met. Checks continue until the rule matches or max evaluations is reached.'
            )}
          </p>
        )}
      </div>

      {action === 'AUTO_PLUG' && (
        <div className="flex flex-col gap-[12px]">
          <label className="text-[14px] font-[600]">
            {t('plug_content', 'Plug Content')}
          </label>
          <textarea
            value={autoPlugContent}
            onChange={(e) => setAutoPlugContent(e.target.value)}
            placeholder={t(
              'enter_plug_content',
              'Enter the content for the plug'
            )}
            className="min-h-[100px] w-full rounded-[8px] border border-newBorder bg-newBgColorInner px-[12px] py-[8px] text-[14px] outline-none"
          />
        </div>
      )}

      <div className="flex flex-col gap-[12px]">
        <label className="text-[14px] font-[600]">
          {t('initial_delay', 'Initial Delay (hours)')}
        </label>
        <input
          type="number"
          min={0}
          max={720}
          value={initialDelayHours}
          onChange={(e) =>
            setInitialDelayHours(parseInt(e.target.value, 10) || 0)
          }
          className="h-[44px] w-full rounded-[8px] border border-newBorder bg-newBgColorInner px-[12px] text-[14px] outline-none"
        />
        <p className="text-[12px] opacity-70">
          {t(
            'initial_delay_description',
            'Hours to wait after post is published before first evaluation.'
          )}
        </p>
      </div>

      {needsRepetition && (
        <>
          <div className="flex flex-col gap-[12px]">
            <label className="text-[14px] font-[600]">
              {t('evaluation_interval', 'Evaluation Interval (hours)')}
            </label>
            <input
              type="number"
              min={1}
              max={720}
              value={evaluationIntervalHours ?? ''}
              onChange={(e) =>
                setEvaluationIntervalHours(
                  parseInt(e.target.value, 10) || undefined
                )
              }
              className="h-[44px] w-full rounded-[8px] border border-newBorder bg-newBgColorInner px-[12px] text-[14px] outline-none"
            />
            <p className="text-[12px] opacity-70">
              {t(
                'evaluation_interval_description',
                'Hours between repeated evaluations.'
              )}
            </p>
          </div>

          <div className="flex flex-col gap-[12px]">
            <label className="text-[14px] font-[600]">
              {t('max_evaluations', 'Max Evaluations')}
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={maxEvaluations ?? ''}
              onChange={(e) =>
                setMaxEvaluations(parseInt(e.target.value, 10) || undefined)
              }
              className="h-[44px] w-full rounded-[8px] border border-newBorder bg-newBgColorInner px-[12px] text-[14px] outline-none"
            />
            <p className="text-[12px] opacity-70">
              {t(
                'max_evaluations_description',
                'Maximum number of times to evaluate this post.'
              )}
            </p>
          </div>
        </>
      )}

      <div className="flex flex-col gap-[12px]">
        <label className="text-[14px] font-[600]">
          {t('conditions', 'Conditions')}
        </label>
        <ConditionEditor
          action={action}
          capabilities={capabilities}
          conditionMatch={conditionMatch}
          conditions={conditions}
          onConditionMatchChange={setConditionMatch}
          onConditionsChange={setConditions}
        />
      </div>

      {needsReschedule && (
        <div className="flex flex-col gap-[12px]">
          <label className="text-[14px] font-[600]">
            {t('reschedule_on_remove', 'Reschedule on Remove (optional)')}
          </label>
          <RescheduleConfigEditor
            rescheduleConfig={rescheduleConfig}
            maxRescheduleAttempts={maxRescheduleAttempts}
            onRescheduleConfigChange={setRescheduleConfig}
            onMaxRescheduleAttemptsChange={setMaxRescheduleAttempts}
          />
        </div>
      )}

      <div className="flex flex-col gap-[12px]">
        <label className="text-[14px] font-[600]">
          {t('assignments', 'Assignments')}
        </label>
        <RuleAssignmentPicker
          action={action}
          metrics={conditions.map((c) => c.metric)}
          integrationIds={integrationIds}
          pipelineIds={pipelineIds}
          onIntegrationIdsChange={setIntegrationIds}
          onPipelineIdsChange={setPipelineIds}
        />
      </div>

      <div className="flex items-center gap-[12px] pt-[12px] border-t border-newBorder">
        <label className="flex items-center gap-[8px] cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-[16px] h-[16px]"
          />
          <span className="text-[14px]">
            {t('enable_rule_immediately', 'Enable Rule immediately')}
          </span>
        </label>
      </div>

      <div className="flex justify-end gap-[12px] pt-[12px] border-t border-newBorder">
        <Button secondary onClick={() => modal.closeAll()}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? t('saving', 'Saving...') : t('save', 'Save')}
        </Button>
      </div>
    </div>
  );
};
