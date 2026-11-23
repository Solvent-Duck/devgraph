#!/usr/bin/env node
const USAGE = `devgraph: a mergeable record of development context

Usage: devgraph <command>

Commands (planned, see docs/PLAN.md):
  init, add, link, show, blame <file:line>`;

export function run(args: string[]): { code: number; out: string } {
  const [cmd] = args;
  if (!cmd || cmd === "help" || cmd === "--help")
    return { code: 0, out: USAGE };
  return { code: 1, out: `Unknown command: ${cmd}\n\n${USAGE}` };
}

if (import.meta.main) {
  const { code, out } = run(process.argv.slice(2));
  (code === 0 ? console.log : console.error)(out);
  process.exitCode = code;
}
