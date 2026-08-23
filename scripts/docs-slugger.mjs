/**
 * Shared heading slug helpers for docs validation and VitePress anchor ids.
 */

/**
 * Removes inline Markdown syntax that should not participate in anchor ids.
 *
 * @param {string} value Markdown heading text.
 * @returns {string} Plain heading text.
 */
export const normalizeHeadingText = (value) =>
  value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~]/g, '')
    .trim();

/**
 * Removes fenced code blocks without changing the remaining Markdown content.
 *
 * @param {string} markdown Markdown contents.
 * @returns {string} Markdown outside fenced code blocks.
 */
export const withoutFencedCodeBlocks = (markdown) => {
  let fence;

  return markdown
    .split('\n')
    .filter((line) => {
      const marker = /^(?: {0,3})(`{3,}|~{3,})/.exec(line)?.[1];

      if (fence) {
        if (
          marker &&
          marker[0] === fence.character &&
          marker.length >= fence.length
        ) {
          fence = undefined;
        }

        return false;
      }

      if (marker) {
        fence = { character: marker[0], length: marker.length };
        return false;
      }

      return true;
    })
    .join('\n');
};

/**
 * Converts a heading to the anchor id used in README TOC links and VitePress headings.
 *
 * @param {string} value Markdown heading text.
 * @returns {string} Anchor id.
 */
export const toAnchor = (value) =>
  normalizeHeadingText(value)
    .toLowerCase()
    .replace(/&amp;/g, '')
    .replace(/&/g, '')
    .replace(/\s/g, '-')
    .replace(/[^\p{Letter}\p{Number}-]/gu, '')
    .trim()
    .replace(/^-+|-+$/g, '');

/**
 * Extracts markdown headings from markdown content.
 *
 * @param {string} markdown Markdown contents.
 * @returns {{ level: number; title: string; anchor: string }[]} Heading metadata.
 */
export const getHeadings = (markdown) => {
  const usedAnchors = new Map();

  return withoutFencedCodeBlocks(markdown)
    .split('\n')
    .map((line) => /^(#{2,6})\s+(.+)$/.exec(line))
    .filter(Boolean)
    .map((match) => {
      const title = match[2].trim();
      const anchor = toAnchor(title);
      const anchorCount = usedAnchors.get(anchor) ?? 0;

      usedAnchors.set(anchor, anchorCount + 1);

      return {
        level: match[1].length,
        title,
        anchor: anchorCount === 0 ? anchor : `${anchor}-${anchorCount}`,
      };
    })
    .filter((heading) => heading.title !== 'Table of contents');
};
