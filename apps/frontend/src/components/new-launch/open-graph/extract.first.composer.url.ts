const TRAILING_PUNCTUATION = /[.,;:!?)']+$/;
const TEXT_URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const ANCHOR_HREF_PATTERN = /<a\b[^>]*\shref=["']([^"']+)["']/gi;

function trimTrailingPunctuation(value: string): string {
  return value.replace(TRAILING_PUNCTUATION, '');
}

export function normalizeComposerUrl(raw: string): string | null {
  try {
    const trimmed = trimTrailingPunctuation(raw.trim());
    if (!trimmed) {
      return null;
    }

    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    parsed.hash = '';
    return parsed.href;
  } catch {
    return null;
  }
}

function extractFromText(text: string): string | null {
  const matches = text.match(TEXT_URL_PATTERN) || [];

  for (const match of matches) {
    const normalized = normalizeComposerUrl(match);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function extractAnchorHrefsFromHtml(content: string): string[] {
  const hrefs: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = ANCHOR_HREF_PATTERN.exec(content)) !== null) {
    hrefs.push(match[1]);
  }

  return hrefs;
}

function extractAnchorHrefsWithDomParser(content: string): string[] {
  const doc = new DOMParser().parseFromString(content, 'text/html');
  const anchors = doc.querySelectorAll('a[href]');
  const hrefs: string[] = [];

  anchors.forEach((anchor) => {
    const href = anchor.getAttribute('href');
    if (href) {
      hrefs.push(href);
    }
  });

  return hrefs;
}

export function extractFirstComposerUrl(
  content?: string | null
): string | null {
  if (!content?.trim()) {
    return null;
  }

  const anchorHrefs =
    typeof DOMParser !== 'undefined'
      ? extractAnchorHrefsWithDomParser(content)
      : extractAnchorHrefsFromHtml(content);

  for (const href of anchorHrefs) {
    const normalized = normalizeComposerUrl(href);
    if (normalized) {
      return normalized;
    }
  }

  const textSource =
    typeof DOMParser !== 'undefined'
      ? new DOMParser().parseFromString(content, 'text/html').body
          ?.textContent || ''
      : content.replace(/<[^>]+>/g, ' ');

  const fromText = extractFromText(textSource);
  if (fromText) {
    return fromText;
  }

  return extractFromText(content);
}
