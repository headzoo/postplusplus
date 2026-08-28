# Conversations

Conversations is your inbound activity inbox. Open it from **Conversations** in the main navigation (`/conversation`). It lists recent public interactions with your connected channels—mentions, quote posts, and reposts—so you can review them and respond without leaving Post++.

Conversations is a **product inbox**. It is **not** the same as [Settings → Logs](/help/settings#logs), which is for operational diagnostics and webhook delivery history.

## What Conversations is for

For each supported channel you can:

- See recent inbound **mentions**, **quotes**, and **reposts** in one feed
- Read polished status cards with author, text, media, and quoted/repost context
- **Like** or **Reply** on the provider website in a reused browser tab
- **Repost** immediately through your connected account
- **Quote** by opening the Post++ composer to review and publish

There is no read/unread state, dismissal, or notification badge in the current release.

## Which interactions appear

Conversations shows inbound items that mention your connected account or reference its posts:

| Kind        | What it means                                        |
| ----------- | ---------------------------------------------------- |
| **Mention** | Someone @mentioned your account in a post            |
| **Quote**   | Someone quoted one of your posts in their own status |
| **Repost**  | Someone reposted one of your posts to their audience |

**Replies** to your posts are **not** included in this inbox. The feed is newest-first and paginated.

## Provider support

**Version 1 supports X (Twitter) only** for both data and card rendering. The page, API, and action model are built to add more providers later, but other channels do not appear in Conversations today.

If you see **No conversation channels yet** or an empty feed, connect an X account from the [Calendar](/help/calendar) (**Add Channel**), authorize interaction tracking (below), and wait for new inbound events.

## Interaction tracking

Conversations relies on the same **interaction tracking** used by [Followers](/help/followers). Tracking is **forward-looking**:

- Only interactions received **after** tracking is enabled and authorized appear here.
- Older mentions, quotes, and reposts are **not** backfilled.
- Events recorded before Post++ stored full status snapshots may show partial cards until they are enriched (see [Incomplete snapshots](#incomplete-snapshots)).

Enable or fix tracking under [Settings → Channels](/help/settings#channels-and-connection-health):

- **Authorize tracking** / **Reauthorize tracking** when interaction permissions need an extra grant
- **Refresh OAuth** if the connection is stale

For relationship grades, effort scores, and CRM context on the people involved, use [Followers](/help/followers).

## Browse, filter, and pagination

1. Open **Conversations** from the main navigation.
2. Optionally filter by a connected channel when more than one X account is eligible.
3. Scroll the feed and use **Load more** (or equivalent pagination) for older items.

The default page size is modest; very active accounts may need to paginate to reach earlier items. There is no date-range filter in the current release.

## Status cards

Each item is rendered as a custom status card (not an official provider embed). When data is complete, a card typically includes:

- Author avatar, display name, and handle
- Relative time and a link to the live post on X
- Post text with clickable @mentions and URLs
- Media thumbnails when the post includes images or video
- **Quote** or **repost** context when the interaction references another status

Cards resemble native X statuses but are drawn by Post++ so the action bar stays consistent in the app.

## Incomplete snapshots

Post++ stores a bounded snapshot of each inbound status when the interaction is recorded. Some older or edge-case events may arrive with incomplete text, media, or nested quote/repost details.

When a visible card is incomplete, Post++ may request a one-time **hydration** fetch from X using your connected credentials, then refresh the row. Hydration is enrichment only—it does not discover historical interactions you never received.

If hydration fails or the provider no longer exposes the post, the card may stay partial or show an error state.

## Actions

Every card exposes **Reply**, **Repost**, and **Like**. **Quote** is available when the provider supports quoting that item.

| Action     | What happens in Post++                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Like**   | Opens the status on **x.com** in the shared `postplusplus-external-post` browser tab. You like the post manually on X—Post++ does **not** call an API to like for you.                     |
| **Reply**  | Opens X’s reply intent (`in_reply_to` the post id) in the same reused tab so you can compose and send the reply on X. Post++ does **not** post the reply through its API.                  |
| **Repost** | Calls the X API **immediately** through the connected channel’s **posting** credential. The repost happens as soon as you confirm—there is no separate draft step.                         |
| **Quote**  | Opens the Post++ post composer with the source status attached as a **quote reference**. Review copy, timing, and channels, then publish as you would from the [Calendar](/help/calendar). |

Some rows disable **Repost** or **Quote** when the action is not valid—for example, reposting your own status, or quoting a post your account cannot reference. Disabled actions show a reason instead of failing silently.

Like and Reply always leave Post++ for X. Repost and Quote stay inside Post++ (Repost executes at once; Quote uses the composer).

## Troubleshooting

| Situation                              | What to try                                                                                                                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No conversation channels yet**       | Connect an X account from the [Calendar](/help/calendar). Only channels with Conversations support appear.                                                                         |
| **Empty feed after connecting**        | Confirm **Authorize tracking** under [Settings → Channels](/help/settings#channels-and-connection-health). Remember tracking is forward-looking—past interactions will not appear. |
| **Partial or missing card text/media** | Wait for automatic hydration, or refresh the page. Very old events may never fully hydrate if X no longer serves the post.                                                         |
| **Repost or Quote disabled**           | Read the inline reason on the action. Some posts cannot be reposted or quoted by your account.                                                                                     |
| **Repost failed / API error**          | Reconnect or **Refresh OAuth** for the channel, confirm posting permissions, and retry. Persistent failures may appear in [Settings → Logs](/help/settings#logs) for operators.    |
| **Like/Reply tab did not open**        | Allow pop-ups for Post++, or open the post link on the card manually on x.com.                                                                                                     |

If you need follower relationship context (grades, notes, lists) for someone in the feed, open their profile from [Followers](/help/followers).
