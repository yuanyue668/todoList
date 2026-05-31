# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 行为准则

这些准则用于减少 LLM 在编码任务中常见的错误。可根据项目特定说明进行合并或调整。

**权衡：**这些准则更偏向谨慎而不是速度。对于非常简单的任务，可以根据判断灵活处理。

### 1. 编码前先思考

**不要假设。不要掩盖困惑。主动说明取舍。**

实现之前：
- 明确说明你的假设。如果不确定，就提问。
- 如果存在多种理解方式，把它们说出来，不要悄悄选择其中一种。
- 如果存在更简单的方法，要说明。必要时要提出反对意见。
- 如果某件事不清楚，就停下来。指出让你困惑的地方，并提问。

### 2. 简单优先

**用能解决问题的最少代码。不要写推测性内容。**

- 不添加超出需求的功能。
- 不为只使用一次的代码创建抽象。
- 不添加未被要求的“灵活性”或“可配置性”。
- 不为不可能发生的场景编写错误处理。
- 如果你写了 200 行，而 50 行就能完成，就重写并简化。

自问：“资深工程师会认为这过度复杂吗？”如果答案是会，就简化。

### 3. 外科手术式修改

**只改必须修改的地方。只清理自己造成的问题。**

编辑现有代码时：
- 不“顺手改进”相邻代码、注释或格式。
- 不重构没有坏掉的东西。
- 匹配现有风格，即使你会用不同方式实现。
- 如果发现无关的废弃代码，提出来，不要删除。

当你的修改造成孤立代码时：
- 删除由你的修改导致未使用的 import、变量和函数。
- 不删除修改前就存在的废弃代码，除非用户要求。

检验标准：每一行改动都应该能直接追溯到用户请求。

### 4. 目标驱动执行

**定义成功标准。循环执行直到完成验证。**

把任务转化为可验证的目标：
- “添加校验” -> “为非法输入编写测试，然后让测试通过”
- “修复 bug” -> “编写能复现 bug 的测试，然后让测试通过”
- “重构 X” -> “确保重构前后测试都通过”

对于多步骤任务，给出简短计划：

```text
1. [步骤] -> 验证：[检查项]
2. [步骤] -> 验证：[检查项]
3. [步骤] -> 验证：[检查项]
```

强成功标准能让你独立循环推进。弱标准，例如“让它能用”，会导致反复请求澄清。

**这些准则生效的表现是：**diff 中不必要的改动更少，因为过度复杂而返工的次数更少，澄清问题会出现在实现之前，而不是错误发生之后。

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
