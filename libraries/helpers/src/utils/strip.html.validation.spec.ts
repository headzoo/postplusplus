import { stripHtmlValidation } from './strip.html.validation';

const asTweet = (html: string) => {
  const message = stripHtmlValidation('html', html, true);
  return stripHtmlValidation(
    'normal',
    message,
    true,
    false,
    !/<\/?[a-z][\s\S]*>/i.test(message)
  );
};

describe('stripHtmlValidation newlines', () => {
  it('keeps a single newline between paragraphs', () => {
    expect(
      stripHtmlValidation('normal', '<p>Hello</p><p>World</p>', true)
    ).toBe('Hello\nWorld');
  });

  it('keeps hard breaks through the X html-then-normal path', () => {
    expect(asTweet('<p>Hello<br>World</p>')).toBe('Hello\nWorld');
    expect(asTweet('<p>Hello<br><br>World</p>')).toBe('Hello\n\nWorld');
  });

  it('turns classed paragraphs and divs into the same newlines', () => {
    expect(
      stripHtmlValidation(
        'normal',
        '<p class="x">Hello</p><p class="x">World</p>',
        true
      )
    ).toBe('Hello\nWorld');
    expect(
      stripHtmlValidation('normal', '<div>Hello</div><div>World</div>', true)
    ).toBe('Hello\nWorld');
  });

  it('keeps a blank line from an empty paragraph', () => {
    expect(
      stripHtmlValidation('normal', '<p>Hello</p><p><br></p><p>World</p>', true)
    ).toBe('Hello\n\nWorld');
  });

  it('leaves bold and link tags in html mode', () => {
    const html =
      '<p>Hello <strong>bold</strong> <a href="https://x.com">link</a></p>';
    expect(stripHtmlValidation('html', html, true)).toBe(html);
  });

  it('still turns bold and links into plain text', () => {
    expect(
      stripHtmlValidation('normal', '<p>Hello <strong>A</strong></p>', true)
    ).toBe('Hello 𝗔');
    expect(
      stripHtmlValidation(
        'normal',
        '<p>See <a href="https://x.com">link</a></p>',
        true
      )
    ).toBe('See https://x.com');
  });

  it('normalizes carriage returns and unicode line separators', () => {
    expect(
      stripHtmlValidation('normal', 'Hello\r\nWorld', false, false, true)
    ).toBe('Hello\nWorld');
    expect(stripHtmlValidation('normal', '<p>Hello\u2028World</p>', true)).toBe(
      'Hello\nWorld'
    );
  });

  it('does not glue markdown or plain-text hard breaks', () => {
    expect(stripHtmlValidation('markdown', '<p>Hello<br>World</p>')).toBe(
      'Hello\nWorld\n'
    );
    expect(stripHtmlValidation('none', '<p>Hello<br>World</p>')).toBe(
      'Hello\nWorld'
    );
    expect(stripHtmlValidation('none', '<p>Hello</p><p>World</p>')).toBe(
      'Hello\nWorld'
    );
  });
});
