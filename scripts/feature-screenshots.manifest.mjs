/**
 * Maps docs/features.md sections to frontend routes for screenshot capture.
 *
 * Sections without a dedicated app page (Automation And API Access,
 * Self-Hosted And Hosted Usage) are intentionally omitted until a suitable
 * page or marketing asset exists.
 *
 * @typedef {{
 *   title: string;
 *   route: string;
 *   file: string;
 *   waitSelector?: string;
 * }} FeatureScreenshot
 */

/** @type {FeatureScreenshot[]} */
export const featureScreenshots = [
  {
    title: 'Multi-Channel Scheduling',
    route: '/calendar',
    file: 'calendar.png',
    waitSelector: 'body',
  },
  {
    title: 'Pipelines',
    route: '/pipelines',
    file: 'pipelines.png',
    waitSelector: 'body',
  },
  {
    title: 'Autopost',
    route: '/pipelines/schedule',
    file: 'autopost.png',
    waitSelector: 'body',
  },
  {
    title: 'Agents And Assisted Creation',
    route: '/agents',
    file: 'agents.png',
    waitSelector: 'body',
  },
  {
    title: 'Analytics',
    route: '/analytics',
    file: 'analytics.png',
    waitSelector: 'body',
  },
  {
    title: 'Followers And Audience Tools',
    route: '/followers',
    file: 'followers.png',
    waitSelector: 'body',
  },
  {
    title: 'Media Library',
    route: '/media',
    file: 'media-library.png',
    waitSelector: 'body',
  },
  {
    title: 'Context Documents',
    route: '/context',
    file: 'context-documents.png',
    waitSelector: 'body',
  },
];
