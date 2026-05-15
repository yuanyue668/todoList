# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Before Changing Features

Read `PRODUCT.md` first. It is the authoritative source for product intent, current behavior, persistence model, known limitations, and recommended next work.

## Commands

```bash
npm run build          # TypeScript check + Vite build (requires Node 20.19+ or 22.12+)
npm run dev            # Vite dev server on port 1420 (requires Node 20.19+)
npm run tauri:dev      # Tauri desktop dev mode (requires Rust + Tauri CLI + Node 20.19+)
npm run tauri:build    # Tauri desktop production build
npm audit --audit-level=moderate
```

**Node version**: Environment has Node 22.22.3. `npm run build` and `npm run dev` work. Tauri packaging (`npm run tauri:build`) additionally requires Rust/Cargo.

**Verification after functional changes**:
```bash
npm run build
npm audit --audit-level=moderate
```

## Architecture

The app is a cross-platform desktop todo widget. The frontend is intentionally where all logic lives — the Rust/Tauri side only boots the WebView and loads the web app.

**Stack**: React 18 + TypeScript + Vite (frontend) · Tauri v2 (desktop shell, `src-tauri/`)

### Key Source Files

| File | Role |
|------|------|
| `src/App.tsx` | Entire UI and all React components; single-file component tree |
| `src/types.ts` | All persisted state types (`AppState`, `TodoPage`, `Todo`, `Priority`, etc.) |
| `src/storage.ts` | `loadState`/`saveState` + `normalizeState` for migration/corruption recovery |
| `src/defaults.ts` | Built-in templates and `DEFAULT_STATE` |
| `src/image.ts` | Image compression and conversion to data URLs |
| `src/tauriWindow.ts` | Tauri window detection, edge-hide/reveal helpers |
| `src/styles.css` | All visual layout and styling |
| `src-tauri/tauri.conf.json` | Desktop window config (undecorated, always-on-top, 360×640 default) |

### State and Persistence

- All state lives in `localStorage` under key `edge-todos-state-v1` (schema version 2).
- `AppState` holds `templates`, `pages` (each with their own `templateId`, `color`, and `todos`), `activePageId`, and `windowPrefs`.
- `normalizeState` in `storage.ts` handles schema migration and partial corruption; it is also used at import time.
- Image attachments are compressed data URLs stored inline in todo state — no separate file storage.

### Data Model Relationships

- `PriorityTemplate` → has ordered `Priority[]`
- `TodoPage` → references a `templateId`, owns its `Todo[]`
- `Todo` → references a `priorityId` (must match a priority in the page's template), has `sortIndex` for manual ordering and optional `ImageAttachment[]`
- When applying a different template to a page, todos with invalid `priorityId` values fall back to the template's first priority (by `order`).

### Tauri Integration

- `src/tauriWindow.ts` exposes `getCurrentTauriWindow()` which returns `null` in browser preview — all Tauri-specific code must guard against this.
- The window is configured as undecorated and always-on-top; edge detection and hide/reveal are frontend-driven via Tauri window APIs.
