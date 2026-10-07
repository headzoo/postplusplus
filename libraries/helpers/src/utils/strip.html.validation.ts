import striptags from 'striptags';
import { parseFragment, serialize } from 'parse5';

const bold = {
  a: '𝗮',
  b: '𝗯',
  c: '𝗰',
  d: '𝗱',
  e: '𝗲',
  f: '𝗳',
  g: '𝗴',
  h: '𝗵',
  i: '𝗶',
  j: '𝗷',
  k: '𝗸',
  l: '𝗹',
  m: '𝗺',
  n: '𝗻',
  o: '𝗼',
  p: '𝗽',
  q: '𝗾',
  r: '𝗿',
  s: '𝘀',
  t: '𝘁',
  u: '𝘂',
  v: '𝘃',
  w: '𝘄',
  x: '𝘅',
  y: '𝘆',
  z: '𝘇',
  A: '𝗔',
  B: '𝗕',
  C: '𝗖',
  D: '𝗗',
  E: '𝗘',
  F: '𝗙',
  G: '𝗚',
  H: '𝗛',
  I: '𝗜',
  J: '𝗝',
  K: '𝗞',
  L: '𝗟',
  M: '𝗠',
  N: '𝗡',
  O: '𝗢',
  P: '𝗣',
  Q: '𝗤',
  R: '𝗥',
  S: '𝗦',
  T: '𝗧',
  U: '𝗨',
  V: '𝗩',
  W: '𝗪',
  X: '𝗫',
  Y: '𝗬',
  Z: '𝗭',
  '1': '𝟭',
  '2': '𝟮',
  '3': '𝟯',
  '4': '𝟰',
  '5': '𝟱',
  '6': '𝟲',
  '7': '𝟳',
  '8': '𝟴',
  '9': '𝟵',
  '0': '𝟬',
};

const underlineMap = {
  a: 'a̲',
  b: 'b̲',
  c: 'c̲',
  d: 'd̲',
  e: 'e̲',
  f: 'f̲',
  g: 'g̲',
  h: 'h̲',
  i: 'i̲',
  j: 'j̲',
  k: 'k̲',
  l: 'l̲',
  m: 'm̲',
  n: 'n̲',
  o: 'o̲',
  p: 'p̲',
  q: 'q̲',
  r: 'r̲',
  s: 's̲',
  t: 't̲',
  u: 'u̲',
  v: 'v̲',
  w: 'w̲',
  x: 'x̲',
  y: 'y̲',
  z: 'z̲',
  A: 'A̲',
  B: 'B̲',
  C: 'C̲',
  D: 'D̲',
  E: 'E̲',
  F: 'F̲',
  G: 'G̲',
  H: 'H̲',
  I: 'I̲',
  J: 'J̲',
  K: 'K̲',
  L: 'L̲',
  M: 'M̲',
  N: 'N̲',
  O: 'O̲',
  P: 'P̲',
  Q: 'Q̲',
  R: 'R̲',
  S: 'S̲',
  T: 'T̲',
  U: 'U̲',
  V: 'V̲',
  W: 'W̲',
  X: 'X̲',
  Y: 'Y̲',
  Z: 'Z̲',
  '1': '1̲',
  '2': '2̲',
  '3': '3̲',
  '4': '4̲',
  '5': '5̲',
  '6': '6̲',
  '7': '7̲',
  '8': '8̲',
  '9': '9̲',
  '0': '0̲',
};

const standardizeNewlines = (value: string) =>
  value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u2028|\u2029/g, '\n');

// One newline between blocks, and no extra break after the last block.
// A paragraph or div whose only content is <br> stays a single blank line.
const convertBlockBreaks = (
  html: string,
  blocks = 'p|div',
  unwrapLists = false
) => {
  const source = unwrapLists ? html.replace(/<\/?(?:ul|ol)[^>]*>/gi, '') : html;

  return source
    .replace(
      new RegExp(`<(${blocks})[^>]*>\\s*<br\\s*/?>\\s*</\\1>`, 'gi'),
      '\n'
    )
    .replace(new RegExp(`^<(?:${blocks})[^>]*>`, 'i'), '')
    .replace(new RegExp(`<(?:${blocks})[^>]*>`, 'gi'), '\n')
    .replace(new RegExp(`</(?:${blocks})>`, 'gi'), '')
    .replace(/<br\s*\/?>/gi, '\n');
};

const decodeEntities = (value: string) =>
  value
    .replace(/&gt;/gi, '>')
    .replace(/&lt;/gi, '<')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

export const stripHtmlValidation = (
  type: 'none' | 'normal' | 'markdown' | 'html',
  val: string,
  replaceBold = false,
  none = false,
  plain = false,
  convertMentionFunction?: (idOrHandle: string, name: string) => string
): string => {
  if (plain) {
    return standardizeNewlines(val);
  }

  const value = serialize(parseFragment(val));

  if (type === 'none') {
    return standardizeNewlines(
      decodeEntities(
        striptags(
          convertBlockBreaks(
            convertBlockBreaks(value, 'p|div'),
            'h1|h2|h3|li|blockquote',
            true
          )
        )
      )
    );
  }

  if (type === 'html') {
    return standardizeNewlines(
      decodeEntities(
        striptags(convertMention(value, convertMentionFunction), [
          'ul',
          'li',
          'h1',
          'h2',
          'h3',
          'p',
          'br',
          'strong',
          'u',
          'a',
        ])
      )
    );
  }

  if (type === 'markdown') {
    return standardizeNewlines(
      decodeEntities(
        striptags(
          convertMention(
            value
              .replace(/<div([^>]*)>/gi, '<p$1>')
              .replace(/<\/div>/gi, '</p>')
              .replace(/<h1>([.\s\S]*?)<\/h1>/g, (match, p1) => {
                return `<h1># ${p1}</h1>\n`;
              })
              .replace(/&amp;/gi, '&')
              .replace(/&nbsp;/gi, ' ')
              .replace(/&quot;/gi, '"')
              .replace(/&#39;/gi, "'")
              .replace(/<h2>([.\s\S]*?)<\/h2>/g, (match, p1) => {
                return `<h2>## ${p1}</h2>\n`;
              })
              .replace(/<h3>([.\s\S]*?)<\/h3>/g, (match, p1) => {
                return `<h3>### ${p1}</h3>\n`;
              })
              .replace(/<u>([.\s\S]*?)<\/u>/g, (match, p1) => {
                return `<u>__${p1}__</u>`;
              })
              .replace(/<strong>([.\s\S]*?)<\/strong>/g, (match, p1) => {
                return `<strong>**${p1}**</strong>`;
              })
              .replace(/<li.*?>([.\s\S]*?)<\/li.*?>/gm, (match, p1) => {
                return `<li>- ${p1.replace(/\n/gm, '')}</li>`;
              })
              .replace(/<p[^>]*>([.\s\S]*?)<\/p>/g, (match, p1) => {
                return `<p>${p1}</p>\n`;
              })
              .replace(
                /<a.*?href="([.\s\S]*?)".*?>([.\s\S]*?)<\/a>/g,
                (match, p1, p2) => {
                  return `<a href="${p1}">[${p2}](${p1})</a>`;
                }
              )
              .replace(/<br\s*\/?>/gi, '\n'),
            convertMentionFunction
          )
        )
      )
        .replace(/&gt;/gi, '>')
        .replace(/&lt;/gi, '<')
    );
  }

  const html = convertBlockBreaks(
    (value || '')
      .replace(/&amp;/gi, '&')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
  );

  if (none) {
    return standardizeNewlines(
      striptags(html).replace(/&gt;/gi, '>').replace(/&lt;/gi, '<')
    );
  }

  if (replaceBold) {
    const processedHtml = convertMention(
      convertToAscii(
        html
          .replace(
            /<a.*?href="([.\s\S]*?)".*?>([.\s\S]*?)<\/a>/g,
            (match, p1, p2) => {
              return `<a href="${p1}">${p1}</a>`;
            }
          )
          .replace(/<ul>/, '\n<ul>')
          .replace(/<\/ul>\n/, '</ul>')
          .replace(/<li.*?>([.\s\S]*?)<\/li.*?>/gm, (match, p1) => {
            return `<li><p>- ${p1.replace(/\n/gm, '')}\n</p></li>`;
          })
      ),
      convertMentionFunction
    );

    return standardizeNewlines(
      striptags(processedHtml)
        .replace(/&gt;/gi, '>')
        .replace(/&lt;/gi, '<')
        .replace(/&𝗹𝘁;/gi, '<')
        .replace(/&𝗴𝘁;/gi, '>')
        .replace(/&g̲t̲;/gi, '>')
        .replace(/&l̲t̲;/gi, '<')
    );
  }

  // Strip all other tags
  return standardizeNewlines(
    striptags(html, ['ul', 'li', 'h1', 'h2', 'h3'])
      .replace(/&gt;/gi, '>')
      .replace(/&lt;/gi, '<')
  );
};

export const convertMention = (
  value: string,
  process?: (idOrHandle: string, name: string) => string
) => {
  if (!process) {
    return value;
  }

  return value.replace(
    /<span.*?data-mention-id="([.\s\S]*?)"[.\s\S]*?>([.\s\S]*?)<\/span>/gi,
    (match, id, name) => {
      return `<span>` + process(id, name) + `</span>`;
    }
  );
};

export const convertToAscii = (value: string): string => {
  return value
    .replace(/<strong>(.+?)<\/strong>/gi, (match, p1) => {
      const replacer = p1.split('').map((char: string) => {
        // @ts-ignore
        return bold?.[char] || char;
      });

      return match.replace(p1, replacer.join(''));
    })
    .replace(/<u>(.+?)<\/u>/gi, (match, p1) => {
      const replacer = p1.split('').map((char: string) => {
        // @ts-ignore
        return underlineMap?.[char] || char;
      });

      return match.replace(p1, replacer.join(''));
    });
};
