# Agent

Agent is your in-app chat assistant for drafting content, generating images or videos, and preparing posts for selected channels or a Pipeline. Open it from **Agent** in the main navigation (`/agents`).

Agent is **not** the same as the **UGC** nav item (AgentMedia), which is a separate product for UGC videos.

## What Agent is

In the chat titled **Your Assistant**, you describe what you need. The agent can schedule across multiple channels, generate media, and open the normal post editor so you can review before anything goes live.

## Start a chat

Opening Agent lands you on a new conversation at `/agents`. You’ll see a centered composer with **How can I help?** Type a message and send—the composer then stays at the bottom of the chat as the conversation grows.

From a new chat you can:

- Schedule one or many posts to multiple channels
- Generate pictures and videos
- Ask how many followers or subscribers a channel has (from analytics snapshots, with an as-of date—not the size of the Followers CRM list)
- Pick channels from the left menu
- Reopen past conversations from the threads list (beside channels)
- Use Post++ as an MCP server (see [Settings → Developers](/help/settings#developers-and-approved-apps))

Use stop if a reply is still streaming.

## Choose channels or a Pipeline

### Channels

In the left sidebar, click one or more connected channels. The agent targets only those channels.

### Pipelines

Click a Pipeline in the left list (**Active** or **Paused**). That selection:

- Loads the Pipeline’s channels as the target set
- Passes the Pipeline’s timezone, name, and attached [context documents](/help/docs) to the agent

Selecting a channel clears the Pipeline selection, and selecting a Pipeline replaces a free-form channel mix. Click the Pipeline again to clear it.

If you have no Pipelines yet, you’ll see **No Pipelines yet**. Load errors show **Failed to load Pipelines…**

## Attachments

Use the **+** button inside the composer to open an attach menu:

- **Upload from computer** — pick a file from your device. It is attached directly to the chat and is **not** saved to your [Media](/help/media) library.
- **Select from media** — pick images or videos from your Media library.

Attached media is sent with your message so the agent can use it.

## Skills (slash commands)

Type `/` to open **Agent skills**. Skills are procedures stored as Context files named `{slug}.skill.md` (for example `campaign-review.skill.md` → `/campaign-review`).

- Pick a skill from the list, finish the prompt, and send.
- **Large skill file** warns that the procedure may be truncated.
- If skills fail to load: **Skills are unavailable. You can still enter a command manually.**

Skills are for Agent slash commands—they are **not** attachable to Pipelines. Create and manage them under [Context](/help/docs#agent-skills).

## Context documents

Agents can discover organization [Context](/help/docs) documents (brand, tone, audience, and similar guidance) by scanning document names and descriptions, then reading only relevant files. Add a short **Description** when you edit a standard document so the agent can find it—for example when generating an image that should match your brand.

## Review and schedule generated posts

When the agent is ready to place content on channels, it can open the standard **Add/Edit post** modal per channel. Review the copy, channels, and timing, then save, schedule, or post as you would from the [Calendar](/help/calendar#scheduling). Nothing publishes without your confirmation in that editor.

## Threads

Open **Threads** (panel beside channels, or the **Threads** button on mobile) to resume a past chat at `/agents/{id}`. Use **Start a new chat** to begin a fresh conversation at `/agents`. On desktop, collapse the Threads panel with the control at the bottom—when collapsed, only a **+** button remains to start a new chat.

## Use Agent outside Post++

You can connect Post++ as an MCP server from other tools (Cursor, Claude, and similar). Set that up under [Settings → Developers](/help/settings#developers-and-approved-apps) (API key, MCP client configuration). See **Settings → Public API** for MCP and Public API details.

## Troubleshooting

- **Agent missing from the menu** — On hosted Post++, free-tier accounts may not see primary nav items until the plan includes them.
- **Pipeline selection disappeared** — Clicking a channel clears the Pipeline; pick the Pipeline again if you need its docs and channel set.
- **Skills empty** — Create `{slug}.skill.md` files in Context, or wait if you see **Loading skills…**. Reserved slug **followers** cannot be used as a skill.
- **Confused with UGC** — **UGC** opens AgentMedia (external). Your chat assistant is only under **Agent**.
