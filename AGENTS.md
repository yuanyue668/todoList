# Agent Notes

Before changing features, read `PRODUCT.md`. It captures the current product intent, behavior, architecture, persistence model, known limitations, and recommended next work.

Common commands:

```bash
npm run build
npm audit --audit-level=moderate
npm run dev
npm run tauri:dev
```

Implementation entry points:

- `src/App.tsx` for product behavior and React components.
- `src/styles.css` for layout and visual changes.
- `src/types.ts` for persisted state shape.
- `src/defaults.ts` for built-in templates and sample data.
- `src/storage.ts` for local persistence.
- `src-tauri/tauri.conf.json` for desktop window configuration.
