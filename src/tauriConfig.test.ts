import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Tauri desktop configuration", () => {
  it("does not create a second automatic tray icon when Rust owns the tray menu", () => {
    const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
    const rustMain = readFileSync("src-tauri/src/lib.rs", "utf8");

    expect(rustMain).toContain("TrayIconBuilder::new()");
    expect(config.app).not.toHaveProperty("trayIcon");
  });
});
