import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const styles = readFileSync("src/styles.css", "utf8");

describe("GitHub issues - visual regressions", () => {
  it("renders completed-state checkboxes as circles", () => {
    expect(styles).toMatch(/\.checkbox\s*\{[^}]*border-radius:\s*999px;/s);
  });
});
