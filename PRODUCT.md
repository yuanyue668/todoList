# Edge Todos Product and Architecture Notes

## Purpose

Edge Todos is a small cross-platform desktop todo widget for Windows and macOS. It is designed as a floating, resizable side tool that can sit near the screen edge, hide when not needed, and quickly reappear on hover.

The primary workflow is grouped todo management. Users define priority groups, add todos directly inside a group, attach images, mark items complete, and freely reorder items by drag and drop.

## Current Product Behavior

- The app uses a compact desktop-window layout similar to a chat/contact sidebar.
- The top bar contains browser-like todo page tabs, edge-hide control when available in Tauri, and settings.
- The product logo and title are intentionally omitted to preserve space for tabs.
- The app supports multiple todo pages. Each page has a title, a soft solid background color, its own template, and its own todos.
- At least one page is always kept. The default page title is `待办事项`; new pages use the same default title.
- Todos are organized by priority groups from the active page's template.
- Each group title has an add button on the right. Clicking it opens an inline input at the top of that group.
- Adding a todo from a group creates the item in that group and then hides the input.
- Todo text is the todo content. There is no separate title/body model.
- Todo text supports Markdown emoji syntax through `remark-gemoji`, for example `:sparkles:`.
- Double-click todo text to edit it inline. `Enter` or blur saves; `Esc` cancels.
- Todos support image attachments through paste or file selection.
- Images render as thumbnails on the right side of a todo. Clicking a thumbnail opens a larger preview with a toolbar.
- If a todo has more than three images, the row shows a `+N` thumbnail entry so hidden attachments remain reachable.
- The image preview toolbar supports deleting the current image after confirmation.
- A todo checkbox toggles completion. Completed todos are visually muted and struck through.
- Toggling completion does not change the todo's manual sort order.
- Todos can be dragged to any position, inside the same group or across groups.
- Dropping on another todo inserts before that todo. Dropping on group empty space appends to the group.
- Deleting a todo uses the trash button fixed on the far right of the todo row.
- Page tabs can be selected like browser tabs, added with the plus button, deleted when more than one exists, renamed by double-clicking the title, and recolored from the swatch before the title.
- Deleting a page tab from the top tab strip requires confirmation because it removes the page's todos.
- Page tabs can be drag-reordered directly in the tab strip.
- Inactive page tabs are compact and only show the first four characters of the title. The active tab expands to show the full title. Overflowing tabs remain in a horizontal scroll area, and vertical wheel input over the tab strip scrolls tabs horizontally.
- A page management button beside settings opens a list of all tabs in the current tab order. The list supports selecting, renaming, recoloring, drag reordering, single deletion, and batch deletion. Reordering updates the outer tab strip immediately. Deletion requires confirmation. Single deletion keeps at least one tab; batch deletion can remove all tabs, after which the app automatically creates a new empty `待办事项` page.

## Priority Templates

- The app ships with two templates:
  - Four-quadrant template.
  - High/medium/low template.
- A priority only has a title and order.
- The title may include emoji directly, for example `🔥 紧急且重要`.
- Settings allow:
  - Selecting a template to edit or apply to the active page.
  - Renaming the active template.
  - Exporting all local data to JSON.
  - Exporting the current page to JSON.
  - Importing a JSON backup after confirmation; importing replaces the current local state.
  - Creating a custom template.
  - Restoring built-in templates.
  - Adding priority rows.
  - Editing priority titles.
  - Reordering priorities by drag and drop.
  - Reordering priorities with up/down buttons.
  - Deleting priorities.
- Saving a template only persists template edits. Applying a template persists template edits and changes the active page to use the selected template.
- If applying a different template to a page, that page's existing todos move to the first priority in the newly applied template. If applying the same template, existing valid todo groups are preserved.
- Priority rows no longer have separate color or icon fields.

## Persistence

- Current persistence is browser/WebView `localStorage`.
- Storage key: `edge-todos-state-v1`.
- State shape is defined in `src/types.ts`. Current state stores `schemaVersion`, templates plus `pages`; each page owns its `templateId`, title, color, and todos.
- Load/save helpers are in `src/storage.ts`.
- Loading normalizes older or partially corrupted local data by filling missing page, todo, attachment, template, sort, and window preference fields.
- Image attachments are stored as compressed data URLs inside todo state.
- This keeps browser preview and Tauri WebView behavior identical.
- Known tradeoff: large or many images can make `localStorage` heavy. A later version should migrate attachments to IndexedDB or Tauri filesystem storage if image volume matters.

## Architecture

- Frontend: React + TypeScript + Vite.
- Desktop shell: Tauri v2.
- Main UI: `src/App.tsx`.
- Visual styling: `src/styles.css`.
- Defaults and built-in templates: `src/defaults.ts`.
- Shared types: `src/types.ts`.
- Local persistence: `src/storage.ts`.
- Image compression and conversion: `src/image.ts`.
- Tauri window helpers: `src/tauriWindow.ts`.
- Tauri config: `src-tauri/tauri.conf.json`.

The app is intentionally frontend-heavy. The Rust side only boots Tauri and loads the web app. Window hiding is accessed from the frontend through Tauri window APIs when available.

## Window Behavior

- The Tauri window is configured as a resizable, undecorated, always-on-top window.
- Default size is `360x640`.
- Frontend detects whether it is running inside Tauri.
- Edge detection and hide/reveal helpers live in `src/tauriWindow.ts`.
- Browser preview does not support real desktop edge hiding.
- Tauri now uses an explicit content security policy instead of disabling CSP.

## Verification

Use these commands after functional changes:

```bash
npm run build
npm audit --audit-level=moderate
```

For desktop runtime verification, use:

```bash
npm run tauri:dev
```

This environment uses Node `22.22.3`. `npm run build` and `npm run dev` work. Desktop packaging (`npm run tauri:build`) requires Rust/Cargo and Linux Tauri prerequisites on the target machine.

## Current Known Limitations

- No cloud sync, account system, or multi-device support.
- Import/export is JSON-based and still uses browser/WebView file mechanisms; a later desktop version should use Tauri file dialogs and filesystem storage.
- No full Markdown editor; todo content is a single-line Markdown-rendered string.
- Attachments are stored in `localStorage`, not as separate files.
- Drag-and-drop uses native HTML5 drag events. If future desktop WebView behavior is inconsistent, consider switching to a dedicated drag library.
- Built-in templates can be restored, but existing todo priority remapping remains simple when applying a different template to a page: page todos move to the first priority in the selected template.

## Recommended Next Work

- Improve drag-and-drop visual feedback with insertion indicators.
- Migrate images from `localStorage` to IndexedDB or Tauri filesystem storage.
- Add explicit collapse/expand for groups.
- Add keyboard shortcuts for creating todos in the active group.
- Add desktop build verification on Windows and macOS with Rust installed.
