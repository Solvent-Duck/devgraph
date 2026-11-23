import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { run } from "../src/cli.ts";
import { loadNode } from "../src/graph.ts";

function git(cwd: string, ...args: string[]) {
  execFileSync(
    "git",
    ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args],
    {
      cwd,
      stdio: "pipe",
    },
  );
}

function dg(cwd: string, at: string, ...args: string[]) {
  const { code, out } = run(
    args,
    cwd,
    () => "",
    () => new Date(at),
  );
  if (code !== 0) throw new Error(out);
  return out;
}

test("two branches changing the same node merge with plain git and no conflict", () => {
  const repo = mkdtempSync(join(tmpdir(), "devgraph-"));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.name", "Tester");
  git(repo, "config", "user.email", "tester@example.com");
  dg(repo, "2026-01-01T00:00:00Z", "init", "--prefix", "t");
  const spec = dg(repo, "2026-01-01T00:00:01Z", "add", "spec", "Retries");
  const other = dg(repo, "2026-01-01T00:00:02Z", "add", "spec", "Caching");
  const task = dg(
    repo,
    "2026-01-01T00:00:03Z",
    "add",
    "task",
    "Add retry",
    "--link",
    `implements:${spec}`,
  );
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "base");

  git(repo, "checkout", "-qb", "a");
  dg(repo, "2026-01-02T00:00:00Z", "status", task, "done");
  dg(
    repo,
    "2026-01-02T00:00:01Z",
    "edit",
    task,
    "--title",
    "Add retry (title from a)",
  );
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "a");

  git(repo, "checkout", "-q", "main");
  git(repo, "checkout", "-qb", "b");
  dg(repo, "2026-01-03T00:00:00Z", "link", task, "blocks", other);
  dg(
    repo,
    "2026-01-03T00:00:01Z",
    "edit",
    task,
    "--title",
    "Add retry with backoff",
  );
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "b");

  git(repo, "checkout", "-q", "main");
  git(repo, "merge", "-q", "--no-edit", "a");
  git(repo, "merge", "-q", "--no-edit", "b"); // throws on conflict

  const node = loadNode(repo, task);
  expect(node.status).toBe("done");
  expect(node.title).toBe("Add retry with backoff"); // later timestamp wins
  expect(node.links).toEqual([
    { kind: "implements", to: spec },
    { kind: "blocks", to: other },
  ]);
});

test("rules: orphans, unknown types, last link", () => {
  const repo = mkdtempSync(join(tmpdir(), "devgraph-"));
  git(repo, "init", "-q", "-b", "main");
  const at = "2026-01-01T00:00:00Z";
  dg(repo, at, "init", "--prefix", "t");
  const spec = dg(repo, at, "add", "spec", "Root");
  const bad = (...args: string[]) =>
    run(
      args,
      repo,
      () => "",
      () => new Date(at),
    );

  expect(bad("add", "task", "Orphan").out).toContain(
    "needs at least one --link",
  );
  expect(
    bad("add", "ticket", "X", "--link", `implements:${spec}`).out,
  ).toContain('Unknown node type "ticket"');
  expect(
    bad("add", "task", "X", "--link", "implements:t-nope00").out,
  ).toContain("No node t-nope00");
  expect(bad("status", spec, "done").out).toContain("Only tasks have a status");

  const task = dg(
    repo,
    at,
    "add",
    "task",
    "Child",
    "--link",
    `implements:${spec}`,
  );
  expect(bad("unlink", task, "implements", spec).out).toContain(
    "Can't remove the last link",
  );
  expect(bad("link", task, "implements", task).out).toContain(
    "cannot link to itself",
  );
});
