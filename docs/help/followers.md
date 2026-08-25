# Followers

Followers is your audience and relationship workspace. Open it from **Followers** in the main navigation. Use it to browse people who engage with a channel, triage who needs attention, keep notes and lists, and spot leads. It is **not** the same as the platform follower/subscriber total on the [Dashboard](/help/dashboard)—CRM categories and lists can include non-followers and are incomplete relative to the full account audience.

## What Followers is for

For each supported channel you can:

- Search and sort followers
- Filter by relationship effort (**Hot**, **Engaged**, **Cultivate**, and more)
- Open detail (grades, notes, interactions)
- View a public **Timeline**
- Ask the floating Followers assistant for help

## Which channels appear

Only channels that expose follower identities show in the left sidebar—not every connected account. If you see **No follower channels yet**, connect a compatible channel from the [Calendar](/help/calendar) (**Add Channel**), then return here. After permission changes, you may need to reconnect or [authorize tracking](/help/settings#channels-and-connection-health) in Settings.

## Browse, search, and sort

1. Select a channel in the left list.
2. On **All**, review the summary cards and five-column board (**Leads**, **Hot**, **Mutual**, **Cultivate**, **Quiet**). Each column shows a few people; **View all** opens the full card grid for that segment.
3. Use **Search** for username or display name (searching on All switches from the board to the card grid).
4. Open **Filters** for **Sort by**, **Direction**, **Time window** (**Week**, **Month**, **90 Day**, **Year**), and **Per page** (12 / 24 / 48).
5. On a filtered tab or after **View all**, move with **Previous** / **Next**.

**Sort by** options depend on the channel (for example **Recent**, **Interactions**, **Notes**, **Likes**, **Priority grade**, **Your grade**, **Bot grade**, **Their effort**, **Net effort gap**). Some sorts only reorder the **current page**—prefer **Recent** when you need consistent order across pages.

Empty search: **No followers match this search**.

## Relationship filters

Use the pill tabs above the board or grid:

| Filter        | Meaning                                                |
| ------------- | ------------------------------------------------------ |
| **All**       | Overview board plus everyone when searching            |
| **Leads**     | Interacting non-followers (and warm-network prospects) |
| **Hot**       | Their effort exceeds the channel’s (hourly picks)      |
| **Mutual**    | Effort is balanced                                     |
| **Cultivate** | Warm relationship that needs outbound attention        |
| **Quiet**     | Little activity either way                             |
| **Ignored**   | People you’ve hidden from other views                  |
| **Costly**    | The channel’s effort exceeds theirs                    |
| **Bots**      | Likely automated accounts                              |

Summary cards show counts for **All Followers**, **Leads**, **Mutual**, **Hot**, **Cultivate**, **Quiet**, and **Ignored**. Category counts are CRM segments—not a sum of platform followers.

**Hot** uses hourly materialized picks. Empty triage: **No followers match this triage filter**.

## Leads and Cultivate

### Leads

Leads are people who interact but may not follow you yet (including “Via @handle” bridges). Cards can show a **Fit** score. Dismiss a lead when it isn’t a fit—you’ll choose a reason (audience mismatch, bio claims, spam, competitor, not a customer, and similar). Dismissing removes them from the Leads view when that filter is active. Empty: **No leads on this channel**.

### Cultivate

Cultivate highlights warm relationships that need a nudge. You’ll see a reason and suggested action chips. Empty: **No cultivate picks right now**.

## Bots and Ignored

- **Bots** — Filter by bot likelihood; cards may show a robot icon or bot grade.
- **Ignored** — From a card’s **+** menu, mark someone **Ignored** (confirm: they’ll hide from other lists). Find them again under the **Ignored** chip. Empty: **No ignored followers**.

## Custom lists

1. Click **+** to create a list (**List name** → **Okay**).
2. Select the list chip to view its members.
3. Use **+ Add** to paste a profile URL into the list, or use a card’s **+** menu to toggle membership.

Empty list: **No followers in this list**. Opening a custom list clears triage/audience filters.

## Follower details

Click a card to open **Follower details**:

- Profile and bot classification
- **Their effort** / **Your effort** (refreshable)
- **Your grade** (interactive stars)
- Notes (add, edit, delete)
- Recent interactions and optional charts

## Timeline

Use the timeline icon on a card to see recent public posts. From there you can **View post**, or go **Back to profile** / **Back to followers**.

## Interaction tracking

Relationship sorts and effort scores rely on interaction tracking for the channel. Tracking is **forward-looking**—older history usually isn’t backfilled.

You may see banners such as:

- **Setting up interaction tracking**
- **Interaction rankings unavailable**
- **No interactions in this time window**
- Partial coverage, permission, quota, or plan messages

Fix auth and permissions with **Authorize tracking** or **Refresh OAuth** under [Settings → Channels](/help/settings#channels-and-connection-health).

## Channel strategy

Each follower-capable channel has a **Channel strategy** in [Settings → Channels](/help/settings#channel-strategy). The choice shapes defaults and guidance—it does **not** fork Followers into separate UIs.

### What changes on Followers

Strategy affects **initial navigation only** when you have not already chosen a filter, sort, direction, custom list, or search:

| Strategy | Default view | Default sort emphasis |
| -------- | ------------ | --------------------- |
| **Grow audience** | **All** | **Recent** (existing chip order) |
| **Capture leads** | **Leads** | Lead **Fit** ordering |
| **Retain community** | **Cultivate** | **Recent** |
| **Build awareness** | **All** | **Interactions** |
| **Support customers** | **Costly** | **Recent** |

Strategy also adjusts filter chip order and emphasis, the compact strategy summary above the grid, empty-state copy for the active filter, and the Followers assistant opening message and suggested question chips.

Explicit URL routes (`/followers/leads`, `/followers/cultivate`, and similar), custom lists, search, sort, direction, pagination, and in-session chip clicks always win over strategy defaults.

### Recomputing grades

After you change strategy in Settings, relationship grades recompute asynchronously. On Followers you may see **Relationship grades are being recomputed for this strategy. Existing grades remain visible until the update finishes.** Prior grades stay on cards until each person is updated with the new strategy keys.

To return to shipped defaults, re-select **Grow audience** in Settings.

## Followers assistant

A floating chat helper can answer questions using the page you’re on. Its opening copy and suggested question chips follow the selected channel’s strategy. Server-side guidance uses trusted strategy directives; it never overrides confirmation rules or authorization boundaries. Prefer refreshing or re-checking the list for authoritative counts after changes.
