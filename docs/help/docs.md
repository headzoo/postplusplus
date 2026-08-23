# Context

**Context** (page title **Context documents**) is your organization’s Markdown library for AI. Open it from **Context** in the main navigation (`/context`).

These files are **not** this Help panel. Help articles answer “how do I use Post++?” Context documents feed brand voice, briefs, and agent procedures into Pipelines and Agent.

## What Context documents are

Two roles share the same library:

1. **Standard documents** (for example `BRANDING.md`) — attach to [Pipelines](/help/pipelines#context-documents) so agents can read them when drafting. Agents can also discover them org-wide via descriptions.
2. **Agent skills** — files named `{slug}.skill.md` become slash commands like `/slug` in [Agent](/help/agent#skills-slash-commands).

The page blurb notes: standard documents attach to Pipelines; `{slug}.skill.md` files are agent procedures. Maximum file size is **256 KiB**.

## Create and upload

- **+ New document** — enter a **Filename** (placeholder `NOTES.md`), **Create**, then write Markdown and **Save**.
- **+ Upload** — choose a `.md` or `.markdown` file up to 256 KiB.

Empty library: **No context documents yet**. Search with **Search documents by name** when you already have files. No matches: **No documents match your search.**

## Edit, rename, replace, delete

Open a card to edit **Document content**. Unsaved close asks **Discard changes?**

### Descriptions

For standard documents (not skills), the editor includes an optional **Description** field (up to 500 characters). Agents use descriptions to decide which documents to read—for example _“Describes the channel branding. Colors, language, tone.”_ Cards show the description under the filename when present.

From **Document actions**:

- **Rename** — change the filename.
- **Replace** — upload a new file; the document id stays the same so Pipeline links keep working. Descriptions are preserved on replace.
- **Delete** — confirm **Delete document?** Removing a document also detaches it from Pipelines. **Queued posts are not affected.**

Cards can show size, description, **Large**, **Skill · /{slug}**, or **Skill conflict · /{slug}**.

## Use with Pipelines

When creating or editing a Pipeline, use the **Context documents** picker:

- Assignments are **references** to the library—content is not copied. Edits here show up for the agent the next time it drafts.
- **Selected: N**, **Clear all**, and **Manage library** (opens Context).
- Skills cannot be attached to Pipelines. Stale skill selections show as **Skill** / **Unavailable**—deselect them before saving.

Detail empty copy: **No context documents attached. Edit the Pipeline…**

## Agent skills

Name a file `{slug}.skill.md` with a slug of lowercase letters, numbers, and hyphens (for example `campaign-review.skill.md` → `/campaign-review`).

In Agent, type `/` to list skills (**Agent skills**). Skills are procedures, not brand context for Pipelines.

**Skill conflict** — some commands are reserved (notably **followers**). Conflict cards can’t be opened or invoked; replace or delete the legacy file.

## Size limits and the Large badge

| Limit       | Behavior                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| **256 KiB** | Hard maximum per file (upload/save blocked over this).                                                        |
| **128 KiB** | **Large** warning—may be too large for reliable agent use; you can still **Upload anyway** / **Save anyway**. |

Split oversized guidance into smaller documents when agents struggle with **Large** files.
