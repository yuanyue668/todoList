# Agent Notes

Before changing features, read `PRODUCT.md`. It captures the current product intent, behavior, architecture, persistence model, known limitations, and recommended next work.

Common commands:

```bash
npm run build
npm audit --audit-level=moderate
npm run dev
npm run tauri:dev
```

Release pipeline handoff:

1. Run `npm test` and `npm run build` locally before pushing.
2. For a desktop release, update `package.json`, `package-lock.json`, and `src-tauri/tauri.conf.json` to the same version, commit to `main`, push, then tag and push `vX.Y.Z`.
3. Monitor GitHub Actions with `gh run list --limit 5` and `gh run watch <run-id> --exit-status`.
4. The `Deploy to GitHub Pages` workflow runs on pushes to `main`; the `Release` workflow runs on `v*` tags and uploads Windows NSIS plus macOS DMG artifacts into a draft GitHub Release.
5. If CI fails, inspect with `gh run view <run-id> --log-failed`, fix locally, rerun tests, push a corrective commit, and move/recreate the release tag only when the broken tag has not produced a usable release.
6. After success, download the Windows installer from the draft release or workflow artifacts, place it under `artifacts/`, run it from this workspace, and verify the installed Edge Todos opens.

Implementation entry points:

- `src/App.tsx` for product behavior and React components.
- `src/styles.css` for layout and visual changes.
- `src/types.ts` for persisted state shape.
- `src/defaults.ts` for built-in templates and sample data.
- `src/storage.ts` for local persistence.
- `src-tauri/tauri.conf.json` for desktop window configuration.
