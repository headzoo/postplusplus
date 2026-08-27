import {
  MAX_HTTP_LOG_BODY,
  capHttpLogEventType,
  eventEndpoints,
  logEventType,
  hostnameFromUrl,
  readCappedHttpLogBody,
  redactHttpLogUrl,
  serializeHttpLogBody,
  serializeHttpLogHeaders,
  truncateHttpLogBody,
  webhookTargetIdentity,
} from './http-log.serialize';

describe('HTTP log serialization', () => {
  it('caps event type values', () => {
    expect(capHttpLogEventType(' follow.follow ')).toBe('follow.follow');
    expect(capHttpLogEventType('')).toBeUndefined();
  });
  it('redacts sensitive headers and keeps others', () => {
    expect(
      JSON.parse(
        serializeHttpLogHeaders({
          Authorization: 'Bearer secret',
          Cookie: 'session=1',
          'Content-Type': 'application/json',
        })
      )
    ).toEqual({
      Authorization: '[redacted]',
      Cookie: '[redacted]',
      'Content-Type': 'application/json',
    });
  });

  it('redacts access tokens in query strings', () => {
    expect(
      redactHttpLogUrl(
        'https://api.example.com/post?access_token=secret&keep=1'
      )
    ).toBe('https://api.example.com/post?access_token=%5Bredacted%5D&keep=1');
  });

  it('omits binary and streamed bodies', () => {
    expect(serializeHttpLogBody(Buffer.from('file'), 'image/png')).toBe(
      '[binary omitted]'
    );
    expect(serializeHttpLogBody({ pipe() {} })).toBe('[binary omitted]');
  });

  it('truncates large text bodies', () => {
    const body = 'x'.repeat(MAX_HTTP_LOG_BODY + 20);
    const serialized = truncateHttpLogBody(body);
    expect(serialized.startsWith('x'.repeat(MAX_HTTP_LOG_BODY))).toBe(true);
    expect(serialized).toContain('[truncated 20 chars]');
  });

  it('remaps post.create logs to the normalized interaction kind', () => {
    expect(logEventType({ eventType: 'like.create', kind: 'like' })).toBe(
      'like.create'
    );
    expect(logEventType({ eventType: 'post.create', kind: 'reply' })).toBe(
      'post.reply.create'
    );
    expect(logEventType({ eventType: 'post.create', kind: 'repost' })).toBe(
      'post.repost.create'
    );
    expect(
      logEventType({
        eventType: 'post.create',
        kind: 'mention',
        metadata: { referenceType: 'quote' },
      })
    ).toBe('post.quote.create');
    expect(logEventType({ eventType: 'post.create', kind: 'mention' })).toBe(
      'post.mention.create'
    );
    expect(logEventType({ eventType: 'post.create' })).toBe('post.create');
    expect(logEventType(undefined)).toBeUndefined();
  });

  it('extracts a webhook target hostname and event endpoints', () => {
    expect(hostnameFromUrl('https://hooks.example.com/path')).toBe(
      'hooks.example.com'
    );
    expect(hostnameFromUrl('not-a-url')).toBeUndefined();
    expect(
      webhookTargetIdentity('CRM', 'https://hooks.example.com/path')
    ).toEqual({
      displayName: 'CRM',
      username: 'hooks.example.com',
    });
    expect(
      eventEndpoints(
        {
          direction: 'inbound',
          counterparty: { name: 'Alice', username: 'alice' },
        },
        { name: 'My X', profile: 'me' }
      )
    ).toEqual({
      sourceDisplayName: 'Alice',
      sourceUsername: 'alice',
      targetDisplayName: 'My X',
      targetUsername: 'me',
    });
    expect(
      eventEndpoints(
        {
          direction: 'outbound',
          counterparty: { name: 'Bob', username: 'bob' },
        },
        { name: 'My X', profile: 'me' }
      )
    ).toEqual({
      sourceDisplayName: 'My X',
      sourceUsername: 'me',
      targetDisplayName: 'Bob',
      targetUsername: 'bob',
    });
  });

  it('stops reading a streamed response after the cap', async () => {
    const payload = 'x'.repeat(MAX_HTTP_LOG_BODY + 50);
    const encoded = new TextEncoder().encode(payload);
    let cancelled = false;
    const response = {
      headers: { get: () => 'application/json' },
      body: {
        getReader() {
          let read = false;
          return {
            async read() {
              if (read) {
                return { done: true, value: undefined };
              }
              read = true;
              return { done: false, value: encoded };
            },
            async cancel() {
              cancelled = true;
            },
          };
        },
      },
    };

    const body = await readCappedHttpLogBody(response as any);
    expect(cancelled).toBe(true);
    expect(body).toContain('[truncated');
    expect(body.length).toBeLessThan(payload.length);
  });
});
