# Idea: A mergeable record of development context

*Working name: devgraph · Status: idea, v1 scoped · Nov 22, 2026 (v1 scope added Nov 23, 2026)*

## One line

An open-source, git-native graph that records the whole development loop (spec → tasks → decisions → code → outcomes) for each branch, merges with the code into a shared "company brain," and stays useful instead of turning into vector-database slop.

## Why

Git records *what* changed and *when*. It loses *why*: the spec, the options weighed, the dead ends, and what happened after the code shipped. That knowledge lives in the head of the senior engineer who has been around longest, and it leaves when they do.

Teams have tried to save the why before (design docs, wikis, decision records). Those rot because writing them costs a human extra effort under deadline. Agents change that. An agent working a task already writes out its plan, the options it weighed and its reasoning. Today that text is thrown away when the session ends. Keeping it, tied to the code it produced, costs almost nothing.

Goal: make a long-time senior engineer's knowledge queryable by every person and agent in the company.

## What this is not

- **Not a product.** Open source. Success means being used, not revenue.
- **Not a ticket tracker.** Tickets are one node type among several.
- **Not a vault.** Anything that must never be forgotten (standing rules, "never do X") goes in CLAUDE.md / AGENTS.md. The graph is allowed to fade.
- **Not a vector store.** Embeddings may exist as a derived index. They are never the source of truth.

## The landscape (as of Nov 2026)

| Tool | Covers | Gap |
|---|---|---|
| Beads (Gas City) | Agent task graph; ~28k stars; leader among agent-first trackers | Tickets only. Moved to Dolt as its only backend, so the graph no longer lives in git beside the code. Getting heavier (HTTP API, leases, store sync). |
| br (beads_rust) | Rust rewrite compatible with Beads | Same scope as Beads |
| Backlog.md | Markdown tasks in repo, terminal + web board; ~5.6k stars | Simple, human-friendly, not a graph |
| Spec Kit, OpenSpec, Kiro, BMAD | Spec → plan → tasks; Spec Kit 115k+ stars | Flat Markdown, not linked; keeping specs current takes discipline |
| Linear | Org-level tracker; agents as first-class users | Hosted, human-first, not local, not tied to branches |
| Nothing | Outcomes and findings after merge | The open slot |

**Position:** own the primitive first. Build our own Beads-equivalent graph, with our own node types, merge rules and squash, and make it good enough to stand alone. Linking other tools' primitives early is how you get connector bloat: every import brings someone else's data model, quirks and gaps, and the graph ends up shaped by its weakest source. Third-party importers come last, once the core format is stable, and they map into our types rather than bending our types to fit them.

## Core model: git for development context

- Each dev / branch has its own graph. Agents write freely there.
- The graph lives **in the repo as plain files** and shows up in the PR diff.
- When the branch merges, the graph merges with it into main.
- Because each branch has one owner, no central server is needed for claims. Git already handles ownership.
- Scales from a solo side project to a team of fifty with the same binary. Only config changes. ("Railway, not AWS.")

Brain mapping:

| Brain | This system |
|---|---|
| Short-term memory | Branch graph: messy, fast, scratch |
| Long-term memory | Main graph: what survived |
| Sleep / consolidation | Squash on merge |
| Links strengthen with use | Edge weights rise when a path leads to merged work |
| Forgetting | Weights fade; nodes drop out of default recall |
| Habits / rules | CLAUDE.md (separate, always loaded) |

## The primitive (what must be right)

### Node types (small, fixed set)
`spec`, `task`, `decision` (including options rejected), `change` (commit/PR), `outcome` (bug, incident, metric, revert), `caveat` (known risk tied to code).

### Link types
`implements`, `decided-by`, `supersedes`, `caused`, `blocks`, `touches` (→ file / function / commit).

### Rules
1. **One file per node, stable hash IDs.** Two branches adding nodes never conflict.
2. **Conflict-free by construction, no merge driver.** A file, once written, never changes. A status change, a new link, a supersede or a delete (tombstone) is a new small event file with its own ID. Reads fold the events onto the node ("done beats open", links take the union). So a plain `git merge`, GitHub's merge buttons and rebases all just work with nothing to configure. (A custom merge driver was the first idea; it was dropped because drivers don't travel with `git clone` and hosted forges never run them.)
3. **One decision per node.** Never store a whole doc as one node. Small nodes let a later version replace exactly one rule and leave the rest valid.
4. **No orphans.** Every node links to code, a commit, or another node, or it is rejected / expires.
5. **Plain files are the truth.** Readable, diffable, rebuildable. Delete every index and nothing is lost.

## Anti-slop rules

Memory products turn to slop because they store everything, retrieve by "looks similar," never delete, and no person reviews what goes in. Fix each:

- **Structure first, search second.** Agents find context by following links from code (blame for reasons), not by similarity.
- **Gate on writes.** Branches can be messy. Main only takes what survives the squash.
- **Squash on merge.** Fifty scratch tasks collapse into a few lasting nodes: what changed, what was decided, what is still open. Agent proposes; a dev may approve in review.
- **Safe when nobody reviews.** Devs rubber-stamp under deadline, so review can't be the only gate. Squashed nodes land in main marked *unreviewed* and rank below reviewed ones. Review is an optional promotion, not a blocker. A skipped review costs ranking, not trust.
- **Budget per PR.** Cap how many lasting nodes one PR adds to main, so the graph diff stays short enough to actually read.
- **Deletion built in, never silent.** When the code a node points at disappears, the node is flagged "anchor lost" for a person to resolve, never auto-archived (refactors look like deletes). Superseded nodes drop out of default results.
- **Readable PR diff.** "This PR closes 3 tasks, adds 1 decision, leaves 2 open," next to the code diff.

**Test:** can a new engineer read main's graph for one feature in five minutes and understand why it is built that way? If they need a search box, it is slop.

## Strength, decay and recall (deferred past v1)

**Not in v1.** Explicit `supersedes` links plus recency cover most of the "old knowledge" problem without usage logs to sync across a team. Revisit only if deterministic traversal (`blame`, links, supersedes) proves not enough. If decay returns, `caveat` nodes and rejected options must not decay while their code anchor exists: an agent that avoided a trap rarely cites the warning, so the merged-citation rule below would starve preventive knowledge.

Borrow from human-memory models (ACT-R style: strength rises with each use and fades with time since use).

- **Structure in git, strength outside it.** Nodes, links and content merge with code. Weights, decay and last-used are derived from usage logs, like a search index. Never committed, never merged by hand (otherwise every read is a commit and every branch conflicts).
- **Fading hides, it does not delete.** Weak nodes leave default recall but stay reachable by links, history and search.
- Example: API v2 docs stay strong for the first weeks of v3 while people fix reference bugs, then fade on their own once nobody touches them.

### Two ways to reach the graph
- **Recall** (automatic, weighted): when an agent starts a task it gets **3 results ranked by relevance + 2 tangential results**, labeled as tangential so the agent weighs them less. Tangential picks come only from current (non-superseded) nodes.
- **Search** (deliberate, unweighted): every match, ranked by fit, faded nodes included.

### Stopping agents from feeding their own habits
- Being pulled up is not a use. A node gets stronger **only when cited in work that merges.**
- Search can revive: a faded node found by search and used in a merged PR gets its strength back.

## Handling old and replaced knowledge

Vector stores fail here because v2 and v4 docs look almost the same. The graph knows because replacement is an explicit link.

1. **Resolve to the latest.** Before returning any node, follow `supersedes` to the newest version (like git following a branch to its head).
2. **Stamp old nodes.** When history is wanted, old nodes come back labeled: "Replaced by [node], [date]. Don't follow this."
3. **Catch replacements at write time.** This is where embeddings help: on merge, find very similar existing nodes and ask "does this replace one of these?" Confirmed in the PR.
4. **Caveats attach to code, not docs.** A footnote like "possible floating point error in f()" is a `caveat` node linked to `f()`. Replacing the doc does not replace the caveat. It lives as long as `f()` exists and fades only when that code is deleted or rewritten.
   - **Anchors (v1):** a `touches` link records a file and line range at a specific commit. Reads follow it forward with git's rename and move detection (`git blame -M -C`). Function-level anchors (AST tracking) come later. Inline tags in source are out: devs won't keep them.
   - **When an anchor is lost** (file gone, lines moved beyond what git can follow), the caveat is flagged for a person, not archived. Extracting or renaming `f()` must never quietly drop its caveat.
5. **Explicit handoff on supersede.** When v4 replaces v2, list everything hanging off v2 (caveats, known issues, open questions) and ask: carry forward, replace or drop? Default is carry forward; dropping needs a reason.
6. **Debug mode searches everything.** Chasing a bug, point at the failing code and walk back through every change, decision and caveat ever linked to it, superseded ones included.

Honest limit: it can't catch what nobody wrote down, and rare latent bugs (one introduced months ago that surfaces after later updates) are hard for humans too. The win is trace time: start at the failing code, walk back through every change with its reasons, and turn days of digging into an afternoon. The incident then becomes an `outcome` node linked to its cause, so the next person gets the lesson.

## The full loop

spec → decision → code → outcome → lesson → next spec

Outcomes arrive after merge (bugs weeks later, metrics after launch, reverts). The system must let them attach after the fact: "this incident traces back to that decision." That link is what no tool records today, and it is where senior judgment comes from.

**Capture must be one step.** Incidents surface in Slack, PagerDuty and dashboards weeks after merge. If logging one means a branch, a file and a PR, nobody will do it.
- **v1:** `devgraph outcome add <change-id>` writes one outcome file and commits it. Reverts and hotfix PRs create outcome nodes automatically.
- **Later:** a GitHub Action or Slack bot that appends outcomes without anyone opening a branch, so metrics and operational lessons with no code change are captured too.

**Graph → CLAUDE.md promotion:** when the same outcome keeps recurring, the graph can suggest a line for CLAUDE.md. A human decides. CLAUDE.md stays short and current.

## Adoption

- **One command to start** (`init` in a repo; no account, no server).
- **Open format + spec,** so others build boards, Slack bots and Linear / GitHub Issues bridges.
- **Importers / bridges (last, not first):** once the core format is stable, add one-way importers (Spec Kit, OpenSpec, Beads, Backlog.md) that map into our node types, then sync with Linear / GitHub Issues. Each importer must earn its place; no importer gets to add node or link types to the core.
- **Agent-native:** MCP server plus a ready-made AGENTS.md / CLAUDE.md snippet so Claude Code and Codex use it unprompted.

## Open questions

- Who decides what survives the squash: agent, dev, or a rule? (Leaning: agent proposes, lands as unreviewed, dev may promote.)
- Monorepo vs many repos: one brain per repo, or linked brains?
- Exact squash budget per PR.
- Where `outcome add` commits when main is protected: straight to main, a dedicated outcomes branch, or an auto-merged PR?
- How often to fold event files back into a compact snapshot, if ever, without breaking the append-only rule.

Answered: rebases need no special handling (nothing is ever edited, so there are no edits to replay). Where usage logs and weights live is moot until decay returns.
- File format: Markdown with frontmatter, JSONL, or both?
- Contribute to / build on Beads' format vs a fresh format? (Beads moved to Dolt, away from git-native; that gap is the reason for a new project.)

## v1 scope

Bet on the deterministic graph first: `blame` + `caveat` + `supersedes`. It pays off on day one for a solo dev, and the squash can't be tested until there's a format to squash and a reader that shows it's worth keeping.

**In v1:** the append-only file format, `init` / `add` / `link` / `show` / `blame <file:line>`, supersede resolution and stamping on every read, line-range anchors with "anchor lost" flags, `outcome add`.

**Not in v1:** merge driver (not needed), squash-on-merge, decay and weights, 3 + 2 recall, embeddings, MCP server, outcome bots, importers.

## Build order

1. Write the file format spec: node types, link types, event files, frontmatter fields, ID scheme, how reads fold events onto nodes.
2. CLI: `init`, `add`, `link`, `show`. Tests that two branches adding and changing the same node merge with plain `git merge` and no conflicts.
3. `touches` anchors (file + line range at a commit) and `blame <file:line>`, following renames and moves; "anchor lost" flags.
4. Supersede resolution + stamping in all read paths.
5. `outcome add <change-id>`; auto-create outcomes from reverts.
6. Dogfood on this repo until the core stands alone.
7. Squash-on-merge: agent proposes lasting nodes from branch scratch, lands as unreviewed, readable graph diff for the PR, per-PR budget.
8. MCP server + AGENTS.md snippet.
9. Only if traversal proves not enough: recall (3 + 2), decay, merged-citation reinforcement.
10. Only then: third-party importers (Spec Kit, Beads), mapping into our types.
