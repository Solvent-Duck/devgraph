export type Doc = { fields: Record<string, string>; body: string };

export function parse(text: string, path: string): Doc {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(
    text.replaceAll("\r\n", "\n"),
  );
  if (!m) throw new Error(`${path}: missing --- header`);
  const fields: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i < 1) throw new Error(`${path}: bad header line "${line}"`);
    fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { fields, body: m[2].trim() };
}

export function serialize({ fields, body }: Doc): string {
  const head = Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `---\n${head}\n---\n${body ? `${body}\n` : ""}`;
}
