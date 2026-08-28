export type HelpHeading = {
  level: number;
  title: string;
  anchor: string;
};

export type HelpArticle = {
  slug: string;
  title: string;
  headings: HelpHeading[];
  headingText: string;
  excerpt: string;
  markdown: string;
};

export type HelpManifest = {
  generated: true;
  pages: HelpArticle[];
};

export type HelpTopicMetadata = {
  slug: string;
  title: string;
  excerpt: string;
  headings: HelpHeading[];
};

export type HelpPageContext = {
  open: true;
  view: 'catalog' | 'article';
  slug?: string;
  hash?: string;
  title?: string;
  searchQuery?: string;
};
