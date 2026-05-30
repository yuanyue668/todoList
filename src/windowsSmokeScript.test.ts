import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Windows installed-app smoke script", () => {
  it("waits for the pin control before enabling auto-hide and reports DOM title diagnostics", () => {
    const script = readFileSync("scripts/verify-windows-installed-app.ps1", "utf8");

    expect(script).toContain("function Wait-ForElementCenter");
    expect(script).toContain("$script:waitedElementCenter = Get-ElementCenter $Selector");
    expect(script).toContain("function Get-PinButtonCenter");
    expect(script).toContain(".win-controls .win-btn:not(.win-btn-close).is-active");
    expect(script).toContain("Boolean(document.querySelector('.win-controls .win-btn:not(.win-btn-close):not(.is-active)'))");
    expect(script).toContain("Available titled elements");
    expect(script).toContain("Wait-ForElementCenter '.win-controls .win-btn:not(.win-btn-close).is-active'");
  });

  it("clicks the custom close button and verifies the installed window hides", () => {
    const script = readFileSync("scripts/verify-windows-installed-app.ps1", "utf8");

    expect(script).toContain("function Test-CloseButtonHide");
    expect(script).toContain("Wait-ForElementCenter '.win-btn-close'");
    expect(script).toContain("[Win32WindowProbe]::IsWindowVisible($Handle) -eq $false");
    expect(script).toContain("Testing titlebar close button hide");
  });
});
