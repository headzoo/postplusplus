import {
  getNextPipelineSlot,
  getPipelineScheduleOccurrencesInRange,
  getUpcomingPipelineSlots,
  PIPELINE_SCHEDULER_GRACE_WINDOW_MS,
  PIPELINE_SLOT_ARM_AHEAD_MS,
} from './pipeline.schedule';

describe('pipeline schedule calculator', () => {
  it('returns no projections for empty, invalid, or invalid-timezone schedules', () => {
    const from = new Date('2026-08-09T00:00:00.000Z');

    expect(getUpcomingPipelineSlots([], 'UTC', from, 3)).toEqual([]);
    expect(
      getUpcomingPipelineSlots(
        [{ dayOfWeek: 7, minuteOfDay: 0 }],
        'UTC',
        from,
        3
      )
    ).toEqual([]);
    expect(
      getUpcomingPipelineSlots(
        [{ dayOfWeek: 0, minuteOfDay: 0 }],
        'Not/A_Timezone',
        from,
        3
      )
    ).toEqual([]);
  });

  it('uses strict future behavior and rolls over to the next week', () => {
    const slots = [{ dayOfWeek: 0, minuteOfDay: 60 }];

    expect(
      getNextPipelineSlot(slots, 'UTC', new Date('2026-08-09T01:00:00.000Z'))
    ).toEqual(new Date('2026-08-16T01:00:00.000Z'));
  });

  it('orders multiple slots on the same day before later weekly slots', () => {
    const slots = [
      { dayOfWeek: 1, minuteOfDay: 0 },
      { dayOfWeek: 0, minuteOfDay: 120 },
      { dayOfWeek: 0, minuteOfDay: 60 },
    ];

    expect(
      getUpcomingPipelineSlots(
        slots,
        'UTC',
        new Date('2026-08-09T00:30:00.000Z'),
        3
      )
    ).toEqual([
      new Date('2026-08-09T01:00:00.000Z'),
      new Date('2026-08-09T02:00:00.000Z'),
      new Date('2026-08-10T00:00:00.000Z'),
    ]);
  });

  it('interprets the weekly schedule in the Pipeline timezone', () => {
    expect(
      getNextPipelineSlot(
        [{ dayOfWeek: 1, minuteOfDay: 9 * 60 }],
        'America/New_York',
        new Date('2026-08-09T00:00:00.000Z')
      )
    ).toEqual(new Date('2026-08-10T13:00:00.000Z'));
  });

  it('skips a nonexistent New York spring-forward local time', () => {
    expect(
      getNextPipelineSlot(
        [{ dayOfWeek: 0, minuteOfDay: 2 * 60 + 30 }],
        'America/New_York',
        new Date('2026-03-07T12:00:00.000Z')
      )
    ).toEqual(new Date('2026-03-15T06:30:00.000Z'));
  });

  it('chooses the first occurrence of an ambiguous New York fall-back time', () => {
    expect(
      getNextPipelineSlot(
        [{ dayOfWeek: 0, minuteOfDay: 60 + 30 }],
        'America/New_York',
        new Date('2026-10-31T12:00:00.000Z')
      )
    ).toEqual(new Date('2026-11-01T05:30:00.000Z'));
  });

  it('expands source slots into UTC instants within a bounded range', () => {
    expect(
      getPipelineScheduleOccurrencesInRange(
        [{ dayOfWeek: 1, minuteOfDay: 9 * 60 }],
        'America/New_York',
        new Date('2026-08-10T12:00:00.000Z'),
        new Date('2026-08-11T12:00:00.000Z')
      )
    ).toEqual([
      {
        dayOfWeek: 1,
        minuteOfDay: 9 * 60,
        scheduledFor: new Date('2026-08-10T13:00:00.000Z'),
      },
    ]);
  });

  it('includes a Pipeline-local date reached across a UTC date boundary', () => {
    expect(
      getPipelineScheduleOccurrencesInRange(
        [{ dayOfWeek: 1, minuteOfDay: 30 }],
        'Pacific/Auckland',
        new Date('2026-06-07T12:00:00.000Z'),
        new Date('2026-06-08T12:00:00.000Z')
      )
    ).toEqual([
      {
        dayOfWeek: 1,
        minuteOfDay: 30,
        scheduledFor: new Date('2026-06-07T12:30:00.000Z'),
      },
    ]);
  });

  it('uses scheduler DST behavior and a half-open end boundary in ranges', () => {
    expect(
      getPipelineScheduleOccurrencesInRange(
        [{ dayOfWeek: 0, minuteOfDay: 2 * 60 + 30 }],
        'America/New_York',
        new Date('2026-03-08T00:00:00.000Z'),
        new Date('2026-03-09T00:00:00.000Z')
      )
    ).toEqual([]);
    expect(
      getPipelineScheduleOccurrencesInRange(
        [{ dayOfWeek: 0, minuteOfDay: 60 + 30 }],
        'America/New_York',
        new Date('2026-11-01T05:00:00.000Z'),
        new Date('2026-11-01T06:00:00.000Z')
      )
    ).toEqual([
      {
        dayOfWeek: 0,
        minuteOfDay: 60 + 30,
        scheduledFor: new Date('2026-11-01T05:30:00.000Z'),
      },
    ]);
    expect(
      getPipelineScheduleOccurrencesInRange(
        [{ dayOfWeek: 0, minuteOfDay: 60 }],
        'UTC',
        new Date('2026-08-09T00:00:00.000Z'),
        new Date('2026-08-09T01:00:00.000Z')
      )
    ).toEqual([]);
  });

  it('defines the scheduler grace window as two minutes', () => {
    expect(PIPELINE_SCHEDULER_GRACE_WINDOW_MS).toBe(2 * 60 * 1000);
  });

  it('arms the next slot up to a day before it is due', () => {
    expect(PIPELINE_SLOT_ARM_AHEAD_MS).toBe(24 * 60 * 60 * 1000);
  });
});
