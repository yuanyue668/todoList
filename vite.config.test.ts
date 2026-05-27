import { afterEach, describe, expect, it, vi } from "vitest";

const trackedEnvKeys = ["GITHUB_ACTIONS", "VITE_BASE_PATH"] as const;
const originalEnv = new Map(trackedEnvKeys.map((key) => [key, process.env[key]]));

async function loadConfigWithEnv(env: Partial<Record<(typeof trackedEnvKeys)[number], string>>) {
  for (const key of trackedEnvKeys) {
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }

  vi.resetModules();
  return (await import("./vite.config")).default;
}

afterEach(() => {
  for (const key of trackedEnvKeys) {
    const originalValue = originalEnv.get(key);
    if (originalValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalValue;
    }
  }
  vi.resetModules();
});

describe("vite base path", () => {
  it("does not use the GitHub Pages base just because a build runs in GitHub Actions", async () => {
    const config = await loadConfigWithEnv({ GITHUB_ACTIONS: "true" });

    expect(config.base).toBe("/");
  });

  it("uses the GitHub Pages base only when explicitly requested", async () => {
    const config = await loadConfigWithEnv({ VITE_BASE_PATH: "/todoList/" });

    expect(config.base).toBe("/todoList/");
  });
});
