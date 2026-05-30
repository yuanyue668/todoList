import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Tauri desktop configuration", () => {
  it("does not create a second automatic tray icon when Rust owns the tray menu", () => {
    const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
    const rustMain = readFileSync("src-tauri/src/lib.rs", "utf8");

    expect(rustMain).toContain("TrayIconBuilder::new()");
    expect(config.app).not.toHaveProperty("trayIcon");
  });

  it("allows the custom titlebar close button to hide the main window", () => {
    const capability = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8"));

    expect(capability.windows).toContain("main");
    expect(capability.permissions).toContain("core:window:allow-hide");
  });
});
