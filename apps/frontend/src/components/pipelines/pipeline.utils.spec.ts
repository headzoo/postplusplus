import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import {
  PipelineScheduleOccurrence,
  PipelineSummary,
} from '@gitroom/frontend/components/pipelines/pipeline.types';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import {
  convertDisplayScheduleTargetToPipelineSlot,
  filterPipelinesByChannel,
  filterScheduleOccurrencesByChannel,
  filterScheduleOccurrencesByPipeline,
  formatPipelineSlotShort,
  formatPipelineTimezoneLabel,
  getContrastRatio,
  getPipelineScheduleWeek,
  getReadableForegroundColor,
  loadPipelineGlobalSchedule,
  pipelineScheduleSlotKey,
  pipelineScheduleSlotsEqual,
  PIPELINE_COLOR_PALETTE,
  PIPELINE_DEFAULT_COLOR,
  PIPELINE_SCHEDULE_DRAG_TYPE,
  resolveCalendarPostHeaderColor,
} from './pipeline.utils';

dayjs.extend(utc);
dayjs.extend(timezone);

const NEW_YORK = 'America/New_York';

describe('PIPELINE_SCHEDULE_DRAG_TYPE', () => {
  it('does not collide with post or queue drag types', () => {
    expect(PIPELINE_SCHEDULE_DRAG_TYPE).toBe('pipeline-schedule-slot');
    expect(PIPELINE_SCHEDULE_DRAG_TYPE).not.toBe('post');
    expect(PIPELINE_SCHEDULE_DRAG_TYPE).not.toBe('pipeline-queue-item');
  });
});

describe('pipelineScheduleSlotKey', () => {
  it('builds stable exact-slot keys', () => {
    expect(pipelineScheduleSlotKey({ dayOfWeek: 1, minuteOfDay: 540 })).toBe(
      '1:540'
    );
  });
});

describe('pipelineScheduleSlotsEqual', () => {
  it('matches identical recurring coordinates', () => {
    expect(
      pipelineScheduleSlotsEqual(
        { dayOfWeek: 3, minuteOfDay: 930 },
        { dayOfWeek: 3, minuteOfDay: 930 }
      )
    ).toBe(true);
  });

  it('rejects differing day or minute', () => {
    expect(
      pipelineScheduleSlotsEqual(
        { dayOfWeek: 3, minuteOfDay: 930 },
        { dayOfWeek: 4, minuteOfDay: 930 }
      )
    ).toBe(false);
    expect(
      pipelineScheduleSlotsEqual(
        { dayOfWeek: 3, minuteOfDay: 930 },
        { dayOfWeek: 3, minuteOfDay: 960 }
      )
    ).toBe(false);
  });
});

describe('convertDisplayScheduleTargetToPipelineSlot', () => {
  it('keeps same-timezone Monday 9:00 on the same recurring slot', () => {
    const result = convertDisplayScheduleTargetToPipelineSlot(
      '2025-03-10',
      9 * 60,
      NEW_YORK,
      NEW_YORK
    );
    expect(result).toEqual({ ok: true, dayOfWeek: 1, minuteOfDay: 540 });
  });

  it('rolls display UTC late evening into the next Pipeline-local day', () => {
    const result = convertDisplayScheduleTargetToPipelineSlot(
      '2025-03-11',
      5 * 60 + 30,
      'UTC',
      NEW_YORK
    );
    expect(result).toEqual({ ok: true, dayOfWeek: 2, minuteOfDay: 90 });
  });

  it('rolls display UTC early morning into the previous Pipeline-local day', () => {
    const result = convertDisplayScheduleTargetToPipelineSlot(
      '2025-03-11',
      2 * 60 + 30,
      'UTC',
      NEW_YORK
    );
    expect(result).toEqual({
      ok: true,
      dayOfWeek: 1,
      minuteOfDay: 22 * 60 + 30,
    });
  });

  it('handles half-hour offset zones across date boundaries', () => {
    const result = convertDisplayScheduleTargetToPipelineSlot(
      '2025-03-10',
      18 * 60 + 30,
      'Asia/Kolkata',
      NEW_YORK
    );
    expect(result).toEqual({ ok: true, dayOfWeek: 1, minuteOfDay: 9 * 60 });
  });

  it('maps Pipeline-local Saturday and Sunday boundaries from display time', () => {
    const saturday = convertDisplayScheduleTargetToPipelineSlot(
      '2025-03-14',
      10 * 60,
      NEW_YORK,
      'Pacific/Kiritimati'
    );
    expect(saturday).toEqual({ ok: true, dayOfWeek: 6, minuteOfDay: 4 * 60 });

    const sunday = convertDisplayScheduleTargetToPipelineSlot(
      '2025-03-15',
      10 * 60,
      NEW_YORK,
      'Pacific/Kiritimati'
    );
    expect(sunday).toEqual({ ok: true, dayOfWeek: 0, minuteOfDay: 4 * 60 });
  });

  it('rejects a spring-forward nonexistent display target', () => {
    const result = convertDisplayScheduleTargetToPipelineSlot(
      '2025-03-09',
      2 * 60 + 30,
      NEW_YORK,
      NEW_YORK
    );
    expect(result).toEqual({ ok: false, reason: 'nonexistent' });
  });

  it('uses Day.js first-occurrence policy for ambiguous fall-back targets', () => {
    const result = convertDisplayScheduleTargetToPipelineSlot(
      '2025-11-02',
      1 * 60 + 30,
      NEW_YORK,
      NEW_YORK
    );
    expect(result).toEqual({ ok: true, dayOfWeek: 0, minuteOfDay: 90 });
  });

  it('rejects off-half-hour display minutes', () => {
    expect(
      convertDisplayScheduleTargetToPipelineSlot(
        '2025-03-10',
        9 * 60 + 15,
        NEW_YORK,
        NEW_YORK
      )
    ).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('getPipelineScheduleWeek', () => {
  it('uses the local New York midnights around spring-forward', () => {
    const week = getPipelineScheduleWeek(
      NEW_YORK,
      dayjs.utc('2025-03-12T12:00:00Z')
    );

    expect(week.startDate).toBe('2025-03-09T05:00:00.000Z');
    expect(week.endDate).toBe('2025-03-16T04:00:00.000Z');
    expect(dayjs(week.endDate).diff(week.startDate, 'hour')).toBe(167);
    expect(dayjs.utc('2025-03-16T04:00:00Z').isBefore(week.end)).toBe(false);
    expect(week.days.map((day) => day.format('YYYY-MM-DD'))).toEqual([
      '2025-03-09',
      '2025-03-10',
      '2025-03-11',
      '2025-03-12',
      '2025-03-13',
      '2025-03-14',
      '2025-03-15',
    ]);
  });

  it('uses the local New York midnights around fall-back', () => {
    const week = getPipelineScheduleWeek(
      NEW_YORK,
      dayjs.utc('2025-11-05T12:00:00Z')
    );

    expect(week.startDate).toBe('2025-11-02T04:00:00.000Z');
    expect(week.endDate).toBe('2025-11-09T05:00:00.000Z');
    expect(dayjs(week.endDate).diff(week.startDate, 'hour')).toBe(169);
    expect(dayjs.utc('2025-11-09T04:59:59.999Z').isBefore(week.end)).toBe(
      true
    );
    expect(week.days.map((day) => day.format('YYYY-MM-DD'))).toEqual([
      '2025-11-02',
      '2025-11-03',
      '2025-11-04',
      '2025-11-05',
      '2025-11-06',
      '2025-11-07',
      '2025-11-08',
    ]);
  });
});

describe('PIPELINE_COLOR_PALETTE', () => {
  it('contains 14 swatches including the default primary', () => {
    expect(PIPELINE_COLOR_PALETTE).toHaveLength(14);
    expect(
      PIPELINE_COLOR_PALETTE.some((swatch) => swatch.value === PIPELINE_DEFAULT_COLOR)
    ).toBe(true);
  });
});

describe('resolveCalendarPostHeaderColor', () => {
  it('prefers pipeline color over tag color', () => {
    expect(resolveCalendarPostHeaderColor('#eb3825', '#FF0000')).toBe('#eb3825');
  });

  it('uses tag color when pipeline color is absent', () => {
    expect(resolveCalendarPostHeaderColor(undefined, '#FF0000')).toBe('#FF0000');
  });

  it('returns undefined when neither color is present', () => {
    expect(resolveCalendarPostHeaderColor(undefined, undefined)).toBeUndefined();
  });
});

describe('getReadableForegroundColor', () => {
  it.each(PIPELINE_COLOR_PALETTE.map((swatch) => [swatch.label, swatch.value]))(
    'meets WCAG AA contrast for %s (%s)',
    (_label, backgroundColor) => {
      const foregroundColor = getReadableForegroundColor(backgroundColor);
      expect(getContrastRatio(foregroundColor, backgroundColor)).toBeGreaterThanOrEqual(
        4.5
      );
    }
  );

  it('returns dark text on bright backgrounds', () => {
    expect(getReadableForegroundColor('#FFBE00')).toBe('#000000');
    expect(getReadableForegroundColor('#F6756E')).toBe('#000000');
    expect(getReadableForegroundColor('#00B7EA')).toBe('#000000');
    expect(getReadableForegroundColor('#00BA73')).toBe('#000000');
    expect(getReadableForegroundColor('#FF8100')).toBe('#000000');
    expect(getReadableForegroundColor('#7785D0')).toBe('#000000');
  });

  it('returns light text on dark backgrounds', () => {
    expect(getReadableForegroundColor('#eb3825')).toBe('#FFFFFF');
    expect(getReadableForegroundColor('#616161')).toBe('#FFFFFF');
    expect(getReadableForegroundColor('#E80000')).toBe('#FFFFFF');
  });

  it('returns white for invalid hex values', () => {
    expect(getReadableForegroundColor('not-a-color')).toBe('#FFFFFF');
    expect(getReadableForegroundColor('#FFF')).toBe('#FFFFFF');
  });

  it('picks the higher-contrast foreground for arbitrary hex colors', () => {
    const backgroundColor = '#336699';
    const foregroundColor = getReadableForegroundColor(backgroundColor);
    const bestContrast = Math.max(
      getContrastRatio('#1A1A1A', backgroundColor),
      getContrastRatio('#000000', backgroundColor),
      getContrastRatio('#FFFFFF', backgroundColor)
    );
    expect(getContrastRatio(foregroundColor, backgroundColor)).toBe(
      bestContrast
    );
  });
});

const mockResponse = (
  ok: boolean,
  body: unknown,
  status = ok ? 200 : 400
): Response =>
  ({
    ok,
    status,
    json: async () => body,
  }) as Response;

describe('loadPipelineGlobalSchedule', () => {
  it('returns parsed occurrences for successful responses', async () => {
    const occurrences: PipelineScheduleOccurrence[] = [
      {
        id: 'occ-1',
        pipelineId: 'pipeline-1',
        pipelineName: 'Main',
        pipelineTimezone: 'America/New_York',
        pipelineColor: '#eb3825',
        active: true,
        scheduleRevision: 1,
        dayOfWeek: 1,
        minuteOfDay: 540,
        scheduledFor: '2025-03-10T14:00:00.000Z',
      },
    ];
    const fetchFn = jest.fn(async () => mockResponse(true, occurrences));

    await expect(
      loadPipelineGlobalSchedule(fetchFn, '/pipelines/schedule?startDate=a&endDate=b')
    ).resolves.toEqual(occurrences);
  });

  it('throws an API error for non-successful responses', async () => {
    const fetchFn = jest.fn(async () =>
      mockResponse(false, { message: 'Invalid date range' }, 400)
    );

    await expect(
      loadPipelineGlobalSchedule(fetchFn, '/pipelines/schedule?startDate=a&endDate=b')
    ).rejects.toThrow('Invalid date range');
  });

  it('does not treat error payloads as occurrence arrays', async () => {
    const fetchFn = jest.fn(async () =>
      mockResponse(
        false,
        { message: ['startDate must be valid', 'endDate must be valid'] },
        422
      )
    );

    await expect(
      loadPipelineGlobalSchedule(fetchFn, '/pipelines/schedule?startDate=a&endDate=b')
    ).rejects.toThrow('startDate must be valid, endDate must be valid');
  });
});

describe('formatPipelineTimezoneLabel', () => {
  it('shortens IANA timezone identifiers to the city segment', () => {
    expect(formatPipelineTimezoneLabel('America/New_York')).toBe('New York');
    expect(formatPipelineTimezoneLabel('Europe/London')).toBe('London');
  });

  it('returns the original value when no segment is available', () => {
    expect(formatPipelineTimezoneLabel('UTC')).toBe('UTC');
  });
});

describe('formatPipelineSlotShort', () => {
  const now = dayjs.tz('2026-08-23T12:00:00', NEW_YORK);

  it('uses weekday and time for slots in the same week', () => {
    expect(
      formatPipelineSlotShort(
        '2026-08-23T17:00:00.000Z',
        NEW_YORK,
        now
      )
    ).toBe('Sun 1:00 PM');
  });

  it('omits the year for slots later in the same year', () => {
    expect(
      formatPipelineSlotShort(
        '2026-10-15T17:00:00.000Z',
        NEW_YORK,
        now
      )
    ).toBe('Oct 15 · 1:00 PM');
  });

  it('includes the year for slots in a different year', () => {
    expect(
      formatPipelineSlotShort(
        '2027-01-10T17:00:00.000Z',
        NEW_YORK,
        now
      )
    ).toBe('Jan 10, 2027 · 12:00 PM');
  });

  it('returns an em dash when no slot is available', () => {
    expect(formatPipelineSlotShort(undefined, NEW_YORK, now)).toBe('—');
  });
});

describe('filterPipelinesByChannel', () => {
  const channel = (id: string): Integrations =>
    ({
      id,
      name: id,
      inBetweenSteps: false,
      editor: 'normal',
      display: id,
      identifier: id,
      type: 'social',
      picture: '',
      changeProfilePicture: false,
      additionalSettings: '',
      changeNickName: false,
      time: [],
    }) as Integrations;

  const pipeline = (
    id: string,
    channelIds: string[]
  ): PipelineSummary => ({
    id,
    name: id,
    timezone: 'UTC',
    color: '#3366ff',
    active: true,
    scheduleRevision: 1,
    channels: channelIds.map((channelId) => channel(channelId)),
    queueCount: 0,
  });

  const pipelines = [
    pipeline('pipeline-a', ['channel-a', 'channel-b']),
    pipeline('pipeline-b', ['channel-c']),
    pipeline('pipeline-c', ['channel-a']),
  ];

  it('returns every pipeline when no channel is selected', () => {
    expect(filterPipelinesByChannel(pipelines)).toEqual(pipelines);
    expect(filterPipelinesByChannel(pipelines, undefined)).toEqual(pipelines);
  });

  it('keeps only pipelines that include the selected channel', () => {
    expect(
      filterPipelinesByChannel(pipelines, 'channel-a').map((item) => item.id)
    ).toEqual(['pipeline-a', 'pipeline-c']);
  });

  it('returns an empty list when no pipeline includes the channel', () => {
    expect(filterPipelinesByChannel(pipelines, 'channel-missing')).toEqual([]);
  });
});

describe('filterScheduleOccurrencesByChannel', () => {
  const channel = (id: string): Integrations =>
    ({
      id,
      name: id,
      inBetweenSteps: false,
      editor: 'normal',
      display: id,
      identifier: id,
      type: 'social',
      picture: '',
      changeProfilePicture: false,
      additionalSettings: '',
      changeNickName: false,
      time: [],
    }) as Integrations;

  const pipeline = (
    id: string,
    channelIds: string[]
  ): PipelineSummary => ({
    id,
    name: id,
    timezone: 'UTC',
    color: '#3366ff',
    active: true,
    scheduleRevision: 1,
    channels: channelIds.map((channelId) => channel(channelId)),
    queueCount: 0,
  });

  const occurrence = (
    id: string,
    pipelineId: string
  ): PipelineScheduleOccurrence => ({
    id,
    pipelineId,
    pipelineName: pipelineId,
    pipelineTimezone: 'UTC',
    pipelineColor: '#3366ff',
    active: true,
    scheduleRevision: 1,
    dayOfWeek: 1,
    minuteOfDay: 540,
    scheduledFor: '2025-03-10T14:00:00.000Z',
  });

  const pipelines = [
    pipeline('pipeline-a', ['channel-a', 'channel-b']),
    pipeline('pipeline-b', ['channel-c']),
    pipeline('pipeline-c', ['channel-a']),
  ];

  const occurrences = [
    occurrence('occ-a', 'pipeline-a'),
    occurrence('occ-b', 'pipeline-b'),
    occurrence('occ-c', 'pipeline-c'),
  ];

  it('returns every occurrence when no channel is selected', () => {
    expect(filterScheduleOccurrencesByChannel(occurrences, pipelines)).toEqual(
      occurrences
    );
    expect(
      filterScheduleOccurrencesByChannel(occurrences, pipelines, undefined)
    ).toEqual(occurrences);
  });

  it('keeps only occurrences from pipelines that include the channel', () => {
    expect(
      filterScheduleOccurrencesByChannel(
        occurrences,
        pipelines,
        'channel-a'
      ).map((item) => item.id)
    ).toEqual(['occ-a', 'occ-c']);
  });

  it('returns an empty list when no pipeline includes the channel', () => {
    expect(
      filterScheduleOccurrencesByChannel(
        occurrences,
        pipelines,
        'channel-missing'
      )
    ).toEqual([]);
  });
});

describe('filterScheduleOccurrencesByPipeline', () => {
  const occurrence = (
    id: string,
    pipelineId: string
  ): PipelineScheduleOccurrence => ({
    id,
    pipelineId,
    pipelineName: pipelineId,
    pipelineTimezone: 'UTC',
    pipelineColor: '#3366ff',
    active: true,
    scheduleRevision: 1,
    dayOfWeek: 1,
    minuteOfDay: 540,
    scheduledFor: '2025-03-10T14:00:00.000Z',
  });

  const occurrences = [
    occurrence('occ-a', 'pipeline-a'),
    occurrence('occ-b', 'pipeline-b'),
    occurrence('occ-c', 'pipeline-a'),
  ];

  it('returns every occurrence when no pipeline is selected', () => {
    expect(filterScheduleOccurrencesByPipeline(occurrences)).toEqual(
      occurrences
    );
    expect(
      filterScheduleOccurrencesByPipeline(occurrences, undefined)
    ).toEqual(occurrences);
  });

  it('keeps only occurrences for the selected pipeline', () => {
    expect(
      filterScheduleOccurrencesByPipeline(occurrences, 'pipeline-a').map(
        (item) => item.id
      )
    ).toEqual(['occ-a', 'occ-c']);
  });

  it('returns an empty list when no occurrence matches the pipeline', () => {
    expect(
      filterScheduleOccurrencesByPipeline(occurrences, 'pipeline-missing')
    ).toEqual([]);
  });
});
