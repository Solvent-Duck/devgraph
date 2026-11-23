import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { parse, serialize } from "./format.ts";

export const NODE_TYPES = [
  "spec",
  "task",
  "decision",
  "change",
  "outcome",
  "caveat",
];
export const LINK_KINDS = [
  "implements",
  "decided-by",
  "supersedes",
  "caused",
  "blocks",
];
export const STATUSES = ["open", "active", "done", "dropped"];

export type Link = { kind: string; to: string };
export type GraphEvent = {
  file: string;
  event: string;
  at: string;
  author: string;
  fields: Record<string, string>;
  body: string;
};
export type GraphNode = {
  id: string;
  type: string;
  title: string;
  body: string;
  created: string;
  author: string;
  status?: string;
  links: Link[];
  events: GraphEvent[];
};
export type Stamp = { author: string; now: Date };

const nodesDir = (root: string) => join(root, ".devgraph", "nodes");

function check(value: string, allowed: string[], what: string) {
  if (!allowed.includes(value))
    throw new Error(
      `Unknown ${what} "${value}". Use one of: ${allowed.join(", ")}`,
    );
}

export function init(root: string, prefix: string) {
  if (!/^[a-z0-9]+$/.test(prefix))
    throw new Error(`Prefix must be lowercase letters and digits: "${prefix}"`);
  if (existsSync(join(root, ".devgraph")))
    throw new Error(`Already initialized: ${join(root, ".devgraph")}`);
  mkdirSync(nodesDir(root), { recursive: true });
  writeFileSync(
    join(root, ".devgraph", "config.json"),
    `${JSON.stringify({ prefix }, null, 2)}\n`,
  );
  writeFileSync(join(nodesDir(root), ".gitkeep"), "");
}

export function loadNode(root: string, id: string): GraphNode {
  const dir = join(nodesDir(root), id);
  if (!/^[a-z0-9]+-[a-z0-9]+$/.test(id) || !existsSync(join(dir, "node.md")))
    throw new Error(`No node ${id}`);
  const { fields: f, body } = parse(
    readFileSync(join(dir, "node.md"), "utf8"),
    join(id, "node.md"),
  );
  const node: GraphNode = {
    id: f.id,
    type: f.type,
    title: f.title,
    body,
    created: f.created,
    author: f.author,
    status: f.type === "task" ? "open" : undefined,
    links: [],
    events: [],
  };
  const links = new Map<string, Link>();
  const files = readdirSync(dir)
    .filter((n) => n !== "node.md" && n.endsWith(".md"))
    .sort();
  for (const file of files) {
    const doc = parse(readFileSync(join(dir, file), "utf8"), join(id, file));
    const { event, at, author, ...rest } = doc.fields;
    const e: GraphEvent = {
      file,
      event,
      at,
      author,
      fields: rest,
      body: doc.body,
    };
    node.events.push(e);
    if (event === "status") node.status = rest.status;
    else if (event === "link")
      links.set(`${rest.kind} ${rest.to}`, { kind: rest.kind, to: rest.to });
    else if (event === "unlink") links.delete(`${rest.kind} ${rest.to}`);
    else if (event === "edit") {
      if (rest.title) node.title = rest.title;
      if (doc.body) node.body = doc.body;
    } else throw new Error(`${join(id, file)}: unknown event "${event}"`);
  }
  node.links = [...links.values()];
  return node;
}

export function loadAll(root: string): GraphNode[] {
  const dir = nodesDir(root);
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => loadNode(root, d.name))
    .sort((a, b) => a.created.localeCompare(b.created));
}

function oneLine(text: string, what: string) {
  if (!text.trim() || /[\r\n]/.test(text))
    throw new Error(`${what} must be one non-empty line`);
  return text.trim();
}

const EVENT_NAME =
  /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z-[0-9a-f]{4}\.md$/;

// An event always sorts after every event its writer has already seen on that node,
// even if the writer's clock is behind (see FORMAT.md, "Reading a node").
function writeEvent(
  root: string,
  id: string,
  stamp: Stamp,
  fields: Record<string, string>,
  body = "",
) {
  const dir = join(nodesDir(root), id);
  let t = stamp.now.getTime();
  const latest = readdirSync(dir)
    .filter((n) => EVENT_NAME.test(n))
    .sort()
    .at(-1);
  const m = latest ? EVENT_NAME.exec(latest) : null;
  if (m) {
    const [y, mo, d, h, mi, s, ms] = m.slice(1).map(Number);
    t = Math.max(t, Date.UTC(y, mo - 1, d, h, mi, s, ms) + 1);
  }
  const at = new Date(t).toISOString();
  const file = `${at.replace(/[-:.]/g, "")}-${randomBytes(2).toString("hex")}.md`;
  const header = { ...fields, at, author: stamp.author };
  writeFileSync(join(dir, file), serialize({ fields: header, body }), {
    flag: "wx",
  });
}

function checkLink(root: string, from: string, link: Link) {
  check(link.kind, LINK_KINDS, "link kind");
  if (link.to === from) throw new Error("A node cannot link to itself");
  loadNode(root, link.to);
}

export function addNode(
  root: string,
  input: { type: string; title: string; body: string; links: Link[] },
  stamp: Stamp,
): string {
  check(input.type, NODE_TYPES, "node type");
  const title = oneLine(input.title, "Title");
  if (input.type !== "spec" && input.links.length === 0) {
    throw new Error(
      `A ${input.type} needs at least one --link <kind>:<id> (only specs may stand alone)`,
    );
  }
  const { prefix } = JSON.parse(
    readFileSync(join(root, ".devgraph", "config.json"), "utf8"),
  );
  let id: string;
  do
    id = `${prefix}-${randomBytes(4).readUInt32BE().toString(36).padStart(6, "0").slice(-6)}`;
  while (existsSync(join(nodesDir(root), id)));
  for (const link of input.links) checkLink(root, id, link);

  mkdirSync(join(nodesDir(root), id));
  const fields = {
    id,
    type: input.type,
    title,
    created: stamp.now.toISOString(),
    author: stamp.author,
  };
  writeFileSync(
    join(nodesDir(root), id, "node.md"),
    serialize({ fields, body: input.body.trim() }),
    { flag: "wx" },
  );
  for (const link of input.links)
    writeEvent(root, id, stamp, { event: "link", ...link });
  return id;
}

export function setStatus(
  root: string,
  id: string,
  status: string,
  stamp: Stamp,
) {
  const node = loadNode(root, id);
  if (node.type !== "task")
    throw new Error(`Only tasks have a status; ${id} is a ${node.type}`);
  check(status, STATUSES, "status");
  writeEvent(root, id, stamp, { event: "status", status });
}

export function link(root: string, from: string, l: Link, stamp: Stamp) {
  loadNode(root, from);
  checkLink(root, from, l);
  writeEvent(root, from, stamp, { event: "link", kind: l.kind, to: l.to });
}

export function unlink(root: string, from: string, l: Link, stamp: Stamp) {
  const node = loadNode(root, from);
  if (!node.links.some((x) => x.kind === l.kind && x.to === l.to))
    throw new Error(`${from} has no ${l.kind} link to ${l.to}`);
  if (node.type !== "spec" && node.links.length === 1) {
    throw new Error(
      `Can't remove the last link of ${from}: every ${node.type} needs at least one`,
    );
  }
  writeEvent(root, from, stamp, { event: "unlink", kind: l.kind, to: l.to });
}

export function edit(
  root: string,
  id: string,
  change: { title?: string; body?: string },
  stamp: Stamp,
) {
  loadNode(root, id);
  const fields: Record<string, string> = { event: "edit" };
  if (change.title !== undefined) fields.title = oneLine(change.title, "Title");
  const body = change.body?.trim() ?? "";
  if (!fields.title && !body)
    throw new Error("Nothing to edit: give --title or --body");
  writeEvent(root, id, stamp, fields, body);
}
