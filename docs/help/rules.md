# Rules

Rules automate what happens **after** a post publishes: remove underperformers, repost winners, add a follow-up **plug**, or **notify** you—based on engagement and timing. Open **Rules** from the main navigation.

Rules are not the same as [Pipelines](/help/pipelines) (which queue and schedule recurring slots). Rules react to posts that already went live.

## What Rules are

In-app: *Automate post lifecycle: remove underperforming content, repost successful posts, or add follow-up plugs based on engagement metrics.*

You assign each Rule to channels and/or Pipelines. Metrics currently center on **Likes** and **Replies** (availability depends on the channel).

## Create a Rule

1. Click **Create Rule**.
2. Enter a **Rule Name**.
3. Choose an **Action**, timing, and **Conditions**.
4. Assign at least one channel or Pipeline under **Assignments**.
5. Optionally check **Enable Rule immediately**.
6. **Save** — toast **Rule created successfully.**

Empty list: **No Rules yet**. Channel filter empty: **No Rules for this channel**.

## Choose an action

| Action (form) | List label | What it does |
| --- | --- | --- |
| **Remove post** | Remove | Removes the post from the platform when conditions are met |
| **Auto repost** | Auto Repost | Reposts when conditions are met |
| **Auto plug** | Auto Plug | Posts a follow-up comment/thread; requires **Plug Content** |
| **Send notification** | Notify | Sends an in-app notification; keeps checking until match or max evaluations |

## Conditions and timing

- **Initial Delay (hours)** (0–720) — wait after publish before the first check.
- For Auto Repost, Auto Plug, and Notify: **Evaluation Interval** and **Max Evaluations** (defaults are often 24 hours / 3 times). Remove uses a single evaluation after the delay.
- **Conditions** — **Execute when ANY/ALL of the following**; pick metric, operator (**LT** / **LTE** / **GT** / **GTE**), and threshold; **Add Condition**.

**No conditions defined. The action will always execute.** If the action has no usable metrics for your assignments, you’ll also see a warning that the action always runs.

## Assignments

Check the channels and/or Pipelines this Rule should cover. Incompatible options (unsupported action or metrics) appear disabled. You need at least one assignment.

Filtering the Rules list by a channel only shows Rules that include that channel—Pipeline-only Rules may hide when that filter is on.

## Reschedule on Remove

For **Remove post** only, optional **Reschedule on Remove**:

- **Do not reschedule**
- **Manual reschedule** — days after evaluation, time of day, timezone, max attempts
- **Pipeline reschedule** — send the content back into an **active** [Pipeline](/help/pipelines) queue (you need a Pipeline first)

## Enable, edit, delete

- Use the slider for **Enabled** / **Disabled**.
- **Edit** reopens the same modal.
- **Delete** is permanent. Confirm carefully: *Active scheduled actions will continue processing.*

## Migrating from Plugs

Legacy Plugs were **not** migrated. Empty-state copy: *Create a Rule to automate post lifecycle based on engagement. Legacy Plugs were not migrated — recreate your rules and channel or Pipeline assignments here.*
