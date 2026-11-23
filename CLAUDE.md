tier: personal
stack: ts
check: npm run check

# CLAUDE.md

## What this is

devgraph (working name): an open-source, git-native graph that records spec, tasks, decisions, code and outcomes per branch and merges with the code. `docs/PLAN.md` is the north star; its "Suggested first build steps" is the build order.

## Layout

- `src/cli.ts`: CLI entry. Runs directly on Node (type stripping, no build step).
- `test/`: Vitest tests.
- `docs/PLAN.md`: the idea doc.

## Rules

- Plain files in the repo are the source of truth. Indexes, weights and embeddings are derived and never committed.
- Keep the node and link type sets small and fixed (see PLAN.md). No importer adds types to the core.
- npm, not pnpm (pnpm is not installed).
