import { FC, ReactNode } from 'react';

const TOPIC_COLOR_CLASSES: Record<string, string> = {
  calendar: 'bg-[#1d9bf0]',
  agent: 'bg-[#D82D7E]',
  dashboard: 'bg-[#8155dd]',
  docs: 'bg-[#0f766e]',
  followers: 'bg-[#d97706]',
  media: 'bg-[#16a34a]',
  pipelines: 'bg-[#eb3825]',
  rules: 'bg-[#2563eb]',
  settings: 'bg-[#6b7280]',
};

const DEFAULT_TOPIC_COLOR_CLASS = 'bg-[#313030]';

const ThumbnailShell: FC<{ children: ReactNode; colorClass: string }> = ({
  children,
  colorClass,
}) => (
  <span
    className={`flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-[10px] text-white ${colorClass}`}
  >
    {children}
  </span>
);

const Icon: FC<{ children: ReactNode }> = ({ children }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const topicColorClass = (slug: string) =>
  TOPIC_COLOR_CLASSES[slug] ?? DEFAULT_TOPIC_COLOR_CLASS;

export const HelpTopicThumbnail: FC<{ slug: string }> = ({ slug }) => {
  const colorClass = topicColorClass(slug);

  switch (slug) {
    case 'calendar':
      return (
        <ThumbnailShell colorClass={colorClass}>
          <Icon>
            <path
              d="M8 3v3M16 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
              {...stroke}
            />
          </Icon>
        </ThumbnailShell>
      );
    case 'agent':
      return (
        <ThumbnailShell colorClass={colorClass}>
          <Icon>
            <path
              d="M12 3v2M8 9h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z"
              {...stroke}
            />
            <path d="M9.5 13h.01M14.5 13h.01M10 16h4" {...stroke} />
          </Icon>
        </ThumbnailShell>
      );
    case 'dashboard':
      return (
        <ThumbnailShell colorClass={colorClass}>
          <Icon>
            <path
              d="M4 13h6v7H4v-7ZM14 4h6v16h-6V4ZM4 4h6v7H4V4Z"
              {...stroke}
            />
          </Icon>
        </ThumbnailShell>
      );
    case 'docs':
      return (
        <ThumbnailShell colorClass={colorClass}>
          <Icon>
            <path
              d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"
              {...stroke}
            />
            <path d="M14 3v5h5M9 13h6M9 17h4" {...stroke} />
          </Icon>
        </ThumbnailShell>
      );
    case 'followers':
      return (
        <ThumbnailShell colorClass={colorClass}>
          <Icon>
            <path
              d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M18.5 20v-1.2a2.8 2.8 0 0 0-2-2.7M12.5 7.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM19 8.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z"
              {...stroke}
            />
          </Icon>
        </ThumbnailShell>
      );
    case 'media':
      return (
        <ThumbnailShell colorClass={colorClass}>
          <Icon>
            <path
              d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"
              {...stroke}
            />
            <path
              d="M8 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM4.5 16.5l4-3.5 3 2.5 3.5-4 4.5 5"
              {...stroke}
            />
          </Icon>
        </ThumbnailShell>
      );
    case 'pipelines':
      return (
        <ThumbnailShell colorClass={colorClass}>
          <Icon>
            <path
              d="M4 7h16M4 12h10M4 17h13M16 9.5V14.5M16 9.5l2 2M16 9.5l-2 2"
              {...stroke}
            />
          </Icon>
        </ThumbnailShell>
      );
    case 'rules':
      return (
        <ThumbnailShell colorClass={colorClass}>
          <Icon>
            <circle cx="12" cy="12" r="8" {...stroke} />
            <path d="M12 8v4M12 12h4M12 12H8" {...stroke} />
          </Icon>
        </ThumbnailShell>
      );
    case 'settings':
      return (
        <ThumbnailShell colorClass={colorClass}>
          <Icon>
            <circle cx="12" cy="12" r="3" {...stroke} />
            <path
              d="M12 4.5v1.2M12 18.3v1.2M7.05 7.05l.85.85M16.1 16.1l.85.85M4.5 12h1.2M18.3 12h1.2M7.05 16.95l.85-.85M16.1 7.9l.85-.85"
              {...stroke}
            />
          </Icon>
        </ThumbnailShell>
      );
    default:
      return (
        <ThumbnailShell colorClass={colorClass}>
          <Icon>
            <circle cx="12" cy="12" r="8" {...stroke} />
            <path d="M12 8v5M12 16h.01" {...stroke} />
          </Icon>
        </ThumbnailShell>
      );
  }
};

export const toTopicOneLiner = (excerpt: string, max = 90) => {
  const firstSentence =
    excerpt.split(/(?<=[.!?])\s+/)[0]?.trim() || excerpt.trim();
  if (firstSentence.length <= max) {
    return firstSentence;
  }

  return `${firstSentence.slice(0, max - 1).trimEnd()}…`;
};
