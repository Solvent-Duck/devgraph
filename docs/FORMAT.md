# devgraph file format, v0

*Build step 1. Covers nodes, links, status and edits. Supersede resolution, `touches` anchors and outcomes come in later steps.*

## Principles

1. **Files are written once.** No file under `.devgraph/nodes/` is ever edited. Every change is a new event file. So two branches only ever add files with distinct names, and `git merge`, forge merge buttons and rebases never conflict.
2. **The files are the truth.** devgraph keeps no cache or index. Every read loads the files and applies the events.
3. **Small fixed vocabularies.** Unknown node types, link kinds, statuses or event kinds are errors.

## Layout

```
.devgraph/
  config.json                    { "prefix": "dg" }
  nodes/
    dg-k3f9x2/
      node.md                    the node, written once
      20261123T173000123Z-7f2a.md   an event
      20261123T174512004Z-c41e.md   an event
```

Each node has its own folder named by its ID. The folder holds `node.md` and that node's events. A link is an event on the node it starts from.

## File shape

Every file is a header plus an optional Markdown body:

```
---
key: value
key: value
---
Optional body.
```

Header lines are `key: value`, one per line. The value is everything after the first colon, trimmed. Values are single-line. No nesting, lists or quoting.

## IDs

- **Node ID:** `<prefix>-<6 random base36 chars>`, for example `dg-k3f9x2`. The prefix comes from `config.json` (default: the repo folder name, lowercased, letters and digits only). Regenerated if it already exists.
- **Event file name:** `<UTC timestamp, digits only>Z-<4 random hex>.md`, for example `20261123T173000123Z-7f2a.md`. Sorting names sorts events by time.

## Nodes (`node.md`)

| Field | Required | Value |
|---|---|---|
| `id` | yes | the node ID, same as the folder name |
| `type` | yes | `spec`, `task`, `decision`, `change`, `outcome`, `caveat` |
| `title` | yes | one line |
| `created` | yes | ISO 8601 UTC |
| `author` | yes | `git config user.name` |

The body is the node's description.

## Events

Every event has `event`, `at` (ISO 8601 UTC) and `author`, plus fields for its kind:

| `event` | Fields | Effect |
|---|---|---|
| `status` | `status` | Sets the status. Tasks only: `open`, `active`, `done`, `dropped`. |
| `link` | `kind`, `to` | Adds a link from this node to `to`. |
| `unlink` | `kind`, `to` | Removes that link. |
| `edit` | `title` (optional) | Replaces the title if given, and the body if the event has a body. |

**Link kinds:** `implements`, `decided-by`, `supersedes`, `caused`, `blocks`. (`touches`, which points at code, arrives with anchors in build step 3. Until step 4, `supersedes` is a plain link with no resolution.)

## Reading a node

1. Read `node.md`. A task starts with status `open`; other types have no status.
2. Apply the events in file-name order. For status, title and body, the later event wins. Links are a set: `link` adds, `unlink` removes.

Ordering uses each writer's clock, with one guard: a new event's timestamp is at least 1 ms after the latest event already on that node, so a change always sorts after everything its writer had seen. If two people on different branches change the same field, the later timestamp wins after the merge.

## Rules

- **No orphans.** Every node except a `spec` must have at least one link when created. `add` writes the node and its first links together. `unlink` refuses to remove a non-spec node's last link.
- A link's target must exist in the current checkout, and a node cannot link to itself.
- Writes check every value against the lists above and reject titles with line breaks.
