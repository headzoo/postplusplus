# Settings

Settings is where you configure how Post++ looks and behaves for your account and organization. Open **Settings** from the main navigation (`/settings`).

**Billing** is a separate nav item (`/billing`)—plans and payment are not tabs inside Settings.

## Open Settings

The left sidebar switches sections. Some tabs appear only on certain plans. Logs also open at `/settings/logs`. Use **Logout from Post Plus Plus** at the bottom of the sidebar when you need to sign out.

## Global Settings

### Appearance and language

- **Dark Mode** — switch between dark and light themes.
- Language tiles (English, Hebrew, Russian, Chinese, French, Spanish, Portuguese, German, Italian, Japanese, Korean, Arabic, Turkish, Vietnamese, and others as offered). Hebrew and Arabic use right-to-left layout.

### Time format

Under **Date Metrics**, choose **AM:PM** or **24 hours** for how times display in the app.

### Email notifications

Toggle:

- **Success Emails** — when posts publish successfully
- **Failure Emails** — when posts fail to publish
- **Streak Reminder Emails** — when your posting streak is about to end

### Shortlinks

**Shortlink Preference** controls URLs in posts (**Ask every time**, **Always shortlink**, or **Never shortlink**). Shortlinks can provide click statistics.

## Team Members

Shown when your plan includes team features. Heading **Team Members**: invite assistants to manage the account.

- List shows each member and role (**User**, **Admin**, or **Super Admin**).
- **Add another member** → **Add Member**: email (optional), role (**User** / **Admin**), **Send invitation via email?** then **Send Invitation Link** or **Copy Link**.
- **Remove** is available only if your role ranks higher than theirs.

## Channels and connection health

The **Channels** tab inspects connected accounts and **interaction tracking**. It is **not** the primary place to add or delete social channels—use **Add Channel**, **Reconnect channel**, or **Delete Channel** from the [Calendar](/help/calendar) / Channels sidebar elsewhere.

On a selected channel you can:

- See status: **Connected**, **Reconnect needed**, **Setup incomplete**, **Disabled**, or **Deleted**
- **Refresh OAuth**
- **Authorize tracking** / **Reauthorize tracking** when follower or interaction permissions need an extra grant

Banners may explain partial tracking or missing permissions. Empty: **No channels yet**.

## Webhooks and Auto Post

These tabs appear depending on your plan.

### Webhooks

Outbound HTTP notifications when something happens in Post++ (for example when posts publish). Heading shows usage like **Webhooks (N/limit)**.

**Add a webhook**: Name, URL, **All integrations** or **Specific integrations**, **Send Test**, **Save**.

### Auto Post

RSS → social posting **outside** a Pipeline queue. *Autopost can automatically posts your RSS new items to social media.*

**Add an autopost**: Title, URL, sync last post, **Post on the next available slot** or **Post Immediately**, autogenerate content / picture, choose integrations, **Send Test** (**RSS valid!**), then **Save** and toggle **Active**.

For RSS that should land in a Pipeline’s queue instead, use [Pipeline autopost](/help/pipelines#pipeline-autopost).

## Sets and Signatures

Available on paid plans (not free).

### Sets

**Sets** are reusable multi-channel post templates. **Add a set** opens the composer; save with **Save as Set**. Manage, edit, or delete from the Sets list. Sets also appear when creating posts on the [Calendar](/help/calendar#channels-sets-and-signatures).

### Signatures

Reusable footers for posts. **Add a signature**, optionally **Auto add signature?** Yes/No, then **Save**.

## Developers and Approved Apps

### Developers

Shown when your plan includes the public API. Subtabs **Access** and **Apps**:

- Personal **API Key** — Reveal / Hide / Copy / **Rotate Key** (rotating invalidates the old key immediately)
- Links to docs, N8N, and setup wizards
- **MCP Client Configuration** for tools like Cursor or Claude—useful with [Agent](/help/agent#use-agent-outside-post)
- **Apps** — OAuth apps you build for products that act on behalf of users

### Approved Apps

Applications you’ve authorized to access your account. **Revoke** access you no longer want. Empty: **No approved apps yet.**

## Third-party Integrations

**Integrations** connects other services via API keys (“Connect third-party services to use them in Post Plus Plus”). This is **not** the same as social **Channels**.

Empty: **No Integrations Yet**. Connected rows offer **Delete Integration**. Catalog cards use **Add** → paste **API Key** → **Add Integration**.

## Logs

**Logs** inspects outgoing and incoming HTTP for posts and webhooks. Toggle **Webhooks** | **Posts**, use filters (direction, event type, search), **Refresh**, and **View** a row for full detail (**Copy**). Empty: **No logs found.** Tracking alerts may appear above the table with **Open channel settings**.

## Log out

Sidebar footer: **Logout from Post Plus Plus** (or Gitroom branding). Confirm **Are you sure you want to logout?** / **Yes logout**.
