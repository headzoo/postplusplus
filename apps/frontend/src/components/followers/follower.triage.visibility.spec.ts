import {
  readHiddenTriageSlugs,
  writeHiddenTriageSlugs,
} from './follower.triage.visibility';

describe('follower.triage.visibility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns an empty list when nothing is stored', () => {
    expect(readHiddenTriageSlugs('channel-1')).toEqual([]);
    expect(readHiddenTriageSlugs(undefined)).toEqual([]);
  });

  it('persists hidden slugs per integration id', () => {
    writeHiddenTriageSlugs('channel-1', ['bots', 'ignored']);
    writeHiddenTriageSlugs('channel-2', ['hot']);

    expect(readHiddenTriageSlugs('channel-1')).toEqual(['bots', 'ignored']);
    expect(readHiddenTriageSlugs('channel-2')).toEqual(['hot']);
  });

  it('falls back to empty hidden slugs for invalid stored json', () => {
    localStorage.setItem(
      'followers.triage.visibility.channel-1',
      '{not-json'
    );

    expect(readHiddenTriageSlugs('channel-1')).toEqual([]);
  });
});
