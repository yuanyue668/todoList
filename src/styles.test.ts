import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const styles = readFileSync("src/styles.css", "utf8");

describe("GitHub issues - visual regressions", () => {
  it("renders completed-state checkboxes as circles", () => {
    expect(styles).toMatch(/\.checkbox\s*\{[^}]*border-radius:\s*999px;/s);
  });

  it("allows long todo markdown text to wrap in narrow windows", () => {
    expect(styles).toMatch(/\.markdown-line\s*\{[^}]*white-space:\s*normal;/s);
    expect(styles).toMatch(/\.markdown-line\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
    expect(styles).not.toMatch(/\.markdown-line\s*\{[^}]*text-overflow:\s*ellipsis;/s);
  });

  it("marks the active page tab with a visible accent", () => {
    expect(styles).toMatch(/\.page-tab\.is-active\s*\{[^}]*border-top-color:\s*#2563eb;/s);
    expect(styles).toMatch(/\.page-tab\.is-active\s*\{[^}]*inset 0 3px 0 #2563eb/s);
  });
});
