import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FollowerBotScoreScheduleDto } from './follower-bot-score.schedule.dto';

describe('FollowerBotScoreScheduleDto', () => {
  const run = (value: Record<string, unknown>) =>
    validate(plainToInstance(FollowerBotScoreScheduleDto, value));

  it('accepts a six hour interval', async () => {
    expect(await run({ intervalHours: 6 })).toHaveLength(0);
  });

  it('rejects intervals below one hour', async () => {
    const errors = await run({ intervalHours: 0 });
    expect(errors.some((error) => error.property === 'intervalHours')).toBe(
      true
    );
  });

  it('rejects intervals above one week', async () => {
    const errors = await run({ intervalHours: 169 });
    expect(errors.some((error) => error.property === 'intervalHours')).toBe(
      true
    );
  });
});
