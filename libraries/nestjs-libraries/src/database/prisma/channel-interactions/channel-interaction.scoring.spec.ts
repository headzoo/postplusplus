import {
  BOT_CONFIDENCE_THRESHOLD,
  BOT_FORMULA_VERSION,
  calculateBotGrade,
  RELATIONSHIP_FORMULA_VERSION,
} from './channel-interaction.scoring';
import { listChannelStrategies } from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.registry';

describe('relationship formula identity', () => {
  // Due predicates match stored snapshots on the shared engine formula version,
  // so a profile that drifts from it would never look current again.
  it.each(listChannelStrategies().map((strategy) => [strategy.id, strategy]))(
    'keeps %s on the shared engine formula version',
    (_id, strategy: any) => {
      expect(strategy.getScoringProfile().formulaVersion).toBe(
        RELATIONSHIP_FORMULA_VERSION
      );
    }
  );
});

describe('calculateBotGrade', () => {
  const now = new Date('2026-08-20T12:00:00.000Z');

  it('returns a null grade when no usable signals exist', () => {
    expect(calculateBotGrade({})).toEqual({
      botGrade: null,
      isBot: null,
      botConfidence: 0,
      botFormulaVersion: BOT_FORMULA_VERSION,
    });
  });

  it('scores a sparse suspicious profile as likely bot when confidence is high', () => {
    const result = calculateBotGrade({
      name: 'user12345678',
      username: 'user12345678',
      followersCount: 0,
      followingCount: 500,
      accountCreatedAt: new Date('2026-08-01T00:00:00.000Z'),
      now,
    });

    expect(result.botFormulaVersion).toBe(BOT_FORMULA_VERSION);
    expect(result.botConfidence).toBeGreaterThanOrEqual(
      BOT_CONFIDENCE_THRESHOLD
    );
    expect(result.botGrade).toBeGreaterThanOrEqual(4);
    expect(result.isBot).toBe(true);
  });

  it('scores an established engaged profile as likely human', () => {
    const result = calculateBotGrade({
      name: 'Ada Lovelace',
      username: 'ada',
      picture: 'https://example.com/ada.jpg',
      bio: 'Mathematician and writer with a long public history.',
      followersCount: 12000,
      followingCount: 400,
      accountCreatedAt: new Date('2018-01-01T00:00:00.000Z'),
      inboundInteractionCount: 12,
      noteCount: 2,
      likesCount: 5,
      relationshipEffortScore: 10,
      relationshipReciprocationScore: 14,
      now,
    });

    expect(result.botConfidence).toBeGreaterThanOrEqual(
      BOT_CONFIDENCE_THRESHOLD
    );
    expect(result.botGrade).toBeLessThanOrEqual(2);
    expect(result.isBot).toBe(false);
  });

  it('keeps isBot null when confidence is below the threshold', () => {
    const result = calculateBotGrade({
      name: 'Mystery',
      username: 'mystery',
    });

    expect(result.botGrade).not.toBeNull();
    expect(result.botConfidence).toBeLessThan(BOT_CONFIDENCE_THRESHOLD);
    expect(result.isBot).toBeNull();
  });

  it('treats missing counts as unknown instead of suspicious', () => {
    const withCounts = calculateBotGrade({
      name: 'Sparse',
      username: 'sparse',
      followersCount: 0,
      followingCount: 250,
      now,
    });
    const withoutCounts = calculateBotGrade({
      name: 'Sparse',
      username: 'sparse',
      now,
    });

    expect(withoutCounts.botConfidence).toBeLessThan(withCounts.botConfidence);
    expect(withoutCounts.botGrade!).toBeLessThanOrEqual(withCounts.botGrade!);
  });

  it('treats omitted engagement as unknown, and zero engagement as observed', () => {
    const omitted = calculateBotGrade({
      name: 'Ada Lovelace',
      username: 'ada',
      picture: 'https://example.com/ada.jpg',
      bio: 'Mathematician and writer with a long public history.',
      followersCount: 12000,
      followingCount: 400,
      now,
    });
    const zeroed = calculateBotGrade({
      name: 'Ada Lovelace',
      username: 'ada',
      picture: 'https://example.com/ada.jpg',
      bio: 'Mathematician and writer with a long public history.',
      followersCount: 12000,
      followingCount: 400,
      inboundInteractionCount: 0,
      noteCount: 0,
      likesCount: 0,
      now,
    });

    expect(zeroed.botConfidence).toBeGreaterThan(omitted.botConfidence);
    expect(zeroed.botGrade!).toBeLessThanOrEqual(omitted.botGrade!);
  });

  it('uses integer grades between 1 and 5', () => {
    const result = calculateBotGrade({
      name: 'user99999999',
      username: 'user99999999',
      followersCount: 1,
      followingCount: 50,
      now,
    });

    expect([1, 2, 3, 4, 5]).toContain(result.botGrade);
  });
});
