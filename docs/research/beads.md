# Beads 1.3.4 and br 0.7.6: stress test against devgraph v1

*Nov 23, 2026. Beads 1.3.4 (`bd`, Homebrew, MIT, gastownhall/beads) on Dolt 2.7.6, and br 0.7.6 (`beads_rust` from crates.io, Dicklesworthstone/beads_rust, built with self-update off). All runs were in throwaway scratch repos with local remotes (a `file://` Dolt remote and a bare git repo). GitHub itself was not used.*

## Summary

Neither tool keeps a graph that follows git branches.

- **Beads** keeps issues in Dolt, outside git. Branches, PRs, merge buttons and rebases never touch them. It syncs well between clones and merges edits to different fields of the same issue cleanly.
- **br** keeps issues in git as one JSONL line per issue, plus a local SQLite cache. A plain `git merge` conflicts whenever two branches touch the same issue, even on different fields. Worse, the cache does not reload when you switch branches, so the next write silently overwrites the branch's issue file with another branch's state.

Both already record post-merge causes (`caused-by`) well. Neither links issues to code. Beads' decay deletes the closed issues that `caused-by` and supersede links point at.

These results back devgraph's v1 bets: graph files in git, an append-only format so merges can't conflict, code anchors, and supersede with handoff.

## Beads (bd)

| # | Test | Result |
|---|---|---|
| 1a | Two git branches change the same issue | **No branch isolation.** Closing an issue on `feat-a` showed up at once on `main` and `feat-b`. One database per checkout, shared by every branch. `bd branch` (Dolt branches) does not follow git branches. |
| 1b | Two clones change the same field (title), then sync | **Sync halts.** "Conflicts sync cannot resolve safely are never auto-resolved." Every retry halts until someone runs `bd vc merge origin/main --strategy ours\|theirs`, which picks one side for every conflicted cell. |
| 1c | Two clones change different fields (close vs. add label) | **Merged cleanly.** Dolt merges by cell. |
| 1d | Sync through a git remote | **Works, outside normal branches.** `bd init` in a repo with a git `origin` stores Dolt data under `refs/dolt/data` and adds a `__dolt_remote_info__` branch to the remote (on GitHub that shows up as a branch). A fresh clone plus `bd bootstrap` pulled the data. |
| 1e | GitHub merge button | **Moot.** Not run on GitHub. No issue data lives in normal branches (`git ls-files` has none; the database is gitignored; git-remote sync uses a custom ref), so a PR and its merge button carry no tracker changes at all. |
| 2 | Rebase a branch with tracker changes | **Moot**, same reason. |
| 3 | Fresh `git clone` | **Empty until set up.** No hooks (`core.hooksPath` is local config). `bd list` errors. `bd bootstrap` with no `sync.remote` and no git-remote data silently creates a **fresh, empty** database. With `sync.remote` committed, or Dolt data on the git origin, `bootstrap` pulled correctly. |
| 4 | Rename a file an issue refers to | **No code anchors.** Issues link to issues, a spec ID, an external ref or free-form metadata. A path in metadata stayed `src/fetch.ts` after `git mv`; nothing flagged it. `bd orphans` finds issue IDs in commit messages. |
| 5 | Record a bug weeks after merge | **Works well.** `bd dep add <bug> <task> -t caused-by`; `bd show <task>` lists it under CAUSED. Also `discovered-from`, `validates`. |
| 6 | Supersede | **Works, no handoff.** `bd supersede old --with new` closes the old issue, stamps it "SUPERSEDED BY", and default `bd list` hides it. Nothing on the old issue (metadata, links) moved over, and nothing asked. |
| 7 | Decay (`bd gc`) | **Deletes the history the outcome loop needs.** Decay hard-deletes closed issues older than N days (default 90). With `--older-than 0`, it deleted the closed task a bug was `caused-by` and the superseded issue. The bug kept no link to its cause; `bd show` said "not found". Only `bd history <id>` (Dolt history) still had a trace. |
| 8 | Memories (`bd remember`) | **Flat key-value notes, all injected every session.** Stored in the kv store as `memory.<key>`. `--key` overwrites in place. Search is keyword only. `bd prime` (run by the SessionStart hook) printed all 62 memories in full, about 10.6 KB, with no ranking, cap or link to code or issues. |
| 9 | Server mode (`bd init --server`) | **Works; faster for parallel agents.** Starts a local `dolt sql-server` on a random port (a background process to manage). 10 parallel writes: server mode 1 s, embedded 5 s, no lost writes in either. |

### Side effects of `bd init`

- **Auto-commits 19 files (987 lines):** `AGENTS.md`, `CLAUDE.md`, `.claude/settings.json` (SessionStart hook running `bd prime`), `.codex/`, `.cursor/`, `.agents/skills/`, 5 git hooks.
- **Sets `core.hooksPath`** to an absolute path in `.beads/hooks`, replacing any existing hooks path.
- **Anonymous usage metrics are on by default** (command names, version, OS, machine ID). Turned off with `bd metrics off`.
- Large surface: ~100 commands, including HTTP API, leases, federation, Jira/Linear/Notion/ADO sync, memories, decay.

## br (beads_rust)

| # | Test | Result |
|---|---|---|
| 0 | `br init` | **Light.** Creates `.beads/` (SQLite cache gitignored, `issues.jsonl` tracked). No commit, no hooks, no agent files. |
| 1a | Two git branches change the same issue, then switch branches | **Stale cache leaks state across branches.** The SQLite cache did not reload from `issues.jsonl` on `git checkout`. On `feat-b`, `br list` still showed `feat-a`'s edits, and `feat-b`'s commit included `feat-a`'s "closed" status. Later, creating one issue on `main` re-exported the whole file from the cache and silently reverted `main`'s title for another issue to `feat-b`'s. No warning either time. |
| 1b | Plain `git merge` of both branches | **Line conflict.** One JSONL line per issue, no merge driver or `.gitattributes`, so any two edits to the same issue conflict, even different fields. br then refuses to run ("Merge conflict markers detected") until the file is fixed by hand. `br sync --merge` does a 3-way merge of cache vs. file, not git branches. |
| 3 | Fresh `git clone` | **Works.** `br list` imported `issues.jsonl` with no setup step. |
| 4 | Code anchors | **None.** Same as Beads: external ref and description, no file or line field. |
| 5 | Record a bug weeks after merge | **Works.** `br dep add <bug> <task> -t caused-by`; `br show <task>` lists it under Dependents. Fixed link-type list; unknown types are refused. |
| 6 | Supersede | **Just a link type.** `supersedes` is accepted like any dep, with no stamping, hiding or handoff. It also accepted `caused-by`, `discovered-from` and `supersedes` between the same two issues without question. |

## What devgraph should take

- **Hash IDs with a short project prefix** (`lab-cok`): short, typeable, collision-safe.
- **`caused-by` as a first-class link with a reverse view.** Both tools prove the outcome loop works in one command.
- **Supersede stamping and hiding by default** (Beads), plus the handoff step neither has.
- **`bd prime` / `bd onboard`:** one command that prints agent-ready context, with a minimal AGENTS.md pointer. Good model for step 8, but ranked and capped (see memories).
- **Orphans:** reading issue IDs from commit messages is cheap and useful.
- **br's light `init`** and clone-and-go behavior.
- **A fixed link-type list that refuses unknown types** (br).

## What devgraph should avoid

- **Any cache that can drift from the files.** If devgraph keeps an index, it must rebuild from the files whenever they change (checkout, merge, pull) and never write files from the cache. br shows how quietly this goes wrong.
- **One mutable line or file per node.** Even different-field edits conflict in plain git. This confirms the append-only event-file rule.
- **Decay that deletes.** Fading must hide, never delete, and never cut a `caused-by` or `supersedes` link.
- **Injecting every memory every session.** Recall must be ranked and capped.
- **Silent empty bootstrap.** A clone must show the graph or fail loudly.
- **Init that writes agent configs for five tools and commits them.**
- **Metrics on by default.**
- **All-or-nothing conflict resolution.** Avoid conflicts by construction instead.

## Not tested

The GitHub web UI itself (moot for Beads, since no data lives in branches, and covered for br by the plain `git merge` conflict). Beads' AI duplicate finder and compaction summaries. br's MCP feature (`--features mcp`).
