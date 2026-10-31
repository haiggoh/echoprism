/**
 * Branding (emoji rollout Task 18): the About mark 📐 leads the CLI usage banner
 * (bin/echoprism) and the README h1. App-UI branding is out of scope.
 */
// @ts-expect-error the repo does not ship @types/node (see seed-script.test.ts)
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const root = new URL("../../", import.meta.url);

test("CLI usage banner leads with the About mark", () => {
  const bin = readFileSync(new URL("bin/echoprism", root), "utf8");
  expect(bin).toContain("📐 echoprism — launch EchoPrism");
});

test("README h1 is exactly the mark plus the name", () => {
  const readme = readFileSync(new URL("README.md", root), "utf8");
  expect(readme.split("\n")[0]).toBe("# 📐 EchoPrism");
});
