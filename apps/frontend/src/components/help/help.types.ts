'use client';

export interface HelpHeading {
  level: number;
  title: string;
  anchor: string;
}

export interface HelpArticle {
  slug: string;
  title: string;
  headings: HelpHeading[];
  headingText: string;
  excerpt: string;
  markdown: string;
}

export interface HelpManifest {
  generated: true;
  pages: HelpArticle[];
}

export interface HelpHistoryEntry {
  slug: string;
  hash?: string;
}
