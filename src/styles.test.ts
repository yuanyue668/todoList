import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const styles = readFileSync("src/styles.css", "utf8");

describe("GitHub issues - visual regressions", () => {
  it("renders completed-state checkboxes as circles", () => {
    expect(styles).toMatch(/\.checkbox\s*\{[^}]*width:\s*12px;/s);
    expect(styles).toMatch(/\.checkbox\s*\{[^}]*height:\s*12px;/s);
    expect(styles).toMatch(/\.checkbox\s*\{[^}]*border-radius:\s*999px;/s);
    expect(styles).toMatch(/\.checkbox svg\s*\{[^}]*width:\s*10px;/s);
    expect(styles).toMatch(/\.checkbox svg\s*\{[^}]*height:\s*10px;/s);
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

  it("keeps todo row action targets consistently sized and spaced", () => {
    expect(styles).toMatch(/\.todo-style-toggle\s*\{[^}]*width:\s*28px;[^}]*height:\s*28px;/s);
    expect(styles).toMatch(/\.delete-button\s*\{[^}]*width:\s*28px;[^}]*height:\s*28px;/s);
    expect(styles).toMatch(/\.todo-item\s*\{[^}]*align-items:\s*center;/s);
    expect(styles).toMatch(/\.todo-actions\s*\{[^}]*gap:\s*6px;/s);
    expect(styles).toMatch(/\.todo-actions\s*\{[^}]*align-self:\s*center;/s);
    expect(styles).not.toMatch(/\.todo-actions\s*\{[^}]*width:\s*48px;/s);
  });

  it("keeps the text style reset control inside the style panel grid", () => {
    expect(styles).toMatch(/\.todo-style-panel\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*24px\)\s*repeat\(2,\s*24px\)\s*minmax\(72px,\s*1fr\)\s*24px;/s);
    expect(styles).toMatch(/\.todo-style-panel\s*\{[^}]*overflow:\s*hidden;/s);
  });

  it("renders todo attachments and time metadata as rows outside the todo card", () => {
    expect(styles).toMatch(/\.todo-entry\s*\{[^}]*display:\s*grid;/s);
    expect(styles).toMatch(/\.todo-meta-card\s*\{[^}]*background:\s*#f1f5f9;/s);
    expect(styles).toMatch(/\.thumb-strip\s*\{[^}]*max-width:\s*none;/s);
  });

  it("stacks time metadata against the todo card without a connector or top border", () => {
    expect(styles).toMatch(/\.todo-entry\s*\{[^}]*row-gap:\s*0;/s);
    expect(styles).toMatch(/\.todo-meta-card\s*\{[^}]*margin-left:\s*20px;/s);
    expect(styles).toMatch(/\.thumb-strip\s*\{[^}]*margin-left:\s*20px;/s);
    expect(styles).toMatch(/\.todo-meta-card\s*\{[^}]*margin-top:\s*-1px;/s);
    expect(styles).toMatch(/\.todo-meta-card\s*\{[^}]*border-top:\s*0;/s);
    expect(styles).toMatch(/\.todo-meta-card\s*\{[^}]*border-radius:\s*0 0 6px 6px;/s);
    expect(styles).toMatch(/\.todo-meta-card\s+\.todo-time-field\s*\{[^}]*line-height:\s*1;/s);
    expect(styles).not.toMatch(/\.todo-meta-card::before/);
  });

  it("uses the planned label typography for displayed time values", () => {
    expect(styles).toMatch(/\.todo-time-field time\s*\{[^}]*color:\s*inherit;/s);
    expect(styles).toMatch(/\.todo-time-field time\s*\{[^}]*font:\s*inherit;/s);
    expect(styles).toMatch(/\.todo-time-field time\s*\{[^}]*line-height:\s*inherit;/s);
  });
});
