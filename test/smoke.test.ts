import { expect, test } from "vitest";
import { run } from "../src/cli.ts";

test("prints usage with no command", () => {
  const { code, out } = run([]);
  expect(code).toBe(0);
  expect(out).toContain("Usage: devgraph");
});

test("rejects an unknown command", () => {
  expect(run(["nope"]).code).toBe(1);
});
