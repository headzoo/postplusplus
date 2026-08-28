/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { render } from '@testing-library/react';
import {
  useCopilotHelpPageProperties,
  useHelpPanelOpen,
  usePublishHelpPanelOpen,
} from './use.copilot.help.page';
import type { HelpPageContext } from '@gitroom/nestjs-libraries/help/help.types';

const copilotApiConfig = { properties: {} as Record<string, unknown> };

jest.mock('@copilotkit/react-core', () => ({
  useCopilotContext: () => ({ copilotApiConfig }),
}));

const Probe: React.FC<{ page: HelpPageContext | null }> = ({ page }) => {
  useCopilotHelpPageProperties(page);
  return null;
};

const OpenProbe: React.FC<{ open: boolean }> = ({ open }) => {
  usePublishHelpPanelOpen(open);
  return null;
};

const OpenReader: React.FC<{ onValue: (value: boolean) => void }> = ({
  onValue,
}) => {
  onValue(useHelpPanelOpen());
  return null;
};

describe('use.copilot.help.page', () => {
  beforeEach(() => {
    copilotApiConfig.properties = {};
  });

  it('writes helpPage into CopilotKit request properties', () => {
    const page: HelpPageContext = {
      open: true,
      view: 'article',
      slug: 'calendar',
      title: 'Calendar',
    };

    const { unmount } = render(<Probe page={page} />);
    expect(copilotApiConfig.properties.helpPage).toEqual(page);

    unmount();
    expect(copilotApiConfig.properties.helpPage).toBeUndefined();
  });

  it('publishes help panel open state for sibling assistants', () => {
    let open = false;
    const { rerender, unmount } = render(
      <>
        <OpenProbe open />
        <OpenReader
          onValue={(value) => {
            open = value;
          }}
        />
      </>
    );

    expect(open).toBe(true);
    rerender(
      <>
        <OpenProbe open={false} />
        <OpenReader
          onValue={(value) => {
            open = value;
          }}
        />
      </>
    );
    expect(open).toBe(false);
    unmount();
  });
});
