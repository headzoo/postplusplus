import {
  appendReservedParamsToText,
  appendReservedParamsToUrl,
  appendUtmParamsToText,
  appendUtmParamsToUrl,
  isValidUtmParamsString,
  normalizeUtmParamsString,
  parseUtmParamsString,
  shouldSkipUrlForUtm,
} from './utm.params';

describe('utm.params', () => {
  describe('parseUtmParamsString', () => {
    it('parses a query string with optional leading question mark', () => {
      expect(
        parseUtmParamsString('utm_campaign=spring')?.get('utm_campaign')
      ).toBe('spring');
      expect(
        parseUtmParamsString('?utm_campaign=spring')?.get('utm_campaign')
      ).toBe('spring');
    });

    it('rejects hash fragments and empty keys', () => {
      expect(parseUtmParamsString('utm_campaign=a#frag')).toBeNull();
      expect(parseUtmParamsString('=value')).toBeNull();
    });
  });

  describe('isValidUtmParamsString', () => {
    it('accepts empty strings and valid params', () => {
      expect(isValidUtmParamsString('')).toBe(true);
      expect(isValidUtmParamsString('utm_track=33ed')).toBe(true);
    });

    it('rejects invalid params', () => {
      expect(isValidUtmParamsString('utm_campaign=a#frag')).toBe(false);
    });
  });

  describe('normalizeUtmParamsString', () => {
    it('returns canonical query string', () => {
      expect(
        normalizeUtmParamsString('?utm_campaign=spring&utm_track=33ed')
      ).toBe('utm_campaign=spring&utm_track=33ed');
    });
  });

  describe('appendUtmParamsToUrl', () => {
    it('appends missing params and preserves hash', () => {
      const params = parseUtmParamsString('utm_campaign=spring')!;
      expect(
        appendUtmParamsToUrl('https://example.com/page#section', params)
      ).toBe('https://example.com/page?utm_campaign=spring#section');
    });

    it('does not overwrite existing keys', () => {
      const params = parseUtmParamsString('utm_campaign=channel')!;
      expect(
        appendUtmParamsToUrl('https://example.com/?utm_campaign=post', params)
      ).toBe('https://example.com/?utm_campaign=post');
    });

    it('skips shortlink domain URLs', () => {
      const params = parseUtmParamsString('utm_campaign=spring')!;
      expect(appendUtmParamsToUrl('https://dub.sh/abc', params, 'dub.sh')).toBe(
        'https://dub.sh/abc'
      );
      expect(shouldSkipUrlForUtm('https://dub.sh/abc', 'dub.sh')).toBe(true);
    });
  });

  describe('appendUtmParamsToText', () => {
    it('updates multiple URLs in text', () => {
      expect(
        appendUtmParamsToText(
          'See https://example.com/a and https://example.com/b?utm_source=post',
          'utm_campaign=spring'
        )
      ).toBe(
        'See https://example.com/a?utm_campaign=spring and https://example.com/b?utm_source=post&utm_campaign=spring'
      );
    });

    it('returns original text when params are empty', () => {
      expect(appendUtmParamsToText('https://example.com', '')).toBe(
        'https://example.com'
      );
    });
  });

  describe('appendReservedParamsToUrl', () => {
    it('replaces reserved params while preserving queries and fragments', () => {
      expect(
        appendReservedParamsToUrl(
          'https://example.com/page?utm_source=post&pp_click_id=spoofed#section',
          [['pp_click_id', 'generated']]
        )
      ).toBe(
        'https://example.com/page?utm_source=post&pp_click_id=generated#section'
      );
    });

    it('skips configured short-link domains', () => {
      expect(
        appendReservedParamsToUrl(
          'https://short.test/abc',
          [['pp_click_id', 'generated']],
          'short.test'
        )
      ).toBe('https://short.test/abc');
    });
  });

  describe('appendReservedParamsToText', () => {
    it('uses independently generated reserved params for every URL', () => {
      expect(
        appendReservedParamsToText(
          'https://example.com/a and https://example.com/b',
          (url) => [['pp_click_id', url.endsWith('/a') ? 'a' : 'b']]
        )
      ).toBe(
        'https://example.com/a?pp_click_id=a and https://example.com/b?pp_click_id=b'
      );
    });
  });
});
