import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildHelpManifest } from './build-help-manifest.mjs';

const withHelpDir = async (files, callback) => {
  const helpDir = await mkdtemp(path.join(os.tmpdir(), 'postplusplus-help-'));

  try {
    await Promise.all(
      Object.entries(files).map(([name, content]) =>
        writeFile(path.join(helpDir, name), content)
      )
    );
    await callback(helpDir);
  } finally {
    await rm(helpDir, { recursive: true, force: true });
  }
};

test('buildHelpManifest extracts deterministic metadata and ordering', async () => {
  await withHelpDir(
    {
      'zebra.md': '# Zebra\n\nA final topic.\n\n## Repeated **topic**\n',
      'alpha.md': '# Alpha\n\nA first topic.\n\n## First `section`\n',
    },
    async (helpDir) => {
      const manifest = await buildHelpManifest({ helpDir });

      assert.equal(manifest.generated, true);
      assert.deepEqual(
        manifest.pages.map((page) => page.slug),
        ['alpha', 'zebra']
      );
      assert.deepEqual(manifest.pages[0].headings, [
        { level: 2, title: 'First section', anchor: 'first-section' },
      ]);
      assert.equal(manifest.pages[0].headingText, 'First section');
      assert.equal(manifest.pages[0].excerpt, 'A first topic. First section');
      assert.match(manifest.pages[0].markdown, /^# Alpha/m);
      assert.deepEqual(manifest, await buildHelpManifest({ helpDir }));
    }
  );
});

test('buildHelpManifest preserves duplicate heading anchor suffixes', async () => {
  await withHelpDir(
    {
      'calendar.md':
        '# Calendar\n\n## Scheduling\n\nDetails.\n\n## Scheduling\n\n[Second](#scheduling-1)\n',
    },
    async (helpDir) => {
      const manifest = await buildHelpManifest({ helpDir });

      assert.deepEqual(
        manifest.pages[0].headings.map((heading) => heading.anchor),
        ['scheduling', 'scheduling-1']
      );
    }
  );
});

test('buildHelpManifest ignores headings and links in backtick and tilde fences', async () => {
  await withHelpDir(
    {
      'calendar.md': `# Calendar

\`\`\`md
# Example heading
## Example section
[Missing page](/help/missing)
\`\`\`

## Scheduling

~~~md
# Another example heading
## Another example section
[Missing anchor](#missing)
~~~

[Guide](/help/guide#using-it)
`,
      'guide.md': '# Guide\n\n## Using it\n',
    },
    async (helpDir) => {
      const manifest = await buildHelpManifest({ helpDir });

      assert.equal(manifest.pages[0].title, 'Calendar');
      assert.deepEqual(manifest.pages[0].headings, [
        { level: 2, title: 'Scheduling', anchor: 'scheduling' },
      ]);
      assert.equal(manifest.pages[0].headingText, 'Scheduling');
    }
  );
});

test('buildHelpManifest validates cross-page and same-page help links', async () => {
  await withHelpDir(
    {
      'calendar.md':
        '# Calendar\n\n## Scheduling\n\n[Guide](/help/guide#using-it)\n',
      'guide.md':
        '# Guide\n\n## Using it\n\n[Calendar](/help/calendar#scheduling)\n',
    },
    async (helpDir) => {
      await assert.doesNotReject(() => buildHelpManifest({ helpDir }));
    }
  );
});

test('buildHelpManifest rejects missing help pages and fragments', async () => {
  await withHelpDir(
    {
      'calendar.md':
        '# Calendar\n\n## Scheduling\n\n[Missing](/help/missing)\n',
    },
    async (helpDir) => {
      await assert.rejects(
        () => buildHelpManifest({ helpDir }),
        /calendar\.md: unresolved help link \/help\/missing/
      );
    }
  );

  await withHelpDir(
    {
      'calendar.md': '# Calendar\n\n## Scheduling\n\n[Missing](#missing)\n',
    },
    async (helpDir) => {
      await assert.rejects(
        () => buildHelpManifest({ helpDir }),
        /calendar\.md: unresolved help anchor #missing/
      );
    }
  );

  await withHelpDir(
    {
      'calendar.md':
        '# Calendar\n\n## Scheduling\n\n[Missing](/help/calendar#missing)\n',
    },
    async (helpDir) => {
      await assert.rejects(
        () => buildHelpManifest({ helpDir }),
        /calendar\.md: unresolved help anchor \/help\/calendar#missing/
      );
    }
  );
});
