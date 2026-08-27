import {
  isXLongPostSubscription,
  isXPremium,
  X_ARTICLE_MAX_LENGTH,
  X_PREMIUM_MAX_LENGTH,
  X_STANDARD_MAX_LENGTH,
  xMaxLength,
} from './count.length';

describe('isXLongPostSubscription', () => {
  it('is false when subscription is missing or free', () => {
    expect(isXLongPostSubscription()).toBe(false);
    expect(isXLongPostSubscription(null)).toBe(false);
    expect(isXLongPostSubscription('None')).toBe(false);
  });

  it('is true for paid X subscription tiers', () => {
    expect(isXLongPostSubscription('Basic')).toBe(true);
    expect(isXLongPostSubscription('Premium')).toBe(true);
    expect(isXLongPostSubscription('PremiumPlus')).toBe(true);
  });
});

describe('isXPremium', () => {
  it('is false when settings are missing', () => {
    expect(isXPremium()).toBe(false);
    expect(isXPremium([])).toBe(false);
  });

  it('is true when Premium is enabled', () => {
    expect(isXPremium([{ title: 'Premium', value: true }])).toBe(true);
  });

  it('supports the legacy Verified setting', () => {
    expect(isXPremium([{ title: 'Verified', value: true }])).toBe(true);
  });

  it('accepts a boolean from legacy callers', () => {
    expect(isXPremium(true)).toBe(true);
    expect(isXPremium(false)).toBe(false);
  });
});

describe('xMaxLength', () => {
  it('returns the standard tweet limit by default', () => {
    expect(xMaxLength()).toBe(X_STANDARD_MAX_LENGTH);
    expect(xMaxLength([])).toBe(X_STANDARD_MAX_LENGTH);
  });

  it('returns the premium tweet limit when Premium is enabled', () => {
    expect(xMaxLength([{ title: 'Premium', value: true }])).toBe(
      X_PREMIUM_MAX_LENGTH
    );
  });

  it('returns the premium tweet limit for the legacy Verified setting', () => {
    expect(xMaxLength([{ title: 'Verified', value: true }])).toBe(
      X_PREMIUM_MAX_LENGTH
    );
  });

  it('returns the article limit regardless of premium', () => {
    expect(xMaxLength(false, 'article')).toBe(X_ARTICLE_MAX_LENGTH);
    expect(xMaxLength([{ title: 'Premium', value: true }], 'article')).toBe(
      X_ARTICLE_MAX_LENGTH
    );
  });
});
