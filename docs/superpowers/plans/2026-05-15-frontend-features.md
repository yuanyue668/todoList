# Frontend Features (F0–F3, F7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement mouse auto-hide (F0), drag insertion indicator (F1), group collapse (F2), keyboard shortcuts (F3), and About dialog (F7) — all pure frontend changes requiring no Rust.

**Architecture:** All behavior changes go into `src/App.tsx`. Visual changes go into `src/styles.css`. Version injection added to `vite.config.ts`. A Vitest test suite covers each feature before implementation.

**Tech Stack:** React 18, TypeScript, Vite 8, Vitest, @testing-library/react, jsdom

---

## File Map

| File | Change |
|------|--------|
| `src/App.tsx` | F0 timer logic, F1 drag state, F2 collapse state, F3 keyboard handler + ref registration, F7 About component + state |
| `src/styles.css` | F1 drop-target indicator, F2 collapse button positioning |
| `vite.config.ts` | F7 version injection via `define` |
| `src/test-setup.ts` | **Create** — jest-dom matchers |
| `src/App.test.tsx` | **Create** — all feature tests |

---

## Task 0 — Setup Vitest Test Environment

**Files:**
- Modify: `vite.config.ts`
- Modify: `package.json`
- Create: `src/test-setup.ts`

- [ ] **Step 1: Install test dependencies**

```bash
npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

Expected: packages added to devDependencies, no errors.

- [ ] **Step 2: Add test config to `vite.config.ts`**

Replace the entire file with:

```ts
/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2020",
    minify: "esbuild",
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
```

- [ ] **Step 3: Create `src/test-setup.ts`**

```ts
import "@testing-library/jest-dom";
```

- [ ] **Step 4: Add test script to `package.json`**

In the `"scripts"` section, add after `"build"`:

```json
"test": "vitest run",
"test:watch": "vitest",
```

- [ ] **Step 5: Verify setup**

```bash
npm run build && npm test -- --reporter=verbose 2>&1 | head -20
```

Expected: build passes, vitest reports "No test files found" (no tests yet) or exits 0.

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts package.json package-lock.json src/test-setup.ts
git commit -m "test: add vitest + @testing-library/react setup"
```

---

## Task 1 — F0: Mouse Leave Auto-Hide

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx` (create on first use)

**Behavior:** When the window is docked to a screen edge (`windowPrefs.edge !== null`) and running inside Tauri, leaving the mouse from the window starts a 1.5 s timer. If the mouse re-enters before the timer fires, it is cancelled. After 1.5 s, the window hides.

- [ ] **Step 1: Create `src/App.test.tsx` with F0 tests**

```tsx
import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import App from "./App";

// Mock tauriWindow — getCurrentTauriWindow returns null by default (browser mode)
const mockSetWindowHidden = vi.fn().mockResolvedValue(undefined);
const mockDetectDockedEdge = vi.fn().mockResolvedValue(null);
const mockGetCurrentTauriWindow = vi.fn().mockResolvedValue(null);

vi.mock("./tauriWindow", () => ({
  getCurrentTauriWindow: () => mockGetCurrentTauriWindow(),
  detectDockedEdge: () => mockDetectDockedEdge(),
  setWindowHidden: (edge: string, hidden: boolean) =>
    mockSetWindowHidden(edge, hidden),
}));

const DOCKED_STATE = JSON.stringify({
  schemaVersion: 2,
  templates: [
    {
      id: "matrix",
      name: "四象限优先级",
      priorities: [
        { id: "matrix-urgent-important", name: "🔥 紧急且重要", order: 0 },
      ],
    },
  ],
  pages: [
    {
      id: "page-1",
      title: "待办事项",
      color: "#f8fafc",
      templateId: "matrix",
      todos: [],
    },
  ],
  activePageId: "page-1",
  windowPrefs: { edge: "left", hidden: false },
});

describe("F0 — Mouse Leave Auto-Hide", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.setItem("edge-todos-state-v1", DOCKED_STATE);
    mockGetCurrentTauriWindow.mockResolvedValue({
      setPosition: vi.fn().mockResolvedValue(undefined),
      outerPosition: vi.fn().mockResolvedValue({ x: 0, y: 0 }),
      outerSize: vi.fn().mockResolvedValue({ width: 360, height: 640 }),
    });
    mockSetWindowHidden.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    mockGetCurrentTauriWindow.mockResolvedValue(null);
  });

  it("calls setWindowHidden after 1500 ms when mouse leaves docked window", async () => {
    render(<App />);
    // Wait for hasTauriWindow to be set
    await act(async () => {
      await vi.runAllTicks();
    });

    const shell = screen.getByRole("main");
    fireEvent.mouseLeave(shell);

    expect(mockSetWindowHidden).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1500);
      await vi.runAllTicks();
    });

    expect(mockSetWindowHidden).toHaveBeenCalledWith("left", true);
  });

  it("cancels the timer when mouse re-enters before 1500 ms", async () => {
    render(<App />);
    await act(async () => { await vi.runAllTicks(); });

    const shell = screen.getByRole("main");
    fireEvent.mouseLeave(shell);

    await act(async () => { vi.advanceTimersByTime(800); });
    fireEvent.mouseEnter(shell);

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await vi.runAllTicks();
    });

    expect(mockSetWindowHidden).not.toHaveBeenCalledWith("left", true);
  });

  it("does not start timer when window is not docked (edge is null)", async () => {
    localStorage.setItem(
      "edge-todos-state-v1",
      JSON.stringify({
        ...JSON.parse(DOCKED_STATE),
        windowPrefs: { edge: null, hidden: false },
      })
    );
    render(<App />);
    await act(async () => { await vi.runAllTicks(); });

    const shell = screen.getByRole("main");
    fireEvent.mouseLeave(shell);

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await vi.runAllTicks();
    });

    expect(mockSetWindowHidden).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "F0"
```

Expected: tests fail because `onMouseLeave` is not yet wired up.

- [ ] **Step 3: Implement F0 in `src/App.tsx`**

After the existing `importInputRef` ref (around line 55), add:

```tsx
const autoHideTimerRef = useRef<number | undefined>(undefined);
```

After the existing constants at the top of the file (after `PAGE_COLORS`), add:

```tsx
const AUTO_HIDE_DELAY_MS = 1500;
```

Add `handleMouseLeave` function after `handleReveal` (around line 475):

```tsx
function handleMouseLeave() {
  if (!hasTauriWindow || !state.windowPrefs.edge) return;
  autoHideTimerRef.current = window.setTimeout(() => {
    handleHide();
  }, AUTO_HIDE_DELAY_MS);
}
```

Modify `handleReveal` to clear the timer at the top of the function (around line 467):

```tsx
async function handleReveal() {
  window.clearTimeout(autoHideTimerRef.current);
  const edge = state.windowPrefs.edge;
  if (!edge) return;
  await setWindowHidden(edge, false);
  setState((current) => ({
    ...current,
    windowPrefs: { edge, hidden: false },
  }));
}
```

Add `onMouseLeave` to `<main>` (around line 478). The `<main>` element has implicit ARIA role "main" so `screen.getByRole("main")` works in tests without adding an explicit `role` attribute:

```tsx
<main
  className="app-shell"
  style={{ backgroundColor: activePage.color }}
  onMouseEnter={handleReveal}
  onMouseLeave={handleMouseLeave}
>
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "F0"
```

Expected: all 3 F0 tests pass.

- [ ] **Step 5: Verify build**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ built in` with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(F0): mouse leave auto-hide after 1500ms when window is docked"
```

---

## Task 2 — F1: Drag Insertion Indicator (CSS)

**Files:**
- Modify: `src/styles.css`

**Behavior:** When a todo is the drop target during a drag, a 2 px blue line appears above it.

- [ ] **Step 1: Add `position: relative` to `.todo-item` and the indicator rule**

In `src/styles.css`, locate `.todo-item` (around line 429). Add `position: relative;` as the first property:

```css
.todo-item {
  position: relative;
  min-height: 34px;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto 24px;
  gap: 5px;
  align-items: center;
  padding: 4px 6px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
```

Then append at the end of `styles.css` (before the `@media` block):

```css
.todo-item.is-drop-target::before {
  content: "";
  position: absolute;
  top: -3px;
  left: 0;
  right: 0;
  height: 2px;
  background-color: var(--accent);
  border-radius: 1px;
  pointer-events: none;
  z-index: 1;
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -5
```

Expected: builds cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat(F1): add drop-target indicator CSS"
```

---

## Task 3 — F1: Drag Insertion Indicator (State)

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Add F1 tests to `src/App.test.tsx`**

Append after the F0 describe block:

```tsx
describe("F1 — Drag Insertion Indicator", () => {
  beforeEach(() => {
    localStorage.setItem(
      "edge-todos-state-v1",
      JSON.stringify({
        schemaVersion: 2,
        templates: [
          {
            id: "matrix",
            name: "四象限优先级",
            priorities: [
              { id: "p1", name: "🔥 高", order: 0 },
            ],
          },
        ],
        pages: [
          {
            id: "page-1",
            title: "待办事项",
            color: "#f8fafc",
            templateId: "matrix",
            todos: [
              {
                id: "todo-a",
                text: "任务 A",
                priorityId: "p1",
                completed: false,
                createdAt: 1,
                updatedAt: 1,
                sortIndex: 0,
                attachments: [],
              },
              {
                id: "todo-b",
                text: "任务 B",
                priorityId: "p1",
                completed: false,
                createdAt: 2,
                updatedAt: 2,
                sortIndex: 1,
                attachments: [],
              },
            ],
          },
        ],
        activePageId: "page-1",
        windowPrefs: { edge: null, hidden: false },
      })
    );
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("applies is-drop-target class to the hovered todo during drag", () => {
    render(<App />);
    const todoB = screen.getByText("任务 B").closest("article");
    expect(todoB).not.toHaveClass("is-drop-target");

    fireEvent.dragOver(todoB!, {
      dataTransfer: { getData: () => "todo-a", dropEffect: "move" },
    });

    expect(todoB).toHaveClass("is-drop-target");
  });

  it("removes is-drop-target class after dragEnd", () => {
    render(<App />);
    const todoB = screen.getByText("任务 B").closest("article")!;

    fireEvent.dragOver(todoB, {
      dataTransfer: { getData: () => "todo-a", dropEffect: "move" },
    });
    expect(todoB).toHaveClass("is-drop-target");

    fireEvent.dragEnd(todoB);
    expect(todoB).not.toHaveClass("is-drop-target");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "F1"
```

Expected: F1 tests fail (class not applied yet).

- [ ] **Step 3: Add `dragOverTodoId` state and pass to PriorityGroup in `src/App.tsx`**

After the `draggingTodoId` state (around line 57), add:

```tsx
const [dragOverTodoId, setDragOverTodoId] = useState<string | null>(null);
```

In the `<PriorityGroup>` JSX (around line 507), add two new props:

```tsx
<PriorityGroup
  key={priority.id}
  priority={priority}
  todos={sortTodos(activePage.todos.filter((todo) => todo.priorityId === priority.id))}
  onToggle={toggleTodo}
  onDelete={deleteTodo}
  onTextChange={updateTodoText}
  onPreview={(todoId, attachmentId) => setPreviewImage({ todoId, attachmentId })}
  onAdd={addTodo}
  onMoveBefore={moveTodoBefore}
  onMoveToGroupEnd={moveTodoToGroupEnd}
  draggingTodoId={draggingTodoId}
  onDraggingTodoChange={setDraggingTodoId}
  dragOverTodoId={dragOverTodoId}
  onDragOverTodoChange={setDragOverTodoId}
/>
```

- [ ] **Step 4: Update `PriorityGroup` props interface and usage in `src/App.tsx`**

In the `PriorityGroup` function signature (around line 620), add to the destructured props and type:

```tsx
function PriorityGroup({
  priority,
  todos,
  onToggle,
  onDelete,
  onTextChange,
  onPreview,
  onAdd,
  onMoveBefore,
  onMoveToGroupEnd,
  draggingTodoId,
  onDraggingTodoChange,
  dragOverTodoId,
  onDragOverTodoChange,
}: {
  priority: Priority;
  todos: Todo[];
  onToggle: (todoId: string) => void;
  onDelete: (todoId: string) => void;
  onTextChange: (todoId: string, text: string) => void;
  onPreview: (todoId: string, attachmentId: string) => void;
  onAdd: (priorityId: string, text: string, attachments?: ImageAttachment[]) => void;
  onMoveBefore: (todoId: string, beforeTodoId: string | null) => void;
  onMoveToGroupEnd: (todoId: string, priorityId: string) => void;
  draggingTodoId: string | null;
  onDraggingTodoChange: (todoId: string | null) => void;
  dragOverTodoId: string | null;
  onDragOverTodoChange: (todoId: string | null) => void;
}) {
```

In the `<article>` className for each todo (around line 734), add `is-drop-target`:

```tsx
className={`todo-item ${todo.completed ? "is-completed" : ""} ${
  draggingTodoId === todo.id ? "is-dragging" : ""
} ${dragOverTodoId === todo.id ? "is-drop-target" : ""}`}
```

In the todo `onDragOver` handler, add `onDragOverTodoChange(todo.id)`:

```tsx
onDragOver={(event) => {
  const draggedId = event.dataTransfer.getData("text/plain") || draggingTodoId;
  if (!draggedId || draggedId === todo.id) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  onDragOverTodoChange(todo.id);
}}
```

In the todo `onDrop` handler, add `onDragOverTodoChange(null)`:

```tsx
onDrop={(event) => {
  event.preventDefault();
  event.stopPropagation();
  const draggedId = event.dataTransfer.getData("text/plain") || draggingTodoId;
  if (!draggedId || draggedId === todo.id) return;
  onMoveBefore(draggedId, todo.id);
  onDraggingTodoChange(null);
  onDragOverTodoChange(null);
}}
```

In the todo `onDragEnd` handler, add `onDragOverTodoChange(null)`:

```tsx
onDragEnd={() => {
  onDraggingTodoChange(null);
  onDragOverTodoChange(null);
}}
```

In the `group-items` div `onDragOver`, add `onDragOverTodoChange(null)` to clear specific-todo targeting when over empty group space:

```tsx
onDragOver={(event) => {
  const draggedId = event.dataTransfer.getData("text/plain") || draggingTodoId;
  if (!draggedId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  onDragOverTodoChange(null);
}}
```

In the `group-items` div `onDrop`, add `onDragOverTodoChange(null)`:

```tsx
onDrop={(event) => {
  event.preventDefault();
  const draggedId = event.dataTransfer.getData("text/plain") || draggingTodoId;
  if (!draggedId) return;
  onMoveToGroupEnd(draggedId, priority.id);
  onDraggingTodoChange(null);
  onDragOverTodoChange(null);
}}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "F1"
```

Expected: both F1 tests pass.

- [ ] **Step 6: Verify build**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(F1): show drop-target indicator line during todo drag"
```

---

## Task 4 — F2: Group Collapse/Expand

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Add F2 tests to `src/App.test.tsx`**

Append after the F1 describe block:

```tsx
describe("F2 — Group Collapse/Expand", () => {
  beforeEach(() => {
    localStorage.setItem(
      "edge-todos-state-v1",
      JSON.stringify({
        schemaVersion: 2,
        templates: [
          {
            id: "matrix",
            name: "四象限优先级",
            priorities: [{ id: "p1", name: "🔥 高", order: 0 }],
          },
        ],
        pages: [
          {
            id: "page-1",
            title: "待办事项",
            color: "#f8fafc",
            templateId: "matrix",
            todos: [
              {
                id: "todo-a",
                text: "任务 A",
                priorityId: "p1",
                completed: false,
                createdAt: 1,
                updatedAt: 1,
                sortIndex: 0,
                attachments: [],
              },
            ],
          },
        ],
        activePageId: "page-1",
        windowPrefs: { edge: null, hidden: false },
      })
    );
  });

  afterEach(() => { localStorage.clear(); });

  it("collapses group items when collapse button is clicked", () => {
    render(<App />);
    expect(screen.getByText("任务 A")).toBeInTheDocument();

    const collapseBtn = screen.getByTitle("折叠分组");
    fireEvent.click(collapseBtn);

    expect(screen.queryByText("任务 A")).not.toBeVisible();
  });

  it("expands group again when expand button is clicked", () => {
    render(<App />);
    const collapseBtn = screen.getByTitle("折叠分组");
    fireEvent.click(collapseBtn);

    const expandBtn = screen.getByTitle("展开分组");
    fireEvent.click(expandBtn);

    expect(screen.getByText("任务 A")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "F2"
```

Expected: F2 tests fail (button not found).

- [ ] **Step 3: Add collapse state and button to `PriorityGroup` in `src/App.tsx`**

Inside the `PriorityGroup` function body, after the existing state declarations (after `draftInputRef`), add:

```tsx
const [collapsed, setCollapsed] = useState(false);
```

Replace the group-heading div (around line 679):

```tsx
<div className="group-heading">
  <span>{priority.name}</span>
  <span className="count">{todos.length}</span>
  <button className="group-add-button" onClick={openComposer} title="在此分组添加事项">
    <Plus size={16} />
  </button>
  <button
    className="icon-button"
    onClick={() => setCollapsed((c) => !c)}
    title={collapsed ? "展开分组" : "折叠分组"}
  >
    {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
  </button>
</div>
```

Wrap the composer in a conditional:

```tsx
{!collapsed && composerOpen && (
  <div className="group-composer" onPaste={handlePaste}>
    {/* ... existing composer content unchanged ... */}
  </div>
)}
```

Add `className` and auto-expand on drag to the `group-items` div:

```tsx
<div
  className={`group-items${collapsed ? " is-collapsed" : ""}`}
  onDragOver={(event) => {
    const draggedId = event.dataTransfer.getData("text/plain") || draggingTodoId;
    if (!draggedId) return;
    if (collapsed) {
      setCollapsed(false);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    onDragOverTodoChange(null);
  }}
  onDrop={(event) => {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData("text/plain") || draggingTodoId;
    if (!draggedId) return;
    onMoveToGroupEnd(draggedId, priority.id);
    onDraggingTodoChange(null);
    onDragOverTodoChange(null);
  }}
>
```

- [ ] **Step 4: Add collapsed CSS to `src/styles.css`**

Append before the `@media` block:

```css
.group-items.is-collapsed {
  display: none;
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "F2"
```

Expected: both F2 tests pass.

- [ ] **Step 6: Verify build**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/styles.css src/App.test.tsx
git commit -m "feat(F2): add priority group collapse/expand toggle"
```

---

## Task 5 — F3: Keyboard Shortcuts

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Behavior:** `Ctrl+Enter` (Win) / `⌘+Enter` (Mac) opens the first group's composer. `Ctrl+1`–`Ctrl+N` opens the Nth group. No-op when an input is focused.

- [ ] **Step 1: Add F3 tests to `src/App.test.tsx`**

Append after the F2 describe block:

```tsx
describe("F3 — Keyboard Shortcuts", () => {
  beforeEach(() => {
    localStorage.setItem(
      "edge-todos-state-v1",
      JSON.stringify({
        schemaVersion: 2,
        templates: [
          {
            id: "matrix",
            name: "四象限优先级",
            priorities: [
              { id: "p1", name: "🔥 高", order: 0 },
              { id: "p2", name: "⭐ 中", order: 1 },
            ],
          },
        ],
        pages: [
          {
            id: "page-1",
            title: "待办事项",
            color: "#f8fafc",
            templateId: "matrix",
            todos: [],
          },
        ],
        activePageId: "page-1",
        windowPrefs: { edge: null, hidden: false },
      })
    );
  });

  afterEach(() => { localStorage.clear(); });

  it("opens first group composer on Ctrl+Enter", () => {
    render(<App />);
    // No composer visible initially
    expect(screen.queryByPlaceholderText(/添加到/)).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });

    expect(screen.getByPlaceholderText("添加到🔥 高")).toBeInTheDocument();
  });

  it("opens second group composer on Ctrl+2", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "2", ctrlKey: true });

    expect(screen.getByPlaceholderText("添加到⭐ 中")).toBeInTheDocument();
  });

  it("does not trigger when an input is focused", () => {
    render(<App />);
    // Open first group to get an input focused
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    const input = screen.getByPlaceholderText("添加到🔥 高");
    input.focus();

    // Now try opening second group — should be no-op
    fireEvent.keyDown(window, { key: "2", ctrlKey: true });
    expect(screen.queryByPlaceholderText("添加到⭐ 中")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "F3"
```

Expected: F3 tests fail (no keyboard handler yet).

- [ ] **Step 3: Add opener registration infrastructure to `App` in `src/App.tsx`**

After the `autoHideTimerRef` ref, add:

```tsx
const groupOpenerRef = useRef<Map<string, () => void>>(new Map());

const registerGroupOpener = useCallback((priorityId: string, fn: () => void) => {
  groupOpenerRef.current.set(priorityId, fn);
}, []);

const unregisterGroupOpener = useCallback((priorityId: string) => {
  groupOpenerRef.current.delete(priorityId);
}, []);
```

Add the global keydown handler as a `useEffect` after the existing `useEffect` blocks:

```tsx
useEffect(() => {
  function handleKeyDown(event: KeyboardEvent) {
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement
    ) {
      return;
    }
    const isMac = navigator.userAgent.includes("Mac");
    const modKey = isMac ? event.metaKey : event.ctrlKey;
    if (!modKey) return;

    if (event.key === "Enter") {
      event.preventDefault();
      const first = activePriorities[0];
      if (first) groupOpenerRef.current.get(first.id)?.();
      return;
    }
    const digit = parseInt(event.key, 10);
    if (digit >= 1 && digit <= 9) {
      const priority = activePriorities[digit - 1];
      if (priority) {
        event.preventDefault();
        groupOpenerRef.current.get(priority.id)?.();
      }
    }
  }

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [activePriorities]);
```

Pass the registration props to `PriorityGroup`:

```tsx
<PriorityGroup
  key={priority.id}
  priority={priority}
  todos={sortTodos(activePage.todos.filter((todo) => todo.priorityId === priority.id))}
  onToggle={toggleTodo}
  onDelete={deleteTodo}
  onTextChange={updateTodoText}
  onPreview={(todoId, attachmentId) => setPreviewImage({ todoId, attachmentId })}
  onAdd={addTodo}
  onMoveBefore={moveTodoBefore}
  onMoveToGroupEnd={moveTodoToGroupEnd}
  draggingTodoId={draggingTodoId}
  onDraggingTodoChange={setDraggingTodoId}
  dragOverTodoId={dragOverTodoId}
  onDragOverTodoChange={setDragOverTodoId}
  onRegisterOpener={registerGroupOpener}
  onUnregisterOpener={unregisterGroupOpener}
/>
```

- [ ] **Step 4: Update `PriorityGroup` to register its opener in `src/App.tsx`**

Add `onRegisterOpener` and `onUnregisterOpener` to the `PriorityGroup` props interface:

```tsx
function PriorityGroup({
  priority,
  todos,
  onToggle,
  onDelete,
  onTextChange,
  onPreview,
  onAdd,
  onMoveBefore,
  onMoveToGroupEnd,
  draggingTodoId,
  onDraggingTodoChange,
  dragOverTodoId,
  onDragOverTodoChange,
  onRegisterOpener,
  onUnregisterOpener,
}: {
  priority: Priority;
  todos: Todo[];
  onToggle: (todoId: string) => void;
  onDelete: (todoId: string) => void;
  onTextChange: (todoId: string, text: string) => void;
  onPreview: (todoId: string, attachmentId: string) => void;
  onAdd: (priorityId: string, text: string, attachments?: ImageAttachment[]) => void;
  onMoveBefore: (todoId: string, beforeTodoId: string | null) => void;
  onMoveToGroupEnd: (todoId: string, priorityId: string) => void;
  draggingTodoId: string | null;
  onDraggingTodoChange: (todoId: string | null) => void;
  dragOverTodoId: string | null;
  onDragOverTodoChange: (todoId: string | null) => void;
  onRegisterOpener: (priorityId: string, fn: () => void) => void;
  onUnregisterOpener: (priorityId: string) => void;
}) {
```

Wrap `openComposer` in `useCallback` inside the `PriorityGroup` function body:

```tsx
const openComposer = useCallback(() => {
  setComposerOpen(true);
  window.setTimeout(() => draftInputRef.current?.focus(), 0);
}, []);
```

Add registration `useEffect` inside `PriorityGroup`, after the `openComposer` declaration:

```tsx
useEffect(() => {
  onRegisterOpener(priority.id, openComposer);
  return () => onUnregisterOpener(priority.id);
}, [priority.id, openComposer, onRegisterOpener, onUnregisterOpener]);
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "F3"
```

Expected: all 3 F3 tests pass.

- [ ] **Step 6: Verify full test suite and build**

```bash
npm test -- --reporter=verbose && npm run build 2>&1 | tail -5
```

Expected: all tests pass, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(F3): keyboard shortcuts Ctrl+Enter / Ctrl+N to open group composer"
```

---

## Task 6 — F7: Version Injection

**Files:**
- Modify: `vite.config.ts`
- Modify: `src/vite-env.d.ts`

- [ ] **Step 1: Update `vite.config.ts` to inject package version**

Replace the entire file content:

```ts
/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { version } = require("./package.json") as { version: string };

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2020",
    minify: "esbuild",
    sourcemap: true,
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(version),
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
```

- [ ] **Step 2: Add type declaration to `src/vite-env.d.ts`**

The file currently contains only `/// <reference types="vite/client" />`. Add the env interface below it:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | tail -5
```

Expected: builds cleanly.

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts src/vite-env.d.ts
git commit -m "feat(F7): inject package version via Vite define"
```

---

## Task 7 — F7: About Dialog

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Add F7 tests to `src/App.test.tsx`**

Add to import at top of file:

```tsx
import { Info } from "lucide-react"; // only for type-checking — not directly used in tests
```

Append after the F3 describe block:

```tsx
describe("F7 — About Dialog", () => {
  beforeEach(() => {
    localStorage.setItem(
      "edge-todos-state-v1",
      JSON.stringify({
        schemaVersion: 2,
        templates: [
          {
            id: "matrix",
            name: "四象限优先级",
            priorities: [{ id: "p1", name: "🔥 高", order: 0 }],
          },
        ],
        pages: [
          {
            id: "page-1",
            title: "待办事项",
            color: "#f8fafc",
            templateId: "matrix",
            todos: [],
          },
        ],
        activePageId: "page-1",
        windowPrefs: { edge: null, hidden: false },
      })
    );
  });

  afterEach(() => { localStorage.clear(); });

  it("opens about dialog when Info button is clicked", () => {
    render(<App />);
    expect(screen.queryByText("Edge Todos")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle("关于"));

    expect(screen.getByText("Edge Todos")).toBeInTheDocument();
    expect(screen.getByText(/版本/)).toBeInTheDocument();
  });

  it("closes about dialog when backdrop is clicked", () => {
    render(<App />);
    fireEvent.click(screen.getByTitle("关于"));
    expect(screen.getByText("Edge Todos")).toBeInTheDocument();

    // Click the backdrop (the confirm-backdrop div)
    fireEvent.click(screen.getByTestId("about-backdrop"));

    expect(screen.queryByText("Edge Todos")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "F7"
```

Expected: F7 tests fail (About button and dialog don't exist yet).

- [ ] **Step 3: Add `Info` to imports and `aboutOpen` state in `src/App.tsx`**

In the lucide-react import (around line 8), add `Info`:

```tsx
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ImagePlus,
  Import,
  Info,
  List,
  MoveDown,
  MoveUp,
  Plus,
  Save,
  Settings,
  Trash2,
  X,
} from "lucide-react";
```

After the `confirmDialog` state (around line 54), add:

```tsx
const [aboutOpen, setAboutOpen] = useState(false);
```

- [ ] **Step 4: Add About button to titlebar in `src/App.tsx`**

In the `title-actions` div (around line 491), add the Info button before the List button:

```tsx
<div className="title-actions">
  {hasTauriWindow && state.windowPrefs.edge && (
    <button className="icon-button" onClick={handleHide} title="贴边隐藏">
      {state.windowPrefs.hidden ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
    </button>
  )}
  <button className="icon-button" onClick={() => setAboutOpen(true)} title="关于">
    <Info size={18} />
  </button>
  <button className="icon-button" onClick={() => setPageManagerOpen(true)} title="页签管理">
    <List size={18} />
  </button>
  <button className="icon-button" onClick={() => setSettingsOpen(true)} title="设置">
    <Settings size={18} />
  </button>
</div>
```

- [ ] **Step 5: Add `AboutDialog` component and render it in `src/App.tsx`**

Add the `AboutDialog` component before `export default App`:

```tsx
function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="confirm-backdrop"
      data-testid="about-backdrop"
      onClick={onClose}
    >
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Edge Todos</h3>
        <p>版本 {import.meta.env.VITE_APP_VERSION}</p>
        <p>轻量跨平台桌面待办小工具，支持优先级分组、图片附件和贴边隐藏。</p>
        <p style={{ fontSize: "11.5px", color: "#94a3b8" }}>MIT 许可证开源</p>
        <div className="confirm-actions">
          <button onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
```

Render `AboutDialog` inside the `App` return, after the `ConfirmDialog` block:

```tsx
{aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
```

- [ ] **Step 6: Run all tests — expect PASS**

```bash
npm test -- --reporter=verbose
```

Expected: all F0–F7 tests pass.

- [ ] **Step 7: Verify build**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ built in` — no errors.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(F7): add About dialog with version number and Info button"
```

---

## Final Verification

- [ ] **Run full test suite**

```bash
npm test -- --reporter=verbose
```

Expected: all tests pass with 0 failures.

- [ ] **Run build + audit**

```bash
npm run build && npm audit --audit-level=moderate
```

Expected: build succeeds, 0 vulnerabilities.
