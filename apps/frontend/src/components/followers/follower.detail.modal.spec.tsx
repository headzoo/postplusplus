/**
 * @jest-environment ./jest.jsdom.environment.js
 */

jest.mock('chart.js/auto', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    destroy: jest.fn(),
  })),
}));

import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { FollowerDetailModal } from './follower.detail.modal';
import { FollowerMemberDetail } from './use.followers';

jest.mock('swr', () => ({
  __esModule: true,
  default: jest.fn(),
  useSWRConfig: jest.fn(() => ({ mutate: jest.fn() })),
}));

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: jest.fn(),
}));

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string, params?: Record<string, unknown>) => {
    if (!params) {
      return fallback;
    }
    return Object.entries(params).reduce(
      (result, [name, value]) =>
        result.replace(new RegExp(`{{${name}}}`, 'g'), String(value)),
      fallback
    );
  },
}));

jest.mock('@gitroom/frontend/components/layout/loading', () => ({
  LoadingComponent: () => <div data-testid="loading">Loading</div>,
}));

jest.mock('@gitroom/react/helpers/image.with.fallback', () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

const decisionOpen = jest.fn().mockResolvedValue(true);

jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useDecisionModal: () => ({ open: decisionOpen }),
  useModals: () => ({
    openModal: jest.fn(),
    closeAll: jest.fn(),
    closeById: jest.fn(),
  }),
}));

jest.mock('@gitroom/frontend/components/ui/custom.scroll.area', () => ({
  CustomScrollArea: ({
    children,
    maxHeight,
  }: {
    children: React.ReactNode;
    maxHeight?: string | number;
  }) => (
    <div data-testid="custom-scroll-area" data-max-height={maxHeight}>
      {children}
    </div>
  ),
}));

jest.mock('@mantine/hooks', () => ({
  useClickOutside: () => undefined,
}));

jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: jest.fn() }),
}));

const triageDismissOpen = jest.fn();
const leadDismissOpen = jest.fn();

jest.mock('@gitroom/frontend/components/followers/triage.dismiss.modal', () => ({
  useTriageDismissModal: () => ({ open: triageDismissOpen }),
}));

jest.mock('@gitroom/frontend/components/followers/lead.dismiss.modal', () => ({
  useLeadDismissModal: () => ({ open: leadDismissOpen }),
}));

const launchFollowerCopilotChat = jest.fn();

jest.mock('@gitroom/frontend/components/followers/use.copilot.follower.assistant', () => ({
  launchFollowerCopilotChat: (...args: unknown[]) =>
    launchFollowerCopilotChat(...args),
}));

const useSWR = jest.requireMock('swr').default as jest.Mock;
const useSWRConfig = jest.requireMock('swr').useSWRConfig as jest.Mock;
const mutateCache = jest.fn();
const { useFetch } = jest.requireMock(
  '@gitroom/helpers/utils/custom.fetch'
) as { useFetch: jest.Mock };

const detail: FollowerMemberDetail = {
  follower: {
    id: 'follower-1',
    name: 'Alex Example',
    username: 'alex',
    profileUrl: 'https://example.com/alex',
    bio: 'Builder',
    followersCount: 1200,
    followingCount: 300,
    relationshipTriage: 'over_invested',
  },
  notes: [
    {
      id: 'note-1',
      content: 'Existing note',
      author: { id: 'user-1', name: 'Taylor' },
      createdAt: '2026-01-01T12:00:00.000Z',
      updatedAt: '2026-01-01T12:00:00.000Z',
    },
  ],
  interactions: [
    {
      id: 'event-1',
      kind: 'like',
      direction: 'outbound',
      timestamp: '2026-01-02T12:00:00.000Z',
    },
  ],
  myGrade: null,
  relationship: {
    windowDays: 30,
    cadenceDays: 3,
    formulaVersion: 2,
    current: {
      snapshotAt: '2026-02-01T00:00:00.000Z',
      windowStartedAt: '2026-01-02T00:00:00.000Z',
      effortScore: 10,
      reciprocationScore: 5,
      reciprocity: 0.5,
      grade: 3.5,
      adjustedGrade: 3.5,
      effortStars: 2,
      reciprocationStars: 1.5,
      triage: 'over_invested',
      formulaVersion: 2,
    },
    history: [
      {
        snapshotAt: '2026-01-01T00:00:00.000Z',
        windowStartedAt: '2025-12-02T00:00:00.000Z',
        effortScore: 0,
        reciprocationScore: 0,
        reciprocity: null,
        grade: null,
        adjustedGrade: null,
        effortStars: 1,
        reciprocationStars: 1,
        triage: 'quiet',
        formulaVersion: 2,
      },
      {
        snapshotAt: '2026-02-01T00:00:00.000Z',
        windowStartedAt: '2026-01-02T00:00:00.000Z',
        effortScore: 10,
        reciprocationScore: 5,
        reciprocity: 0.5,
        grade: 3.5,
        adjustedGrade: 3.5,
        effortStars: 2,
        reciprocationStars: 1.5,
        triage: 'over_invested',
        formulaVersion: 2,
      },
    ],
  },
  tracking: {
    state: 'partial',
    noBackfill: true,
    trackingStartedAt: '2026-01-01T00:00:00.000Z',
    coverage: [
      {
        kind: 'repost',
        inbound: 'partial',
        outbound: 'supported',
        reason: 'Inbound reposts are partially tracked',
      },
    ],
  },
};

describe('FollowerDetailModal', () => {
  const mutate = jest.fn().mockResolvedValue(detail);
  const fetchMock = jest.fn();
  let swrDetail: FollowerMemberDetail = detail;

  const mockSwrByKey = (key: string | null) => {
    if (key === '/followers/channels') {
      return {
        data: [
          {
            id: 'channel-1',
            name: 'Channel',
            identifier: 'channel',
            sorts: [],
            canFollowAudienceMember: true,
          },
        ],
        error: undefined,
        isLoading: false,
        mutate,
      };
    }
    if (key === '/followers/channel-1/lists') {
      return {
        data: [
          {
            id: 'list-1',
            name: 'VIP',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        error: undefined,
        isLoading: false,
        mutate,
      };
    }
    if (key && String(key).includes('/member')) {
      return {
        data: swrDetail,
        error: undefined,
        isLoading: false,
        mutate,
      };
    }
    return {
      data: undefined,
      error: undefined,
      isLoading: false,
      mutate,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    swrDetail = detail;
    useFetch.mockReturnValue(fetchMock);
    mutateCache.mockReset();
    useSWRConfig.mockReturnValue({ mutate: mutateCache });
    decisionOpen.mockResolvedValue(true);
    triageDismissOpen.mockReset();
    triageDismissOpen.mockResolvedValue(null);
    leadDismissOpen.mockReset();
    leadDismissOpen.mockResolvedValue(null);
    useSWR.mockImplementation((key: string | null) => mockSwrByKey(key));
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/member/relationship-score')) {
        return {
          ok: true,
          json: async () => ({
            snapshotAt: '2026-08-14T12:00:00.000Z',
            windowStartedAt: '2026-07-15T12:00:00.000Z',
            effortScore: 10,
            reciprocationScore: 30,
            reciprocity: 1 / 3,
            grade: 5,
            adjustedGrade: 5,
            effortStars: 2,
            reciprocationStars: 4,
            triage: 'hot_lead',
            formulaVersion: 2,
          }),
        };
      }
      if (options?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            id: 'note-2',
            content: 'New note',
            author: { id: 'user-2', name: 'Sam' },
            createdAt: '2026-02-02T12:00:00.000Z',
            updatedAt: '2026-02-02T12:00:00.000Z',
          }),
        };
      }
      if (typeof url === 'string' && url.includes('/member/my-grade')) {
        return {
          ok: true,
          json: async () => ({
            myGrade: 4.5,
            adjustedGrade: 4.5,
          }),
        };
      }
      if (options?.method === 'PUT') {
        return { ok: true, json: async () => ({}) };
      }
      if (options?.method === 'DELETE') {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => detail };
    });
  });

  it('shows loading and error states', () => {
    useSWR.mockReturnValueOnce({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate,
    });
    const { rerender } = render(
      <FollowerDetailModal integrationId="channel-1" externalId="follower-1" />
    );
    expect(screen.getByTestId('loading')).toBeTruthy();

    useSWR.mockReturnValueOnce({
      data: undefined,
      error: new Error('failed'),
      isLoading: false,
      mutate,
    });
    rerender(
      <FollowerDetailModal integrationId="channel-1" externalId="follower-1" />
    );
    expect(
      screen.getByText('We could not load this follower right now.')
    ).toBeTruthy();
  });

  it('launches the followers assistant with the username when the AI button is clicked', () => {
    render(
      <FollowerDetailModal integrationId="channel-1" externalId="follower-1" />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Ask AI about @alex' })
    );

    expect(launchFollowerCopilotChat).toHaveBeenCalledWith('alex');
    expect(screen.getByRole('link', { name: 'Timeline' })).toBeTruthy();
  });

  it('renders effort-first relationship details and accessible star labels', () => {
    render(
      <FollowerDetailModal integrationId="channel-1" externalId="follower-1" />
    );

    expect(screen.getByText('Their effort')).toBeTruthy();
    expect(screen.getByText('Your effort')).toBeTruthy();
    expect(screen.getByText('Your grade')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Relationship grade' })
    ).toBeTruthy();
    expect(screen.queryByText('My grade')).toBeNull();
    expect(screen.getByRole('img', { name: '1.5 out of 5' })).toBeTruthy();
    expect(screen.getByRole('img', { name: '2 out of 5' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '4.5 out of 5' })).toBeTruthy();
    expect(screen.getByText('Reciprocity: 50%')).toBeTruthy();
    expect(screen.getByText('E: 10 · R: 5 · Gap: -5')).toBeTruthy();
    expect(screen.getByText('Costly')).toBeTruthy();
    expect(screen.queryByText(/out of 5/i)).toBeNull();
    expect(screen.queryByText('Your effort (E): 10')).toBeNull();
    expect(screen.queryByText('Their reciprocation (R): 5')).toBeNull();
  });

  it('allows bot classification metadata to wrap on narrow screens', () => {
    swrDetail = {
      ...detail,
      follower: {
        ...detail.follower,
        isBot: true,
        botGrade: 4,
        botConfidence: 0.86,
      },
    };

    render(
      <FollowerDetailModal integrationId="channel-1" externalId="follower-1" />
    );

    expect(screen.getByText('Likely bot')).toBeTruthy();
    expect(screen.getByText('Grade 4 of 5').className).toContain('break-words');
    expect(screen.getByText('Confidence 86%').className).toContain(
      'break-words'
    );
  });

  it('renders accessible grade history for every snapshot', () => {
    render(
      <FollowerDetailModal integrationId="channel-1" externalId="follower-1" />
    );

    const table = screen.getByRole('table', { name: 'Relationship history' });
    const rows = within(table).getAllByRole('row');

    expect(rows).toHaveLength(3);
    expect(
      screen.getByText('No grade (not enough tracked activity)')
    ).toBeTruthy();
    expect(screen.getByText('3.5')).toBeTruthy();
  });

  it('renders the relationship chart from current when history is empty', () => {
    swrDetail = {
      ...detail,
      relationship: {
        ...detail.relationship,
        history: [],
      },
    };

    render(
      <FollowerDetailModal integrationId="channel-1" externalId="follower-1" />
    );

    const table = screen.getByRole('table', { name: 'Relationship history' });
    const rows = within(table).getAllByRole('row');

    expect(rows).toHaveLength(2);
    expect(screen.getByText('3.5')).toBeTruthy();
    expect(screen.getByText('E: 10 · R: 5 · Gap: -5')).toBeTruthy();
  });

  it('places recent interactions after notes in a 300px scroll area', () => {
    render(
      <FollowerDetailModal integrationId="channel-1" externalId="follower-1" />
    );

    const notesHeading = screen.getByRole('heading', { name: 'Notes' });
    const interactionsHeading = screen.getByRole('heading', {
      name: 'Recent interactions',
    });

    expect(
      notesHeading.compareDocumentPosition(interactionsHeading) &
      Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByTestId('custom-scroll-area').getAttribute('data-max-height')).toBe(
      '300px'
    );
    expect(screen.getByText('You liked them')).toBeTruthy();
  });

  it('creates notes and revalidates detail', async () => {
    render(
      <FollowerDetailModal integrationId="channel-1" externalId="follower-1" />
    );

    const newNoteInput = document.querySelector(
      'textarea[name="follower-new-note"]'
    ) as HTMLTextAreaElement;
    fireEvent.change(newNoteInput, {
      target: { value: 'New note' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/followers/channel-1/member/notes',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            externalId: 'follower-1',
            content: 'New note',
          }),
        })
      );
      expect(mutate).toHaveBeenCalled();
    });
  });

  it('updates and deletes notes with detail revalidation', async () => {
    render(
      <FollowerDetailModal integrationId="channel-1" externalId="follower-1" />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByDisplayValue('Existing note'), {
      target: { value: 'Updated note' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/followers/channel-1/member/notes/note-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ content: 'Updated note' }),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(decisionOpen).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith(
        '/followers/channel-1/member/notes/note-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  it('shows empty effort stars when no relationship snapshot exists', () => {
    swrDetail = {
      ...detail,
      relationship: {
        ...detail.relationship,
        current: null,
        history: [],
      },
      tracking: {
        state: 'unsupported',
        noBackfill: true,
        coverage: [],
      },
    };

    render(
      <FollowerDetailModal integrationId="channel-1" externalId="follower-1" />
    );

    expect(screen.getAllByRole('img', { name: 'No grade yet' })).toHaveLength(2);
    expect(screen.getByRole('radio', { name: '4.5 out of 5' })).toBeTruthy();
    expect(screen.queryByText('Not enough tracked activity')).toBeNull();
    expect(
      screen.queryByText(/does not support interaction tracking/i)
    ).toBeNull();
  });

  it('shows effort stars when computed grade is null but scores exist', () => {
    swrDetail = {
      ...detail,
      relationship: {
        ...detail.relationship,
        current: {
          ...detail.relationship.current!,
          grade: null,
          adjustedGrade: null,
          reciprocity: null,
        },
      },
    };

    render(
      <FollowerDetailModal integrationId="channel-1" externalId="follower-1" />
    );

    expect(screen.getByRole('img', { name: '1.5 out of 5' })).toBeTruthy();
    expect(screen.getByRole('img', { name: '2 out of 5' })).toBeTruthy();
    expect(screen.queryByText('Not enough tracked activity')).toBeNull();
  });

  it('saves a half-star personal grade and revalidates detail', async () => {
    render(
      <FollowerDetailModal integrationId="channel-1" externalId="follower-1" />
    );

    fireEvent.click(screen.getByRole('radio', { name: '4.5 out of 5' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/followers/channel-1/member/my-grade',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            externalId: 'follower-1',
            grade: 4.5,
          }),
        })
      );
      expect(mutate).toHaveBeenCalled();
      expect(mutateCache).toHaveBeenCalledWith(
        '/followers/channel-1/member?externalId=follower-1',
        expect.any(Function),
        { revalidate: false }
      );
      expect(mutateCache).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        { revalidate: true }
      );
    });
  });

  it('refreshes their effort and revalidates detail', async () => {
    render(
      <FollowerDetailModal integrationId="channel-1" externalId="follower-1" />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refresh their effort' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/followers/channel-1/member/relationship-score',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            externalId: 'follower-1',
            direction: 'their',
          }),
        })
      );
      expect(mutate).toHaveBeenCalled();
      expect(mutateCache).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        { revalidate: true }
      );
    });
  });

  it('refreshes your effort and disables both refresh controls while pending', async () => {
    let resolveFetch:
      | ((value: { ok: boolean; json: () => Promise<Record<string, unknown>> }) => void)
      | undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    render(
      <FollowerDetailModal integrationId="channel-1" externalId="follower-1" />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refresh your effort' }));

    expect(
      screen.getByRole('button', { name: 'Refresh their effort' })
    ).toHaveProperty('disabled', true);
    expect(
      screen.getByRole('button', { name: 'Refresh your effort' })
    ).toHaveProperty('disabled', true);

    resolveFetch?.({
      ok: true,
      json: async () => ({
        snapshotAt: '2026-08-14T12:00:00.000Z',
        windowStartedAt: '2026-07-15T12:00:00.000Z',
        effortScore: 20,
        reciprocationScore: 5,
        reciprocity: 0.25,
        grade: 1,
        adjustedGrade: 1,
        effortStars: 3,
        reciprocationStars: 1.5,
        triage: 'over_invested',
        formulaVersion: 2,
      }),
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/followers/channel-1/member/relationship-score',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            externalId: 'follower-1',
            direction: 'your',
          }),
        })
      );
      expect(mutate).toHaveBeenCalled();
      expect(mutateCache).toHaveBeenCalled();
    });
  });

  it('preserves note draft after a failed save', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false }));

    render(
      <FollowerDetailModal integrationId="channel-1" externalId="follower-1" />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByDisplayValue('Existing note'), {
      target: { value: 'Broken save' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(
        screen.getByText('Could not save this note. Try again.')
      ).toBeTruthy();
    });
    expect(screen.getByDisplayValue('Broken save')).toBeTruthy();
  });

  it('renders lead and fit triage badges beside the display name', () => {
    swrDetail = {
      ...detail,
      follower: {
        ...detail.follower,
        isLead: true,
        leadFitScore: 81,
        leadFitReason: 'Strong product fit',
        relationshipTriage: 'mutual',
      },
    };

    render(
      <FollowerDetailModal integrationId="channel-1" externalId="follower-1" />
    );

    const name = screen.getByRole('heading', { name: 'Alex Example' });
    const lead = screen.getByRole('button', { name: 'Remove Lead badge' });
    const fit = screen.getByText('Fit 81');
    const mutual = screen.getByRole('button', { name: 'Remove Mutual badge' });

    expect(
      name.compareDocumentPosition(lead) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      lead.compareDocumentPosition(fit) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      fit.compareDocumentPosition(mutual) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add to list' })).toBeTruthy();
  });

  it('dismisses a relationship triage badge from the modal header', async () => {
    triageDismissOpen.mockResolvedValue('remove');

    render(
      <FollowerDetailModal integrationId="channel-1" externalId="follower-1" />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Costly badge' })
    );

    await waitFor(() => {
      expect(triageDismissOpen).toHaveBeenCalledWith('Costly');
      expect(fetchMock).toHaveBeenCalledWith(
        '/followers/channel-1/member/triage-ignore',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            externalId: 'follower-1',
            triage: 'over_invested',
          }),
        })
      );
      expect(mutate).toHaveBeenCalled();
    });
  });

  it('dismisses a lead badge from the modal header', async () => {
    swrDetail = {
      ...detail,
      follower: {
        ...detail.follower,
        isLead: true,
        relationshipTriage: null,
      },
    };
    leadDismissOpen.mockResolvedValue({ action: 'remove', reasons: ['bio_wording'] });

    render(
      <FollowerDetailModal integrationId="channel-1" externalId="follower-1" />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove Lead badge' }));

    await waitFor(() => {
      expect(leadDismissOpen).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith(
        '/followers/channel-1/member/triage-ignore',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            externalId: 'follower-1',
            triage: 'lead',
            reasons: ['bio_wording'],
          }),
        })
      );
      expect(mutate).toHaveBeenCalled();
    });
  });
});
