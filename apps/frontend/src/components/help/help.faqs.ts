export interface HelpFaq {
  id: string;
  question: string;
  slug: string;
  hash: string;
}

export const HELP_FAQS: HelpFaq[] = [
  {
    id: 'schedule-post',
    question: 'How do I schedule a post?',
    slug: 'calendar',
    hash: 'scheduling',
  },
  {
    id: 'connect-channel',
    question: 'How do I connect a channel?',
    slug: 'calendar',
    hash: 'channels-sets-and-signatures',
  },
  {
    id: 'what-is-pipeline',
    question: 'What is a Pipeline?',
    slug: 'pipelines',
    hash: 'what-pipelines-are',
  },
  {
    id: 'draft-with-agent',
    question: 'How do I draft posts with Agent?',
    slug: 'agent',
    hash: 'what-agent-is',
  },
  {
    id: 'invite-team',
    question: 'How do I invite team members?',
    slug: 'settings',
    hash: 'team-members',
  },
];
