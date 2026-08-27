'use client';

import React, { FC, useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { Button } from '@gitroom/react/form/button';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { AdminScheduleLogsModal } from '@gitroom/frontend/components/admin/admin-schedule.logs.modal';
import { AdminScheduleLogSlug } from '@gitroom/nestjs-libraries/database/prisma/admin-schedule-logs/admin-schedule-log.slugs';

type ScheduleUnit = 'hour' | 'day' | 'month';

interface ScheduleCadence {
  unit: ScheduleUnit;
  interval: number;
  timeOfDay?: string;
  dayOfMonth?: number;
}

interface ScheduleResponse {
  scheduleId: string;
  exists: boolean;
  paused: boolean;
  cadence: ScheduleCadence;
  nextRunTimes: string[];
  note?: string;
}

interface BotScoreScheduleResponse {
  scheduleId: string;
  exists: boolean;
  paused: boolean;
  cadence: { intervalHours: number };
  nextRunTimes: string[];
  note?: string;
}

interface IntervalHoursScheduleResponse {
  scheduleId: string;
  exists: boolean;
  paused: boolean;
  cadence: { intervalHours: number };
  nextRunTimes: string[];
  note?: string;
}

interface WorkflowCadence {
  unit: 'second' | 'hour';
  interval: number;
  label: string;
}

interface WorkflowStatusResponse {
  workflowId: string;
  exists: boolean;
  status: string;
  cadence: WorkflowCadence;
  startedAt?: string;
  note?: string;
  activeCount?: number;
}

const useRelationshipGradeSchedule = () => {
  const fetch = useFetch();
  return useSWR<ScheduleResponse>(
    '/admin/schedule/relationship-grades',
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to load schedule');
      }
      return res.json();
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
};

const useFollowerBotScoreSchedule = () => {
  const fetch = useFetch();
  return useSWR<BotScoreScheduleResponse>(
    '/admin/schedule/follower-bot-scores',
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to load schedule');
      }
      return res.json();
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
};

const useHotTriageSchedule = () => {
  const fetch = useFetch();
  return useSWR<IntervalHoursScheduleResponse>(
    '/admin/schedule/hot-triage',
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to load schedule');
      }
      return res.json();
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
};

const useFollowerCultivateSchedule = () => {
  const fetch = useFetch();
  return useSWR<IntervalHoursScheduleResponse>(
    '/admin/schedule/follower-cultivate',
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to load schedule');
      }
      return res.json();
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
};

const useMissingPostRecoverySchedule = () => {
  const fetch = useFetch();
  return useSWR<WorkflowStatusResponse>(
    '/admin/schedule/missing-post-recovery',
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to load schedule');
      }
      return res.json();
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
};

const usePostWorkflowSchedule = () => {
  const fetch = useFetch();
  return useSWR<WorkflowStatusResponse>(
    '/admin/schedule/post-workflows',
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to load schedule');
      }
      return res.json();
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
};

const useAutopostWorkflowSchedule = () => {
  const fetch = useFetch();
  return useSWR<WorkflowStatusResponse>(
    '/admin/schedule/autopost-workflows',
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to load schedule');
      }
      return res.json();
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
};

const useLeadBridgeSchedule = () => {
  const fetch = useFetch();
  return useSWR<WorkflowStatusResponse>(
    '/admin/schedule/lead-bridge',
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to load schedule');
      }
      return res.json();
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
};

const formatCadence = (cadence: ScheduleCadence) => {
  if (cadence.unit === 'hour') {
    return cadence.interval === 1
      ? 'Every hour'
      : `Every ${cadence.interval} hours`;
  }
  if (cadence.unit === 'day') {
    const time = cadence.timeOfDay || '00:00';
    return cadence.interval === 1
      ? `Every day at ${time} UTC`
      : `Every ${cadence.interval} days at ${time} UTC`;
  }
  const time = cadence.timeOfDay || '00:00';
  return `Every ${cadence.interval} month(s) on day ${
    cadence.dayOfMonth || 1
  } at ${time} UTC`;
};

const formatBotScoreCadence = (intervalHours: number) =>
  intervalHours === 1 ? 'Every hour' : `Every ${intervalHours} hours`;

export const AdminScheduleComponent: FC = () => {
  const user = useUser();
  const t = useT();
  const toaster = useToaster();
  const fetch = useFetch();
  const modal = useModals();
  const relationship = useRelationshipGradeSchedule();
  const botScores = useFollowerBotScoreSchedule();
  const hotTriage = useHotTriageSchedule();
  const followerCultivate = useFollowerCultivateSchedule();
  const missingPosts = useMissingPostRecoverySchedule();
  const postWorkflows = usePostWorkflowSchedule();
  const autopostWorkflows = useAutopostWorkflowSchedule();
  const leadBridge = useLeadBridgeSchedule();

  const [unit, setUnit] = useState<ScheduleUnit>('day');
  const [interval, setInterval] = useState(3);
  const [timeOfDay, setTimeOfDay] = useState('00:00');
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [botIntervalHours, setBotIntervalHours] = useState(6);
  const [hotIntervalHours, setHotIntervalHours] = useState(1);
  const [cultivateIntervalHours, setCultivateIntervalHours] = useState(1);
  const [savingGrades, setSavingGrades] = useState(false);
  const [savingBotScores, setSavingBotScores] = useState(false);
  const [savingHotTriage, setSavingHotTriage] = useState(false);
  const [savingFollowerCultivate, setSavingFollowerCultivate] = useState(false);
  const [triggeringGrades, setTriggeringGrades] = useState(false);
  const [triggeringBotScores, setTriggeringBotScores] = useState(false);
  const [triggeringHotTriage, setTriggeringHotTriage] = useState(false);
  const [triggeringFollowerCultivate, setTriggeringFollowerCultivate] =
    useState(false);
  const [triggeringMissing, setTriggeringMissing] = useState(false);
  const [triggeringPosts, setTriggeringPosts] = useState(false);
  const [triggeringAutopost, setTriggeringAutopost] = useState(false);
  const [triggeringLeadBridge, setTriggeringLeadBridge] = useState(false);
  const [formError, setFormError] = useState('');

  const openLogs = useCallback(
    (keySlug: AdminScheduleLogSlug) => {
      modal.openModal({
        closeOnClickOutside: true,
        withCloseButton: false,
        top: 40,
        height: 'calc(100dvh - 80px)',
        size: '100%',
        classNames: {
          modal: 'w-[100%] max-w-[900px] text-textColor',
        },
        children: <AdminScheduleLogsModal keySlug={keySlug} />,
      });
    },
    [modal]
  );

  useEffect(() => {
    if (!relationship.data?.cadence) {
      return;
    }
    setUnit(relationship.data.cadence.unit);
    setInterval(relationship.data.cadence.interval);
    setTimeOfDay(relationship.data.cadence.timeOfDay || '00:00');
    setDayOfMonth(relationship.data.cadence.dayOfMonth || 1);
  }, [relationship.data]);

  useEffect(() => {
    if (!botScores.data?.cadence) {
      return;
    }
    setBotIntervalHours(botScores.data.cadence.intervalHours);
  }, [botScores.data]);

  useEffect(() => {
    if (!hotTriage.data?.cadence) {
      return;
    }
    setHotIntervalHours(hotTriage.data.cadence.intervalHours);
  }, [hotTriage.data]);

  useEffect(() => {
    if (!followerCultivate.data?.cadence) {
      return;
    }
    setCultivateIntervalHours(followerCultivate.data.cadence.intervalHours);
  }, [followerCultivate.data]);

  const saveGrades = useCallback(async () => {
    setFormError('');
    setSavingGrades(true);
    try {
      const res = await fetch('/admin/schedule/relationship-grades', {
        method: 'PUT',
        body: JSON.stringify({
          unit,
          interval,
          ...(unit === 'hour' ? {} : { timeOfDay }),
          ...(unit === 'month' ? { dayOfMonth } : {}),
        }),
      });
      if (!res.ok) {
        throw new Error('Failed to save schedule');
      }
      await relationship.mutate(await res.json(), false);
    } catch {
      setFormError(
        t(
          'admin_schedule_save_error',
          'Could not save this schedule. Try again.'
        )
      );
    } finally {
      setSavingGrades(false);
    }
  }, [dayOfMonth, fetch, interval, relationship, t, timeOfDay, unit]);

  const triggerGrades = useCallback(async () => {
    setFormError('');
    setTriggeringGrades(true);
    try {
      const res = await fetch('/admin/schedule/relationship-grades/trigger', {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error('Failed to trigger schedule');
      }
      await relationship.mutate(await res.json(), false);
      toaster.show(
        t(
          'admin_schedule_trigger_success',
          'Grade update triggered. The workflow is now running.'
        ),
        'success'
      );
    } catch {
      const message = t(
        'admin_schedule_trigger_error',
        'Could not trigger a grade update. Try again.'
      );
      setFormError(message);
      toaster.show(message, 'warning');
    } finally {
      setTriggeringGrades(false);
    }
  }, [fetch, relationship, t, toaster]);

  const saveBotScores = useCallback(async () => {
    setFormError('');
    setSavingBotScores(true);
    try {
      const res = await fetch('/admin/schedule/follower-bot-scores', {
        method: 'PUT',
        body: JSON.stringify({ intervalHours: botIntervalHours }),
      });
      if (!res.ok) {
        throw new Error('Failed to save schedule');
      }
      await botScores.mutate(await res.json(), false);
    } catch {
      setFormError(
        t(
          'admin_schedule_save_error',
          'Could not save this schedule. Try again.'
        )
      );
    } finally {
      setSavingBotScores(false);
    }
  }, [botIntervalHours, botScores, fetch, t]);

  const triggerBotScores = useCallback(async () => {
    setFormError('');
    setTriggeringBotScores(true);
    try {
      const res = await fetch('/admin/schedule/follower-bot-scores/trigger', {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error('Failed to trigger schedule');
      }
      await botScores.mutate(await res.json(), false);
      toaster.show(
        t(
          'admin_schedule_bot_trigger_success',
          'Bot score update triggered. The workflow is now running.'
        ),
        'success'
      );
    } catch {
      const message = t(
        'admin_schedule_bot_trigger_error',
        'Could not trigger a bot score update. Try again.'
      );
      setFormError(message);
      toaster.show(message, 'warning');
    } finally {
      setTriggeringBotScores(false);
    }
  }, [botScores, fetch, t, toaster]);

  const saveHotTriage = useCallback(async () => {
    setFormError('');
    setSavingHotTriage(true);
    try {
      const res = await fetch('/admin/schedule/hot-triage', {
        method: 'PUT',
        body: JSON.stringify({ intervalHours: hotIntervalHours }),
      });
      if (!res.ok) {
        throw new Error('Failed to save schedule');
      }
      await hotTriage.mutate(await res.json(), false);
    } catch {
      setFormError(
        t(
          'admin_schedule_save_error',
          'Could not save this schedule. Try again.'
        )
      );
    } finally {
      setSavingHotTriage(false);
    }
  }, [fetch, hotIntervalHours, hotTriage, t]);

  const triggerHotTriage = useCallback(async () => {
    setFormError('');
    setTriggeringHotTriage(true);
    try {
      const res = await fetch('/admin/schedule/hot-triage/trigger', {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error('Failed to trigger schedule');
      }
      await hotTriage.mutate(await res.json(), false);
      toaster.show(
        t(
          'admin_schedule_hot_trigger_success',
          'Hot triage materialization triggered. The workflow is now running.'
        ),
        'success'
      );
    } catch {
      const message = t(
        'admin_schedule_hot_trigger_error',
        'Could not trigger Hot triage materialization. Try again.'
      );
      setFormError(message);
      toaster.show(message, 'warning');
    } finally {
      setTriggeringHotTriage(false);
    }
  }, [fetch, hotTriage, t, toaster]);

  const saveFollowerCultivate = useCallback(async () => {
    setFormError('');
    setSavingFollowerCultivate(true);
    try {
      const res = await fetch('/admin/schedule/follower-cultivate', {
        method: 'PUT',
        body: JSON.stringify({ intervalHours: cultivateIntervalHours }),
      });
      if (!res.ok) {
        throw new Error('Failed to save schedule');
      }
      await followerCultivate.mutate(await res.json(), false);
    } catch {
      setFormError(
        t(
          'admin_schedule_save_error',
          'Could not save this schedule. Try again.'
        )
      );
    } finally {
      setSavingFollowerCultivate(false);
    }
  }, [cultivateIntervalHours, fetch, followerCultivate, t]);

  const triggerFollowerCultivate = useCallback(async () => {
    setFormError('');
    setTriggeringFollowerCultivate(true);
    try {
      const res = await fetch('/admin/schedule/follower-cultivate/trigger', {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error('Failed to trigger schedule');
      }
      await followerCultivate.mutate(await res.json(), false);
      toaster.show(
        t(
          'admin_schedule_cultivate_trigger_success',
          'Follower cultivate materialization triggered. The workflow is now running.'
        ),
        'success'
      );
    } catch {
      const message = t(
        'admin_schedule_cultivate_trigger_error',
        'Could not trigger follower cultivate materialization. Try again.'
      );
      setFormError(message);
      toaster.show(message, 'warning');
    } finally {
      setTriggeringFollowerCultivate(false);
    }
  }, [fetch, followerCultivate, t, toaster]);

  const triggerMissing = useCallback(async () => {
    setFormError('');
    setTriggeringMissing(true);
    try {
      const res = await fetch('/admin/schedule/missing-post-recovery/trigger', {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error('Failed to trigger schedule');
      }
      await missingPosts.mutate(await res.json(), false);
      toaster.show(
        t(
          'admin_schedule_missing_trigger_success',
          'Missing-post scan triggered. The workflow is now running.'
        ),
        'success'
      );
    } catch {
      const message = t(
        'admin_schedule_missing_trigger_error',
        'Could not trigger a missing-post scan. Try again.'
      );
      setFormError(message);
      toaster.show(message, 'warning');
    } finally {
      setTriggeringMissing(false);
    }
  }, [fetch, missingPosts, t, toaster]);

  const triggerPosts = useCallback(async () => {
    setFormError('');
    setTriggeringPosts(true);
    try {
      const res = await fetch('/admin/schedule/post-workflows/trigger', {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error('Failed to trigger schedule');
      }
      await postWorkflows.mutate(await res.json(), false);
      toaster.show(
        t(
          'admin_schedule_post_trigger_success',
          'Scheduler tick triggered. Due post slots are being dispatched.'
        ),
        'success'
      );
    } catch {
      const message = t(
        'admin_schedule_post_trigger_error',
        'Could not trigger a post scheduler tick. Try again.'
      );
      setFormError(message);
      toaster.show(message, 'warning');
    } finally {
      setTriggeringPosts(false);
    }
  }, [fetch, postWorkflows, t, toaster]);

  const triggerAutopost = useCallback(async () => {
    setFormError('');
    setTriggeringAutopost(true);
    try {
      const res = await fetch('/admin/schedule/autopost-workflows/trigger', {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error('Failed to trigger schedule');
      }
      await autopostWorkflows.mutate(await res.json(), false);
      toaster.show(
        t(
          'admin_schedule_autopost_trigger_success',
          'Active autoposts are now being force-run.'
        ),
        'success'
      );
    } catch {
      const message = t(
        'admin_schedule_autopost_trigger_error',
        'Could not force-run active autoposts. Try again.'
      );
      setFormError(message);
      toaster.show(message, 'warning');
    } finally {
      setTriggeringAutopost(false);
    }
  }, [autopostWorkflows, fetch, t, toaster]);

  const triggerLeadBridge = useCallback(async () => {
    setFormError('');
    setTriggeringLeadBridge(true);
    try {
      const res = await fetch('/admin/schedule/lead-bridge/trigger', {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error('Failed to trigger schedule');
      }
      await leadBridge.mutate(await res.json(), false);
      toaster.show(
        t(
          'admin_schedule_lead_bridge_trigger_success',
          'Lead discovery reset started. All discovered leads are being cleared, then at least 20 new leads will be generated.'
        ),
        'success'
      );
    } catch {
      const message = t(
        'admin_schedule_lead_bridge_trigger_error',
        'Could not trigger lead discovery. Try again.'
      );
      setFormError(message);
      toaster.show(message, 'warning');
    } finally {
      setTriggeringLeadBridge(false);
    }
  }, [fetch, leadBridge, t, toaster]);

  if (!user?.isSuperAdmin) {
    return (
      <div className="text-textColor p-[20px]">
        {t('no_access', 'You do not have access to this page.')}
      </div>
    );
  }

  if (
    relationship.isLoading ||
    botScores.isLoading ||
    hotTriage.isLoading ||
    followerCultivate.isLoading ||
    missingPosts.isLoading ||
    postWorkflows.isLoading ||
    autopostWorkflows.isLoading ||
    leadBridge.isLoading
  ) {
    return <LoadingComponent />;
  }

  if (
    relationship.error ||
    botScores.error ||
    hotTriage.error ||
    followerCultivate.error ||
    missingPosts.error ||
    postWorkflows.error ||
    autopostWorkflows.error ||
    leadBridge.error
  ) {
    return (
      <div className="text-red-400">
        {t('admin_schedule_load_error', 'Failed to load schedule.')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[16px] text-textColor">
      <div className="text-[20px] font-[600]">
        {t('admin_schedule', 'Schedule')}
      </div>
      <p className="text-[14px] opacity-70">
        {t(
          'admin_schedule_help',
          'Configure Temporal schedules and trigger operational workflows.'
        )}
      </p>

      <div className="border border-newTableBorder rounded-[8px] p-[16px] bg-newBgColorInner flex flex-col gap-[12px]">
        <div className="text-[16px] font-[600]">
          {t('admin_schedule_grade_title', 'Relationship grades')}
        </div>
        <div className="text-[13px] opacity-70">
          {relationship.data?.exists
            ? t('admin_schedule_active', 'Temporal schedule is active.')
            : t(
                'admin_schedule_missing',
                'No Temporal schedule exists yet. Saving will create one.'
              )}
        </div>
        {relationship.data?.cadence ? (
          <div className="text-[13px]">
            {formatCadence(relationship.data.cadence)}
          </div>
        ) : null}
        {relationship.data?.nextRunTimes?.length ? (
          <div className="text-[13px]">
            {t('admin_schedule_next_run', 'Next run')}:{' '}
            {new Date(relationship.data.nextRunTimes[0]).toLocaleString()}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-[12px] items-end">
          <label
            className="flex flex-col gap-[6px] min-w-[160px]"
            htmlFor="admin-schedule-repeat"
          >
            <span className="text-[12px] opacity-70">
              {t('admin_schedule_repeat', 'Repeat')}
            </span>
            <select
              id="admin-schedule-repeat"
              value={unit}
              onChange={(event) => setUnit(event.target.value as ScheduleUnit)}
              className="bg-newBgColorInner h-[38px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor"
            >
              <option value="hour">
                {t('admin_schedule_every_hour', 'Every hour')}
              </option>
              <option value="day">
                {t('admin_schedule_every_x_days', 'Every X days')}
              </option>
              <option value="month">
                {t('admin_schedule_every_month', 'Every month')}
              </option>
            </select>
          </label>
          <label
            className="flex flex-col gap-[6px] w-[120px]"
            htmlFor="admin-schedule-interval"
          >
            <span className="text-[12px] opacity-70">
              {t('admin_schedule_interval', 'Interval')}
            </span>
            <input
              id="admin-schedule-interval"
              type="number"
              min={1}
              max={unit === 'hour' ? 168 : unit === 'day' ? 30 : 12}
              value={interval}
              onChange={(event) => setInterval(Number(event.target.value))}
              className="bg-newBgColorInner h-[38px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor"
            />
          </label>
          {unit !== 'hour' && (
            <label className="flex flex-col gap-[6px] w-[140px]">
              <span className="text-[12px] opacity-70">
                {t('admin_schedule_time_utc', 'Time (UTC)')}
              </span>
              <input
                type="time"
                value={timeOfDay}
                onChange={(event) => setTimeOfDay(event.target.value)}
                className="bg-newBgColorInner h-[38px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor"
              />
            </label>
          )}
          {unit === 'month' && (
            <label className="flex flex-col gap-[6px] w-[140px]">
              <span className="text-[12px] opacity-70">
                {t('admin_schedule_day_of_month', 'Day of month')}
              </span>
              <input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(event) => setDayOfMonth(Number(event.target.value))}
                className="bg-newBgColorInner h-[38px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor"
              />
            </label>
          )}
        </div>

        <div className="flex flex-wrap gap-[12px]">
          <Button disabled={savingGrades} onClick={saveGrades}>
            {t('save', 'Save')}
          </Button>
          <Button secondary disabled={triggeringGrades} onClick={triggerGrades}>
            {t('admin_schedule_trigger_now', 'Trigger now')}
          </Button>
          <Button secondary onClick={() => openLogs('relationship-grades')}>
            {t('admin_schedule_logs', 'Logs')}
          </Button>
        </div>
      </div>

      <div className="border border-newTableBorder rounded-[8px] p-[16px] bg-newBgColorInner flex flex-col gap-[12px]">
        <div className="text-[16px] font-[600]">
          {t('admin_schedule_bot_title', 'Follower bot scores')}
        </div>
        <div className="text-[13px] opacity-70">
          {botScores.data?.exists
            ? t('admin_schedule_active', 'Temporal schedule is active.')
            : t(
                'admin_schedule_missing',
                'No Temporal schedule exists yet. Saving will create one.'
              )}
        </div>
        {botScores.data?.cadence ? (
          <div className="text-[13px]">
            {formatBotScoreCadence(botScores.data.cadence.intervalHours)}
          </div>
        ) : null}
        {botScores.data?.nextRunTimes?.length ? (
          <div className="text-[13px]">
            {t('admin_schedule_next_run', 'Next run')}:{' '}
            {new Date(botScores.data.nextRunTimes[0]).toLocaleString()}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-[12px] items-end">
          <label
            className="flex flex-col gap-[6px] w-[160px]"
            htmlFor="admin-schedule-bot-interval"
          >
            <span className="text-[12px] opacity-70">
              {t('admin_schedule_interval_hours', 'Interval (hours)')}
            </span>
            <input
              id="admin-schedule-bot-interval"
              type="number"
              min={1}
              max={168}
              value={botIntervalHours}
              onChange={(event) =>
                setBotIntervalHours(Number(event.target.value))
              }
              className="bg-newBgColorInner h-[38px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-[12px]">
          <Button disabled={savingBotScores} onClick={saveBotScores}>
            {t('save', 'Save')}
          </Button>
          <Button
            secondary
            disabled={triggeringBotScores}
            onClick={triggerBotScores}
          >
            {t('admin_schedule_trigger_now', 'Trigger now')}
          </Button>
          <Button secondary onClick={() => openLogs('follower-bot-scores')}>
            {t('admin_schedule_logs', 'Logs')}
          </Button>
        </div>
      </div>

      <div className="border border-newTableBorder rounded-[8px] p-[16px] bg-newBgColorInner flex flex-col gap-[12px]">
        <div className="text-[16px] font-[600]">
          {t('admin_schedule_hot_title', 'Hot triage materialization')}
        </div>
        <div className="text-[13px] opacity-70">
          {hotTriage.data?.exists
            ? t('admin_schedule_active', 'Temporal schedule is active.')
            : t(
                'admin_schedule_missing',
                'No Temporal schedule exists yet. Saving will create one.'
              )}
        </div>
        {hotTriage.data?.cadence ? (
          <div className="text-[13px]">
            {formatBotScoreCadence(hotTriage.data.cadence.intervalHours)}
          </div>
        ) : null}
        {hotTriage.data?.nextRunTimes?.length ? (
          <div className="text-[13px]">
            {t('admin_schedule_next_run', 'Next run')}:{' '}
            {new Date(hotTriage.data.nextRunTimes[0]).toLocaleString()}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-[12px] items-end">
          <label
            className="flex flex-col gap-[6px] w-[160px]"
            htmlFor="admin-schedule-hot-interval"
          >
            <span className="text-[12px] opacity-70">
              {t('admin_schedule_interval_hours', 'Interval (hours)')}
            </span>
            <input
              id="admin-schedule-hot-interval"
              type="number"
              min={1}
              max={168}
              value={hotIntervalHours}
              onChange={(event) =>
                setHotIntervalHours(Number(event.target.value))
              }
              className="bg-newBgColorInner h-[38px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-[12px]">
          <Button disabled={savingHotTriage} onClick={saveHotTriage}>
            {t('save', 'Save')}
          </Button>
          <Button
            secondary
            disabled={triggeringHotTriage}
            onClick={triggerHotTriage}
          >
            {t('admin_schedule_trigger_now', 'Trigger now')}
          </Button>
          <Button secondary onClick={() => openLogs('hot-triage')}>
            {t('admin_schedule_logs', 'Logs')}
          </Button>
        </div>
      </div>

      <div className="border border-newTableBorder rounded-[8px] p-[16px] bg-newBgColorInner flex flex-col gap-[12px]">
        <div className="text-[16px] font-[600]">
          {t('admin_schedule_cultivate_title', 'Follower cultivate')}
        </div>
        <div className="text-[13px] opacity-70">
          {followerCultivate.data?.exists
            ? t('admin_schedule_active', 'Temporal schedule is active.')
            : t(
                'admin_schedule_missing',
                'No Temporal schedule exists yet. Saving will create one.'
              )}
        </div>
        {followerCultivate.data?.cadence ? (
          <div className="text-[13px]">
            {formatBotScoreCadence(
              followerCultivate.data.cadence.intervalHours
            )}
          </div>
        ) : null}
        {followerCultivate.data?.nextRunTimes?.length ? (
          <div className="text-[13px]">
            {t('admin_schedule_next_run', 'Next run')}:{' '}
            {new Date(followerCultivate.data.nextRunTimes[0]).toLocaleString()}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-[12px] items-end">
          <label
            className="flex flex-col gap-[6px] w-[160px]"
            htmlFor="admin-schedule-cultivate-interval"
          >
            <span className="text-[12px] opacity-70">
              {t('admin_schedule_interval_hours', 'Interval (hours)')}
            </span>
            <input
              id="admin-schedule-cultivate-interval"
              type="number"
              min={1}
              max={168}
              value={cultivateIntervalHours}
              onChange={(event) =>
                setCultivateIntervalHours(Number(event.target.value))
              }
              className="bg-newBgColorInner h-[38px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-[12px]">
          <Button
            disabled={savingFollowerCultivate}
            onClick={saveFollowerCultivate}
          >
            {t('save', 'Save')}
          </Button>
          <Button
            secondary
            disabled={triggeringFollowerCultivate}
            onClick={triggerFollowerCultivate}
          >
            {t('admin_schedule_trigger_now', 'Trigger now')}
          </Button>
          <Button secondary onClick={() => openLogs('follower-cultivate')}>
            {t('admin_schedule_logs', 'Logs')}
          </Button>
        </div>
      </div>

      <div className="border border-newTableBorder rounded-[8px] p-[16px] bg-newBgColorInner flex flex-col gap-[12px]">
        <div className="text-[16px] font-[600]">
          {t('admin_schedule_lead_bridge_title', 'Lead discovery')}
        </div>
        <div className="text-[13px] opacity-70">
          {leadBridge.data?.exists
            ? t(
                'admin_schedule_lead_bridge_running',
                'Lead discovery workflow is present.'
              )
            : t(
                'admin_schedule_lead_bridge_missing',
                'Lead discovery workflow is not running.'
              )}
        </div>
        <div className="text-[13px]">
          {leadBridge.data?.cadence?.label ||
            'Idle up to 1 hour when quiet; Trigger now clears all discovered leads, generates at least 20, then resumes the idle crawler'}
        </div>
        <div className="text-[13px] opacity-70">
          {t(
            'admin_schedule_lead_bridge_trigger_help',
            'Trigger now deletes all discovered leads globally, generates at least 20 new leads, then resumes the hourly idle crawler.'
          )}
        </div>
        <div className="text-[13px]">
          {t('admin_schedule_status', 'Status')}: {leadBridge.data?.status}
        </div>
        <div className="flex flex-wrap gap-[12px]">
          <Button
            secondary
            disabled={triggeringLeadBridge}
            onClick={triggerLeadBridge}
          >
            {t('admin_schedule_trigger_now', 'Trigger now')}
          </Button>
          <Button secondary onClick={() => openLogs('lead-bridge')}>
            {t('admin_schedule_logs', 'Logs')}
          </Button>
        </div>
      </div>

      <div className="border border-newTableBorder rounded-[8px] p-[16px] bg-newBgColorInner flex flex-col gap-[12px]">
        <div className="text-[16px] font-[600]">
          {t('admin_schedule_missing_title', 'Missing post recovery')}
        </div>
        <div className="text-[13px] opacity-70">
          {missingPosts.data?.exists
            ? t(
                'admin_schedule_workflow_running',
                'Recovery workflow is present.'
              )
            : t(
                'admin_schedule_workflow_missing',
                'Recovery workflow is not running.'
              )}
        </div>
        <div className="text-[13px]">
          {missingPosts.data?.cadence?.label ||
            'Every hour (fixed in workflow)'}
        </div>
        <div className="text-[13px]">
          {t('admin_schedule_status', 'Status')}: {missingPosts.data?.status}
        </div>
        <div className="flex flex-wrap gap-[12px]">
          <Button
            secondary
            disabled={triggeringMissing}
            onClick={triggerMissing}
          >
            {t('admin_schedule_trigger_scan_now', 'Trigger scan now')}
          </Button>
          <Button secondary onClick={() => openLogs('missing-post-recovery')}>
            {t('admin_schedule_logs', 'Logs')}
          </Button>
        </div>
      </div>

      <div className="border border-newTableBorder rounded-[8px] p-[16px] bg-newBgColorInner flex flex-col gap-[12px]">
        <div className="text-[16px] font-[600]">
          {t('admin_schedule_post_title', 'Post workflows')}
        </div>
        <div className="text-[13px] opacity-70">
          {t(
            'admin_schedule_post_help',
            'Shows the global pipeline scheduler that dispatches due post slots.'
          )}
        </div>
        <div className="text-[13px]">
          {postWorkflows.data?.cadence?.label ||
            'Every 30 seconds (fixed in workflow)'}
        </div>
        <div className="text-[13px]">
          {t('admin_schedule_status', 'Status')}: {postWorkflows.data?.status}
        </div>
        <div className="flex flex-wrap gap-[12px]">
          <Button secondary disabled={triggeringPosts} onClick={triggerPosts}>
            {t('admin_schedule_trigger_tick_now', 'Trigger scheduler tick now')}
          </Button>
          <Button secondary onClick={() => openLogs('post-workflows')}>
            {t('admin_schedule_logs', 'Logs')}
          </Button>
        </div>
      </div>

      <div className="border border-newTableBorder rounded-[8px] p-[16px] bg-newBgColorInner flex flex-col gap-[12px]">
        <div className="text-[16px] font-[600]">
          {t('admin_schedule_autopost_title', 'Autopost workflows')}
        </div>
        <div className="text-[13px] opacity-70">
          {t(
            'admin_schedule_autopost_help',
            'Force-running active autoposts may generate content or posts for every active configuration.'
          )}
        </div>
        <div className="text-[13px]">
          {autopostWorkflows.data?.cadence?.label ||
            'Every hour per active autopost (fixed in workflow)'}
        </div>
        <div className="text-[13px]">
          {t('admin_schedule_active_autoposts', 'Active autoposts')}:{' '}
          {autopostWorkflows.data?.activeCount ?? 0}
        </div>
        <div className="flex flex-wrap gap-[12px]">
          <Button
            secondary
            disabled={triggeringAutopost}
            onClick={triggerAutopost}
          >
            {t('admin_schedule_force_run_autoposts', 'Force run all active')}
          </Button>
          <Button secondary onClick={() => openLogs('autopost-workflows')}>
            {t('admin_schedule_logs', 'Logs')}
          </Button>
        </div>
      </div>

      {formError && <div className="text-[13px] text-red-400">{formError}</div>}
    </div>
  );
};
