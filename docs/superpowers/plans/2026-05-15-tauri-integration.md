# Tauri Integration (F4–F6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add system tray icon (F4), window position/size memory (F5), and native file dialogs for import/export (F6) using Tauri v2 official plugins.

**Architecture:** Rust-side plugin registration in `src-tauri/src/lib.rs`. Tray event handling bridged to the frontend via Tauri events. File dialogs replace browser File API with a Tauri-environment guard to preserve browser preview fallback.

**Tech Stack:** Rust 1.95, Tauri v2, tauri-plugin-tray, tauri-plugin-window-state, tauri-plugin-dialog, tauri-plugin-fs, @tauri-apps/plugin-dialog, @tauri-apps/plugin-fs

**Prerequisite:** Complete the frontend-features plan first. Rust and Cargo must be available (`rustc --version` and `cargo --version` should both succeed).

---

## File Map

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add tauri-plugin-tray, tauri-plugin-window-state |
| `src-tauri/src/lib.rs` | Register all new plugins, add tray setup, close-to-tray behavior |
| `src-tauri/tauri.conf.json` | Add trayIcon config, window close behavior |
| `src-tauri/capabilities/default.json` | Add tray, window-state, dialog, fs permissions |
| `src/tauriWindow.ts` | Export `isTauri`, add `listenTrayShow` helper |
| `src/App.tsx` | F4 tray event listener, F6 file dialog import/export |

**Icon assets required before F4:** `src-tauri/icons/tray-icon.png` (32×32 px, transparent background). For development, any square PNG works — production icon comes from Plan C (F8).

---

## Task 1 — F5: Window State Memory (simplest Tauri change, no frontend needed)

Do F5 first because it's Rust-only and validates that the Rust build pipeline works.

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add `tauri-plugin-window-state` to `Cargo.toml`**

In `src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
tauri-plugin-window-state = "2"
```

Full `[dependencies]` section becomes:

```toml
[dependencies]
tauri = { version = "2.11.1", features = [] }
tauri-plugin-opener = "2.5.4"
tauri-plugin-window-state = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 2: Register the plugin in `src-tauri/src/lib.rs`**

Replace the full file content:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running edge todos");
}
```

- [ ] **Step 3: Verify Rust build**

```bash
cd src-tauri && cargo build 2>&1 | tail -10
```

Expected: `Compiling edge-todos ...` then `Finished`. No errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/Cargo.lock
git commit -m "feat(F5): add tauri-plugin-window-state for position/size memory"
```

---

## Task 2 — F4: System Tray — Placeholder Icon

**Files:**
- Create: `src-tauri/icons/tray-icon.png` (via script)

- [ ] **Step 1: Generate a placeholder tray icon for development**

```bash
cd /mnt/workspace/gitCode/sinat_31531339/todoList
node -e "
const { createCanvas } = require('canvas');
" 2>/dev/null || true

# Use Node to write a minimal 32x32 PNG via raw bytes if canvas unavailable
# Industry standard fallback: copy an existing icon and resize
# Check if ImageMagick is available
convert --version 2>/dev/null && \
  convert -size 32x32 xc:'#2563eb' \
    -fill white -font DejaVu-Sans -pointsize 18 \
    -gravity center -annotate 0 'E' \
    src-tauri/icons/tray-icon.png && \
  echo "Generated with ImageMagick" || \
  echo "ImageMagick not available — copy any 32x32 PNG to src-tauri/icons/tray-icon.png manually"
```

If ImageMagick is not available, use `cp` to duplicate an existing icon file as a placeholder:

```bash
ls src-tauri/icons/ 2>/dev/null || mkdir -p src-tauri/icons
# If existing icons exist, copy one; otherwise create minimal placeholder with Node
node -e "
const fs = require('fs');
// Minimal 1x1 transparent PNG (44 bytes), will be upscaled by OS
const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000 1f15c489000000 0a4944415478016360000000 02000197 9fc1ae0000000049454e44ae426082','hex');
fs.mkdirSync('src-tauri/icons', { recursive: true });
fs.writeFileSync('src-tauri/icons/tray-icon.png', png);
console.log('Placeholder tray icon written');
" 2>/dev/null || echo "Node write also failed — create a 32x32 PNG manually at src-tauri/icons/tray-icon.png"
```

- [ ] **Step 2: Confirm file exists**

```bash
ls -lh src-tauri/icons/tray-icon.png
```

Expected: file exists with non-zero size.

---

## Task 3 — F4: System Tray — Rust Setup

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Add `tauri-plugin-tray` to `Cargo.toml`**

```toml
[dependencies]
tauri = { version = "2.11.1", features = ["tray-icon"] }
tauri-plugin-opener = "2.5.4"
tauri-plugin-window-state = "2"
tauri-plugin-tray = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 2: Implement tray and close-to-tray in `src-tauri/src/lib.rs`**

```rust
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Runtime,
};

fn setup_tray<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    if win.is_visible().unwrap_or(false) {
                        let _ = win.hide();
                    } else {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            setup_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Hide to tray instead of closing
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running edge todos");
}
```

- [ ] **Step 3: Update `src-tauri/tauri.conf.json` with tray icon path**

Add `"trayIcon"` inside `"app"`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Edge Todos",
  "version": "0.1.0",
  "identifier": "com.edge.todos",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "withGlobalTauri": true,
    "trayIcon": {
      "iconPath": "icons/tray-icon.png",
      "iconAsTemplate": true
    },
    "windows": [
      {
        "title": "Edge Todos",
        "label": "main",
        "width": 360,
        "height": 640,
        "minWidth": 320,
        "minHeight": 420,
        "resizable": true,
        "decorations": false,
        "alwaysOnTop": true,
        "skipTaskbar": false,
        "transparent": false,
        "center": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' http://localhost:1420 ws://localhost:1420"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all"
  }
}
```

- [ ] **Step 4: Add tray permission to `src-tauri/capabilities/default.json`**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default desktop permissions for Edge Todos",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:default",
    "core:window:allow-set-position",
    "core:window:allow-set-size",
    "core:window:allow-outer-size",
    "core:window:allow-outer-position",
    "tray:default"
  ]
}
```

- [ ] **Step 5: Verify Rust build**

```bash
cd src-tauri && cargo build 2>&1 | tail -15
```

Expected: `Finished` with no errors. If `tauri-plugin-tray` version not found, check `cargo search tauri-plugin-tray` for the latest version and update Cargo.toml accordingly.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/tauri.conf.json \
        src-tauri/capabilities/default.json src-tauri/icons/tray-icon.png \
        src-tauri/Cargo.lock
git commit -m "feat(F4): add system tray icon with show/quit menu and close-to-tray"
```

---

## Task 4 — F6: Native File Dialogs

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src/tauriWindow.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add dialog and fs plugins to `Cargo.toml`**

```toml
[dependencies]
tauri = { version = "2.11.1", features = ["tray-icon"] }
tauri-plugin-opener = "2.5.4"
tauri-plugin-window-state = "2"
tauri-plugin-tray = "2"
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 2: Register plugins in `src-tauri/src/lib.rs`**

Add to the builder chain in `run()`:

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .setup(|app| {
        setup_tray(app)?;
        Ok(())
    })
    .on_window_event(|window, event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window.hide();
        }
    })
    .run(tauri::generate_context!())
    .expect("error while running edge todos");
```

- [ ] **Step 3: Add dialog and fs permissions to `src-tauri/capabilities/default.json`**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default desktop permissions for Edge Todos",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:default",
    "core:window:allow-set-position",
    "core:window:allow-set-size",
    "core:window:allow-outer-size",
    "core:window:allow-outer-position",
    "tray:default",
    "dialog:default",
    "dialog:allow-save",
    "dialog:allow-open",
    "fs:default",
    "fs:allow-write-text-file",
    "fs:allow-read-text-file"
  ]
}
```

- [ ] **Step 4: Export `isTauri` from `src/tauriWindow.ts`**

Change line 10 from:

```ts
const isTauri = "__TAURI_INTERNALS__" in window;
```

to:

```ts
export const isTauri = "__TAURI_INTERNALS__" in window;
```

- [ ] **Step 5: Install JS plugin packages**

```bash
npm install @tauri-apps/plugin-dialog @tauri-apps/plugin-fs
```

- [ ] **Step 6: Replace `exportState` in `src/App.tsx` with Tauri-aware version**

Add to the imports at top of `src/App.tsx`:

```tsx
import { isTauri } from "./tauriWindow";
```

Replace the `exportState` function (around line 389):

```tsx
async function exportState(scope: "all" | "active") {
  const exportedState =
    scope === "all"
      ? state
      : { ...state, pages: [activePage], activePageId: activePage.id };
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename =
    scope === "all"
      ? `edge-todos-backup-${timestamp}.json`
      : `edge-todos-page-${timestamp}.json`;
  const content = JSON.stringify(exportedState, null, 2);

  if (isTauri) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({
      defaultPath: filename,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (path) await writeTextFile(path, content);
  } else {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
```

- [ ] **Step 7: Replace `importState` in `src/App.tsx` with Tauri-aware version**

Replace the `importState` function (around line 410):

```tsx
async function importState(file?: File) {
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await open({
      filters: [{ name: "JSON", extensions: ["json"] }],
      multiple: false,
    });
    if (!path || typeof path !== "string") return;
    try {
      const text = await readTextFile(path);
      const parsed = JSON.parse(text);
      if (!isBackupLike(parsed)) throw new Error("Invalid backup");
      const imported = normalizeState(parsed);
      setConfirmDialog({
        title: "导入数据",
        message: "导入会替换当前所有页签、模板和事项。确认继续？",
        confirmLabel: "导入",
        onConfirm: () => setState(imported),
      });
    } catch {
      setConfirmDialog({
        title: "导入失败",
        message: "文件不是有效的待办备份数据。",
        confirmLabel: "知道了",
        onConfirm: () => {},
      });
    }
    return;
  }

  // Browser fallback
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!isBackupLike(parsed)) throw new Error("Invalid backup");
      const imported = normalizeState(parsed);
      setConfirmDialog({
        title: "导入数据",
        message: "导入会替换当前所有页签、模板和事项。确认继续？",
        confirmLabel: "导入",
        onConfirm: () => setState(imported),
      });
    } catch {
      setConfirmDialog({
        title: "导入失败",
        message: "文件不是有效的待办备份数据。",
        confirmLabel: "知道了",
        onConfirm: () => {},
      });
    }
  };
  reader.onerror = () => {
    setConfirmDialog({
      title: "导入失败",
      message: "无法读取这个备份文件，请确认文件仍然存在且可访问。",
      confirmLabel: "知道了",
      onConfirm: () => {},
    });
  };
  reader.readAsText(file);
}
```

Update the Settings panel `onImport` call — in Tauri mode it no longer needs a file input trigger. In `App` JSX, update SettingsPanel props:

```tsx
onImport={() => isTauri ? importState() : importInputRef.current?.click()}
```

The hidden file input remains for browser fallback; keep it in JSX:

```tsx
<input
  ref={importInputRef}
  className="hidden-input"
  type="file"
  accept="application/json,.json"
  onChange={(event) => {
    const file = event.currentTarget.files?.[0];
    if (file) importState(file);
    event.currentTarget.value = "";
  }}
/>
```

- [ ] **Step 8: Verify Rust build and TypeScript build**

```bash
cd src-tauri && cargo build 2>&1 | tail -5
cd .. && npm run build 2>&1 | tail -5
```

Expected: both succeed with no errors.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/capabilities/default.json \
        src-tauri/Cargo.lock src/tauriWindow.ts src/App.tsx package.json package-lock.json
git commit -m "feat(F6): native file dialogs for import/export in Tauri; browser fallback preserved"
```

---

## Final Verification

- [ ] **Full TypeScript + Rust build**

```bash
npm run build && cd src-tauri && cargo build 2>&1 | tail -5
```

- [ ] **Run test suite (frontend tests still pass)**

```bash
npm test -- --reporter=verbose
```

Expected: all tests pass.

- [ ] **Manual smoke test in Tauri dev mode** (requires display/desktop environment)

```bash
npm run tauri:dev
```

Verify:
1. Tray icon appears in system tray
2. Left-click tray icon toggles window visibility
3. Right-click shows "显示窗口" / "退出" menu
4. Clicking window close button hides to tray (does not quit)
5. Window position is saved and restored after restart
6. Export shows native file save dialog
7. Import shows native file open dialog
