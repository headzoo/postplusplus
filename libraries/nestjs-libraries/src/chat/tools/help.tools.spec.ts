import { readFileSync } from 'fs';
import { join } from 'path';
import { HelpArticleReadTool } from '@gitroom/nestjs-libraries/chat/tools/help.article.read.tool';
import { HelpSearchTool } from '@gitroom/nestjs-libraries/chat/tools/help.search.tool';
import { HelpTopicsListTool } from '@gitroom/nestjs-libraries/chat/tools/help.topics.list.tool';
import { resetHelpManifestCache } from '@gitroom/nestjs-libraries/help/help.registry';

describe('help agent tools', () => {
  const createContext = (orgId = 'org-1') => {
    const requestContext = new Map<string, string>();
    requestContext.set('organization', JSON.stringify({ id: orgId }));
    return {
      requestContext: {
        get: (key: string) => requestContext.get(key),
        set: (key: string, value: string) => {
          requestContext.set(key, value);
        },
      },
      mcp: {
        extra: {
          authInfo: { id: orgId },
        },
      },
    };
  };

  beforeEach(() => {
    resetHelpManifestCache();
  });

  it('registers help tools once in the shared tool list', () => {
    const toolListSource = readFileSync(
      join(__dirname, 'tool.list.ts'),
      'utf8'
    );

    expect(toolListSource).toContain('HelpTopicsListTool');
    expect(toolListSource).toContain('HelpSearchTool');
    expect(toolListSource).toContain('HelpArticleReadTool');
    expect(toolListSource.match(/(?<![A-Za-z])HelpSearchTool/g)?.length).toBe(
      2
    );
  });

  it('lists topics without markdown bodies', async () => {
    const tool = new HelpTopicsListTool().run();
    const result = await tool.execute!({}, createContext());

    expect(result.output.length).toBeGreaterThan(0);
    expect(result.output[0]).not.toHaveProperty('markdown');
  });

  it('searches and reads help articles', async () => {
    const searchResult = await new HelpSearchTool().run().execute!(
      { query: 'schedule' },
      createContext()
    );

    expect(searchResult.output.some((topic) => topic.slug === 'calendar')).toBe(
      true
    );

    const connectResult = await new HelpSearchTool().run().execute!(
      { query: 'connect channel' },
      createContext()
    );

    expect(
      connectResult.output.some((topic) =>
        ['dashboard', 'calendar', 'settings'].includes(topic.slug)
      )
    ).toBe(true);

    const readResult = await new HelpArticleReadTool().run().execute!(
      { slug: 'calendar', hash: 'scheduling' },
      createContext()
    );

    expect(readResult.output.slug).toBe('calendar');
    expect(readResult.output.markdown).toContain('# Calendar');
    expect(readResult.output.href).toBe('/help/calendar#scheduling');
  });
});
