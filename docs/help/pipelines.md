# Pipelines

A Pipeline is a recurring publishing system for a **fixed set of channels** and a **timezone**. You define weekly slots, queue content **without picking dates**, and Post++ projects each queued item onto the next free slot. Optional **Pipeline autopost** watches RSS feeds and appends new items to that queue.

Open **Pipelines** from the main navigation. This is different from scheduling each post yourself on the [Calendar](/help/calendar#scheduling).

## What Pipelines are

One Pipeline combines three pieces:

| Piece           | Where                                           | Role                                      |
| --------------- | ----------------------------------------------- | ----------------------------------------- |
| Recurring slots | **Weekly schedule** on the Pipeline detail page | Day/time windows in the Pipeline timezone |
| Queued content  | **Queue**                                       | Ordered posts waiting for slots           |
| RSS → queue     | **Pipeline autopost**                           | Feed watchers that enqueue new items      |

In-app: _Schedule recurring posting slots for a fixed set of channels. Queue content without picking dates — the server projects the next available slot in the Pipeline timezone._

## Create and edit a Pipeline

1. Click **Create Pipeline**.
2. Set **Pipeline name**, **Timezone**, **Pipeline color**, and **Channels**.
3. Optionally attach [context documents](/help/docs#use-with-pipelines).
4. **Save** — toast **Pipeline created successfully**.

Creating a Pipeline does **not** add weekly slots yet. Open the card’s **Schedule** button (detail page) to configure times.

On the list you can **Edit**, **Delete**, pause/resume with the slider (**Active** / **Paused**), and filter by channel in the left sidebar. Empty: **No Pipelines yet**. Channel filter empty: **No Pipelines for this channel**.

## Weekly schedule

On `/pipelines/[id]`:

1. Open **Weekly schedule**.
2. Hover an hour and click **+** (top of hour; optionally add `:30` afterward).
3. Click a pill to **Edit slot time**, set the minute, **Apply**.
4. Drag to move; use **X** to remove.
5. Click **Save** (required)—**Reset** discards unsaved edits.

Times use the **Pipeline timezone**. Conflict toast: **A slot already exists at this time for this day.**

## Queue content without picking dates

From the post composer on the [Calendar](/help/calendar#scheduling):

1. Choose publishing mode **Pipelines** (active Pipelines only; otherwise **No active Pipelines** / **Create Pipeline**).
2. Channels lock to the Pipeline’s set; the date picker becomes the projected next slot.
3. Click **Add to Pipeline** — toast **Added to Pipeline**.

There is no “add blank item” button on the Queue panel itself; content enters through the composer (or RSS autopost).

## Manage the queue

On the Pipeline detail **Queue**:

- Drag or use ↑↓ to reorder; **Shuffle** randomizes order.
- Menu: **Edit**, **Now**, **Schedule**, **Remove**, **Delete**, and **Move to…** (only Pipelines with the **same channel set**).
- Statuses include queued, publishing, and failed; non-queued items appear under **Publishing and failed**.
- Cards show **Pipeline time:** for the projected slot.

**Remove** takes the item out of the Pipeline but keeps posts as drafts. **Delete** soft-deletes the channel posts. **Publish now** detaches and publishes immediately.

## Pipeline autopost

On the detail page, **Pipeline autopost** watches RSS and appends to **this** Pipeline’s queue for **every** Pipeline channel (no per-feed channel picker).

1. **Add an autopost**.
2. Fill **Title**, **URL**, **Should we sync the current last post?**, **Autogenerate content**, optional **Post content**, **Generate Picture?**, and **Active**.
3. Click **Send Test** until you see **RSS valid!** (failures: **Could not use this RSS feed**).
4. **Save**, then edit/delete or toggle Active from the list.

This is **not** the same as Settings **Auto Post**, which posts RSS to channels you pick outside a Pipeline queue. See [Settings → Auto Post](/help/settings#webhooks-and-auto-post).

## Pause, resume, and delete

- **Pause** — next slot shows **Paused**; queue is kept. Composer also shows the Pipeline as paused.
- **Resume** — projections continue.
- **Delete** — the schedule is removed; queued items are **kept as drafts** on the calendar (confirm copy explains this).

Changing channels may be blocked while items are still queued.

## Pipeline Schedule overview

From the Pipelines list, the secondary **Schedule** button opens `/pipelines/schedule` (**Pipeline Schedule**)—a week grid comparing configured slots across Pipelines (**Active** colors vs **Paused**). You can drag or remove slots there and choose a **Display timezone**. Empty: **No configured Pipeline schedules this week.**

That overview is different from each card’s **Schedule** button, which opens one Pipeline’s detail editor.

## Context documents

Optional Markdown from [Context](/help/docs) helps agents draft for this Pipeline. Assignments reference the library (not copies). Skills cannot be attached—deselect them before saving.
