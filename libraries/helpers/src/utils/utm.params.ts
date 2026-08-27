import { urlRegex } from '@gitroom/helpers/utils/strip.links';

export function decodeUrlEntitiesInText(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quest;/g, '?')
    .replace(/&num;/g, '#');
}

export function parseUtmParamsString(input: string): URLSearchParams | null {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.includes('#')) {
    return null;
  }

  const query = trimmed.startsWith('?') ? trimmed.slice(1) : trimmed;
  if (!query) {
    return null;
  }

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(query);
  } catch {
    return null;
  }

  for (const key of params.keys()) {
    if (!key) {
      return null;
    }
  }

  return params;
}

export function isValidUtmParamsString(input: string): boolean {
  if (!input || !input.trim()) {
    return true;
  }
  return parseUtmParamsString(input) !== null;
}

export function normalizeUtmParamsString(input: string): string | null {
  const params = parseUtmParamsString(input);
  if (!params) {
    return null;
  }
  const normalized = params.toString();
  return normalized || null;
}

export function shouldSkipUrlForUtm(
  url: string,
  shortLinkDomain?: string
): boolean {
  if (!shortLinkDomain || shortLinkDomain === 'empty') {
    return false;
  }
  return url.indexOf(shortLinkDomain) > -1;
}

export function appendUtmParamsToUrl(
  url: string,
  utmParams: URLSearchParams,
  shortLinkDomain?: string
): string {
  if (shouldSkipUrlForUtm(url, shortLinkDomain)) {
    return url;
  }

  const hashIndex = url.indexOf('#');
  const urlWithoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';

  try {
    const parsed = new URL(urlWithoutHash);
    for (const [key, value] of utmParams.entries()) {
      if (!parsed.searchParams.has(key)) {
        parsed.searchParams.append(key, value);
      }
    }
    return `${parsed.toString()}${hash}`;
  } catch {
    return url;
  }
}

export type ReservedUrlParams =
  | URLSearchParams
  | Iterable<readonly [string, string]>;

export function appendReservedParamsToUrl(
  url: string,
  reservedParams: ReservedUrlParams,
  shortLinkDomain?: string
): string {
  if (shouldSkipUrlForUtm(url, shortLinkDomain)) {
    return url;
  }

  const hashIndex = url.indexOf('#');
  const urlWithoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';

  try {
    const parsed = new URL(urlWithoutHash);
    for (const [key, value] of reservedParams) {
      parsed.searchParams.set(key, value);
    }
    return `${parsed.toString()}${hash}`;
  } catch {
    return url;
  }
}

export function appendReservedParamsToText(
  text: string,
  getReservedParams: (url: string) => ReservedUrlParams,
  shortLinkDomain?: string
): string {
  const decoded = decodeUrlEntitiesInText(text);
  const regex = urlRegex();

  return decoded.replace(regex, (url) =>
    appendReservedParamsToUrl(url, getReservedParams(url), shortLinkDomain)
  );
}

export function appendUtmParamsToText(
  text: string,
  utmParamsString: string | null | undefined,
  shortLinkDomain?: string
): string {
  const utmParams = utmParamsString
    ? parseUtmParamsString(utmParamsString)
    : null;
  if (!utmParams) {
    return text;
  }

  const decoded = decodeUrlEntitiesInText(text);
  const regex = urlRegex();

  return decoded.replace(regex, (url) =>
    appendUtmParamsToUrl(url, utmParams, shortLinkDomain)
  );
}
