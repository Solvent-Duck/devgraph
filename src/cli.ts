#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  addNode,
  edit,
  type GraphNode,
  init,
  LINK_KINDS,
  type Link,
  link,
  loadAll,
  loadNode,
  NODE_TYPES,
  STATUSES,
  type Stamp,
  setStatus,
  unlink,
} from "./graph.ts";

const USAGE = `devgraph: a mergeable record of development context

Usage:
  devgraph init [--prefix <p>]
  devgraph add <type> "<title>" [--body <text>|-] [--link <kind>:<id>]...
  devgraph list [--type <type>] [--status <status>]
  devgraph show <id>
  devgraph status <id> <status>
  devgraph link <from> <kind> <to>
  devgraph unlink <from> <kind> <to>
  devgraph edit <id> [--title "<title>"] [--body <text>|-]

Types:    ${NODE_TYPES.join(", ")}
Links:    ${LINK_KINDS.join(", ")}
Statuses: ${STATUSES.join(", ")} (tasks only)
Every node except a spec needs at least one link. See docs/FORMAT.md.`;

type Result = { code: number; out: string };

function git(cwd: string, args: string[]): string | undefined {
  try {
    return (
      execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || undefined
    );
  } catch {
    return undefined;
  }
}

function findRoot(cwd: string): string {
  for (let dir = cwd; ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".devgraph", "config.json"))) return dir;
    if (dirname(dir) === dir)
      throw new Error("Not in a devgraph repo. Run: devgraph init");
  }
}

// Splits args into positionals and --flags. Repeated flags collect into a list.
function parseArgs(args: string[]) {
  const pos: string[] = [];
  const flags: Record<string, string[]> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const value = args[i + 1];
      if (value === undefined) throw new Error(`${args[i]} needs a value`);
      const key = args[i].slice(2);
      flags[key] = [...(flags[key] ?? []), value];
      i++;
    } else pos.push(args[i]);
  }
  const one = (k: string) => flags[k]?.at(-1);
  return { pos, flags, one };
}

function need(pos: string[], n: number, usage: string) {
  if (pos.length !== n) throw new Error(`Usage: devgraph ${usage}`);
  return pos;
}

function readBody(value: string | undefined, stdin: () => string) {
  return value === "-" ? stdin() : (value ?? "");
}

function parseLink(spec: string): Link {
  const i = spec.indexOf(":");
  if (i < 1)
    throw new Error(`--link must look like <kind>:<id>, got "${spec}"`);
  return { kind: spec.slice(0, i), to: spec.slice(i + 1) };
}

function row(n: GraphNode) {
  return `${n.id}  ${n.type.padEnd(8)}  ${(n.status ?? "").padEnd(7)}  ${n.title}`;
}

function show(root: string, id: string): string {
  const node = loadNode(root, id);
  const all = loadAll(root);
  const title = (to: string) =>
    all.find((n) => n.id === to)?.title ?? "(missing)";
  const lines = [
    `${node.id} · ${node.type}${node.status ? ` · ${node.status}` : ""}`,
    node.title,
    `created ${node.created} by ${node.author}`,
  ];
  if (node.body) lines.push("", node.body);
  if (node.links.length) {
    lines.push(
      "",
      "Links:",
      ...node.links.map((l) => `  ${l.kind} → ${l.to}  ${title(l.to)}`),
    );
  }
  const from = all.flatMap((n) =>
    n.links.filter((l) => l.to === id).map((l) => ({ ...l, from: n })),
  );
  if (from.length)
    lines.push(
      "",
      "Linked from:",
      ...from.map((l) => `  ${l.kind} ← ${l.from.id}  ${l.from.title}`),
    );
  if (node.events.length) {
    lines.push(
      "",
      "History:",
      ...node.events.map((e) => {
        const detail = Object.entries(e.fields)
          .map(([k, v]) => `${k}=${v}`)
          .join(" ");
        return `  ${e.at}  ${e.author}  ${e.event} ${detail}`.trimEnd();
      }),
    );
  }
  return lines.join("\n");
}

export function run(
  args: string[],
  cwd = process.cwd(),
  stdin: () => string = () => readFileSync(0, "utf8"),
  now = () => new Date(),
): Result {
  const [cmd, ...rest] = args;
  if (!cmd || cmd === "help" || cmd === "--help")
    return { code: 0, out: USAGE };
  try {
    const { pos, flags, one } = parseArgs(rest);
    if (cmd === "init") {
      const root = git(cwd, ["rev-parse", "--show-toplevel"]);
      if (!root)
        throw new Error("devgraph lives in a git repo. Run git init first.");
      const prefix =
        one("prefix") ??
        (basename(root)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "") ||
          "dg");
      init(root, prefix);
      return {
        code: 0,
        out: `Initialized ${join(root, ".devgraph")} (prefix ${prefix})`,
      };
    }
    const root = findRoot(cwd);
    const stamp = (): Stamp => ({
      author:
        git(cwd, ["config", "user.name"]) ?? process.env.USER ?? "unknown",
      now: now(),
    });
    switch (cmd) {
      case "add": {
        const [type, title] = need(
          pos,
          2,
          'add <type> "<title>" [--body <text>|-] [--link <kind>:<id>]...',
        );
        const links = (flags.link ?? []).map(parseLink);
        return {
          code: 0,
          out: addNode(
            root,
            { type, title, body: readBody(one("body"), stdin), links },
            stamp(),
          ),
        };
      }
      case "list": {
        need(pos, 0, "list [--type <type>] [--status <status>]");
        const nodes = loadAll(root).filter(
          (n) =>
            (!one("type") || n.type === one("type")) &&
            (!one("status") || n.status === one("status")),
        );
        return { code: 0, out: nodes.map(row).join("\n") || "No nodes." };
      }
      case "show":
        return { code: 0, out: show(root, need(pos, 1, "show <id>")[0]) };
      case "status": {
        const [id, status] = need(pos, 2, "status <id> <status>");
        setStatus(root, id, status, stamp());
        return { code: 0, out: `${id} → ${status}` };
      }
      case "link":
      case "unlink": {
        const [from, kind, to] = need(pos, 3, `${cmd} <from> <kind> <to>`);
        (cmd === "link" ? link : unlink)(root, from, { kind, to }, stamp());
        return {
          code: 0,
          out: `${cmd === "link" ? "Linked" : "Unlinked"} ${from} ${kind} ${to}`,
        };
      }
      case "edit": {
        const [id] = need(
          pos,
          1,
          'edit <id> [--title "<title>"] [--body <text>|-]',
        );
        const body =
          one("body") === undefined ? undefined : readBody(one("body"), stdin);
        edit(root, id, { title: one("title"), body }, stamp());
        return { code: 0, out: `Edited ${id}` };
      }
      default:
        return { code: 1, out: `Unknown command: ${cmd}\n\n${USAGE}` };
    }
  } catch (err) {
    return { code: 1, out: err instanceof Error ? err.message : String(err) };
  }
}

if (import.meta.main) {
  const { code, out } = run(process.argv.slice(2));
  (code === 0 ? console.log : console.error)(out);
  process.exitCode = code;
}
