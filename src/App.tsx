import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGemoji from "remark-gemoji";
import remarkGfm from "remark-gfm";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  GripHorizontal,
  ImagePlus,
  Import,
  Info,
  List,
  MoveDown,
  MoveUp,
  Pin,
  Plus,
  Save,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { BUILT_IN_TEMPLATES, DEFAULT_PAGE_COLOR } from "./defaults";
import { fileToAttachment, isImageFile } from "./image";
import { closeWindow, detectDockedEdge, getCurrentTauriWindow, isCursorInRevealStrip, isTauri, onWindowMoved, setWindowAlwaysOnTop, setWindowHidden, startWindowDragging } from "./tauriWindow";
import { loadState, normalizeState, saveState } from "./storage";
import type { AppState, ImageAttachment, Priority, PriorityTemplate, Todo, TodoPage } from "./types";

const EMPTY_TEXT = "";
const DEFAULT_PAGE_TITLE = "待办事项";
const PAGE_COLORS = ["#f8fafc", "#f1f5f9", "#eef2ff", "#f0f9ff", "#ecfeff", "#f0fdf4", "#f7fee7", "#fff7ed", "#fdf2f8"];
const AUTO_HIDE_DELAY_MS = 1500;

type TemplateSettingsDraft = {
  templates: PriorityTemplate[];
  selectedTemplateId: string;
};

type ImagePreview = {
  todoId: string;
  attachmentId: string;
};

type ConfirmDialogState = {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
} | null;

function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pageManagerOpen, setPageManagerOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<ImagePreview | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const autoHideTimerRef = useRef<number | undefined>(undefined);
  const groupOpenerRef = useRef<Map<string, () => void>>(new Map());

  const registerGroupOpener = useCallback((priorityId: string, fn: () => void) => {
    groupOpenerRef.current.set(priorityId, fn);
  }, []);

  const unregisterGroupOpener = useCallback((priorityId: string) => {
    groupOpenerRef.current.delete(priorityId);
  }, []);

  const [hasTauriWindow, setHasTauriWindow] = useState(false);
  const [pinnedOnTop, setPinnedOnTop] = useState(true); // mirrors alwaysOnTop from tauri.conf.json
  const [draggingTodoId, setDraggingTodoId] = useState<string | null>(null);
  const [dragOverTodoId, setDragOverTodoId] = useState<string | null>(null);

  const activePage = useMemo(
    () => state.pages.find((page) => page.id === state.activePageId) ?? state.pages[0],
    [state.activePageId, state.pages],
  );

  const activeTemplate = useMemo(
    () => state.templates.find((template) => template.id === activePage.templateId) ?? state.templates[0],
    [activePage.templateId, state.templates],
  );

  const activePriorities = useMemo(
    () => [...activeTemplate.priorities].sort((a, b) => a.order - b.order),
    [activeTemplate.priorities],
  );

  const previewContext = useMemo(() => {
    if (!previewImage) return null;
    const todo = activePage.todos.find((item) => item.id === previewImage.todoId);
    const attachmentIndex = todo?.attachments.findIndex((attachment) => attachment.id === previewImage.attachmentId) ?? -1;
    const attachment = attachmentIndex >= 0 ? todo?.attachments[attachmentIndex] ?? null : null;
    return todo && attachment ? { todo, attachment, attachmentIndex } : null;
  }, [activePage.todos, previewImage]);

  function saveTemplateSettings(draft: TemplateSettingsDraft) {
    setState((current) => ({
      ...current,
      templates: draft.templates,
    }));
    setSettingsOpen(false);
  }

  function applyTemplateSettings(draft: TemplateSettingsDraft) {
    setState((current) => {
      const nextTemplate = draft.templates.find((template) => template.id === draft.selectedTemplateId) ?? draft.templates[0];
      if (!nextTemplate) return current;

      const fallbackPriority = getFirstPriority(nextTemplate);
      const currentPage = getActivePage(current);
      const templateChanged = nextTemplate.id !== currentPage.templateId;
      const validPriorityIds = new Set(nextTemplate.priorities.map((priority) => priority.id));
      const now = Date.now();

      return {
        ...current,
        templates: draft.templates,
        pages: current.pages.map((page) => {
          if (page.id !== currentPage.id) return page;
          return {
            ...page,
            templateId: nextTemplate.id,
            todos: fallbackPriority
              ? page.todos.map((todo) => {
                  if (templateChanged) {
                    return { ...todo, priorityId: fallbackPriority.id, updatedAt: now };
                  }
                  return validPriorityIds.has(todo.priorityId)
                    ? todo
                    : { ...todo, priorityId: fallbackPriority.id, updatedAt: now };
                })
              : page.todos,
          };
        }),
      };
    });
    setSettingsOpen(false);
  }

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    getCurrentTauriWindow().then((window) => setHasTauriWindow(Boolean(window)));
  }, []);

  useEffect(() => {
    if (!hasTauriWindow) return;
    let timer: number | undefined;
    let unlistenMoved: (() => void) | undefined;

    const detect = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        const edge = await detectDockedEdge();
        if (edge) {
          setState((current) => ({
            ...current,
            windowPrefs: { edge, hidden: false },
          }));
        }
      }, 260);
    };

    window.addEventListener("mouseup", detect);
    window.addEventListener("resize", detect);
    // onMoved catches moves where mouseup fires outside the WebView (e.g. releasing on OS taskbar)
    onWindowMoved(detect).then((unlisten) => { unlistenMoved = unlisten; });

    return () => {
      window.removeEventListener("mouseup", detect);
      window.removeEventListener("resize", detect);
      window.clearTimeout(timer);
      unlistenMoved?.();
    };
  }, [hasTauriWindow]);

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

  useEffect(() => {
    if (!hasTauriWindow || !state.windowPrefs.hidden || !state.windowPrefs.edge) return;
    let cancelled = false;

    async function revealIfCursorIsInStrip() {
      try {
        if (!state.windowPrefs.edge || !(await isCursorInRevealStrip(state.windowPrefs.edge))) return;
        if (!cancelled) await handleReveal();
      } catch {
        // Mouse polling is a best-effort fallback for offscreen windows.
      }
    }

    const interval = window.setInterval(revealIfCursorIsInStrip, 120);
    revealIfCursorIsInStrip();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [hasTauriWindow, state.windowPrefs.hidden, state.windowPrefs.edge]);

  function addTodo(priorityId: string, textValue: string, attachments: ImageAttachment[] = []) {
    const text = textValue.trim();
    if (!text && attachments.length === 0) return;

    const now = Date.now();
    if (!priorityId) return;

    setState((current) => updateActivePage(current, (page) => ({
      ...page,
      todos: [
        ...page.todos,
        {
          id: crypto.randomUUID(),
          text: text || "图片待办",
          priorityId,
          completed: false,
          createdAt: now,
          updatedAt: now,
          sortIndex: now,
          attachments,
        },
      ],
    })));
  }

  function toggleTodo(todoId: string) {
    setState((current) => {
      const now = Date.now();
      return updateActivePage(current, (page) => ({
        ...page,
        todos: page.todos.map((todo) =>
          todo.id === todoId
            ? {
                ...todo,
                completed: !todo.completed,
                updatedAt: now,
              }
            : todo,
        ),
      }));
    });
  }

  function deleteTodo(todoId: string) {
    setState((current) => updateActivePage(current, (page) => ({
      ...page,
      todos: page.todos.filter((todo) => todo.id !== todoId),
    })));
  }

  function deleteAttachment(todoId: string, attachmentId: string) {
    setState((current) => updateActivePage(current, (page) => ({
      ...page,
      todos: page.todos.map((todo) =>
        todo.id === todoId
          ? {
              ...todo,
              attachments: todo.attachments.filter((attachment) => attachment.id !== attachmentId),
              updatedAt: Date.now(),
            }
          : todo,
      ),
    })));
    setPreviewImage(null);
  }

  function updateTodoText(todoId: string, text: string) {
    setState((current) => updateActivePage(current, (page) => ({
      ...page,
      todos: page.todos.map((todo) =>
        todo.id === todoId ? { ...todo, text, updatedAt: Date.now() } : todo,
      ),
    })));
  }

  function moveTodoBefore(todoId: string, beforeTodoId: string | null) {
    setState((current) => {
      const active = getActivePage(current);
      const target = active.todos.find((todo) => todo.id === todoId);
      if (!target) return current;
      const beforeTodo = beforeTodoId ? active.todos.find((todo) => todo.id === beforeTodoId) : null;
      const nextPriorityId = beforeTodo?.priorityId ?? target.priorityId;
      const ordered = sortTodos(active.todos.filter((todo) => todo.priorityId === nextPriorityId)).filter(
        (todo) => todo.id !== todoId,
      );

      const beforeIndex = beforeTodoId ? ordered.findIndex((todo) => todo.id === beforeTodoId) : -1;
      const insertIndex = beforeIndex >= 0 ? beforeIndex : ordered.length;
      ordered.splice(insertIndex, 0, { ...target, priorityId: nextPriorityId });

      const now = Date.now();
      const reordered = new Map(ordered.map((todo, index) => [todo.id, index]));

      return updateActivePage(current, (page) => ({
        ...page,
        todos: page.todos.map((todo) => {
          if (todo.id === target.id) {
            return {
              ...todo,
              priorityId: nextPriorityId,
              sortIndex: reordered.get(todo.id) ?? todo.sortIndex,
              updatedAt: now,
            };
          }
          return reordered.has(todo.id)
            ? { ...todo, sortIndex: reordered.get(todo.id)!, updatedAt: now }
            : todo;
        }),
      }));
    });
  }

  function moveTodoToGroupEnd(todoId: string, priorityId: string) {
    setState((current) => {
      const active = getActivePage(current);
      const target = active.todos.find((todo) => todo.id === todoId);
      if (!target) return current;

      const ordered = sortTodos(active.todos.filter((todo) => todo.priorityId === priorityId)).filter(
        (todo) => todo.id !== todoId,
      );
      ordered.push({ ...target, priorityId });

      const now = Date.now();
      const reordered = new Map(ordered.map((todo, index) => [todo.id, index]));

      return updateActivePage(current, (page) => ({
        ...page,
        todos: page.todos.map((todo) => {
          if (todo.id === target.id) {
            return {
              ...todo,
              priorityId,
              sortIndex: reordered.get(todo.id) ?? todo.sortIndex,
              updatedAt: now,
            };
          }
          return reordered.has(todo.id)
            ? { ...todo, sortIndex: reordered.get(todo.id)!, updatedAt: now }
            : todo;
        }),
      }));
    });
  }

  function addPage() {
    const id = crypto.randomUUID();
    const fallbackTemplateId = activePage?.templateId || state.templates[0]?.id || "matrix";
    setState((current) => ({
      ...current,
      activePageId: id,
      pages: [...current.pages, createEmptyPage(id, fallbackTemplateId)],
    }));
  }

  function closePage(pageId: string) {
    deletePages([pageId]);
  }

  function requestClosePage(pageId: string) {
    const page = state.pages.find((item) => item.id === pageId);
    if (!page || state.pages.length <= 1) return;
    setConfirmDialog({
      title: "删除页签",
      message: `确定删除“${page.title || DEFAULT_PAGE_TITLE}”吗？该页签中的事项也会被删除。`,
      confirmLabel: "删除",
      onConfirm: () => closePage(pageId),
    });
  }

  function deletePages(pageIds: string[]) {
    const deleteIds = new Set(pageIds);
    setState((current) => {
      if (deleteIds.size === 0) return current;

      const nextPages = current.pages.filter((page) => !deleteIds.has(page.id));
      if (!nextPages.length) {
        const id = crypto.randomUUID();
        return {
          ...current,
          activePageId: id,
          pages: [createEmptyPage(id, current.pages[0]?.templateId || current.templates[0]?.id || "matrix")],
        };
      }

      const nextActivePageId = deleteIds.has(current.activePageId)
        ? nextPages[Math.min(current.pages.findIndex((page) => page.id === current.activePageId), nextPages.length - 1)]
            ?.id ?? nextPages[0].id
        : current.activePageId;

      return {
        ...current,
        pages: nextPages,
        activePageId: nextActivePageId,
      };
    });
  }

  function updatePageTitle(pageId: string, title: string) {
    setState((current) => ({
      ...current,
      pages: current.pages.map((page) =>
        page.id === pageId ? { ...page, title } : page,
      ),
    }));
  }

  function updatePageColor(pageId: string, color: string) {
    setState((current) => ({
      ...current,
      pages: current.pages.map((page) => (page.id === pageId ? { ...page, color } : page)),
    }));
  }

  function reorderPages(pageId: string, beforePageId: string | null) {
    if (beforePageId && pageId === beforePageId) return;
    setState((current) => {
      const target = current.pages.find((page) => page.id === pageId);
      if (!target) return current;

      const ordered = current.pages.filter((page) => page.id !== pageId);
      const beforeIndex = beforePageId ? ordered.findIndex((page) => page.id === beforePageId) : -1;
      ordered.splice(beforeIndex >= 0 ? beforeIndex : ordered.length, 0, target);

      return {
        ...current,
        pages: ordered,
      };
    });
  }

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

  function movePreview(offset: -1 | 1) {
    if (!previewContext) return;
    const attachments = previewContext.todo.attachments;
    const nextIndex = (previewContext.attachmentIndex + offset + attachments.length) % attachments.length;
    const nextAttachment = attachments[nextIndex];
    if (!nextAttachment) return;
    setPreviewImage({
      todoId: previewContext.todo.id,
      attachmentId: nextAttachment.id,
    });
  }

  async function handleHide() {
    const edge = state.windowPrefs.edge ?? (await detectDockedEdge());
    if (!edge) return;
    await setWindowHidden(edge, true);
    setState((current) => ({
      ...current,
      windowPrefs: { edge, hidden: true },
    }));
  }

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

  function handleMouseLeave() {
    if (!hasTauriWindow || !state.windowPrefs.edge) return;
    autoHideTimerRef.current = window.setTimeout(() => {
      handleHide();
    }, AUTO_HIDE_DELAY_MS);
  }

  async function handleTitlebarMouseDown(e: React.MouseEvent<HTMLElement>) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, a, select, textarea, [draggable="true"]')) return;
    e.preventDefault(); // prevent text selection flash during window drag on Windows/WebView2
    await startWindowDragging();
  }

  async function handleClose() {
    await closeWindow();
  }

  async function handleTogglePin() {
    const next = !pinnedOnTop;
    setPinnedOnTop(next);
    await setWindowAlwaysOnTop(next);
  }

  return (
    <main
      className="app-shell"
      style={{ backgroundColor: activePage.color }}
      onMouseEnter={handleReveal}
      onMouseLeave={handleMouseLeave}
    >
      <header className="titlebar" data-tauri-drag-region onMouseDown={handleTitlebarMouseDown}>
        <PageTabs
          pages={state.pages}
          activePageId={state.activePageId}
          canClose={state.pages.length > 1}
          onSelect={(pageId) => setState((current) => ({ ...current, activePageId: pageId }))}
          onAdd={addPage}
          onClose={requestClosePage}
          onTitleChange={updatePageTitle}
          onColorChange={updatePageColor}
          onReorder={reorderPages}
        />
        {/* Dedicated drag zone — always unobstructed by tabs/buttons, works on Windows/WebView2 */}
        <div className="titlebar-drag-zone" data-tauri-drag-region>
          <GripHorizontal size={13} />
        </div>
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
          {hasTauriWindow && (
            <div className="win-controls">
              <button
                className={`win-btn${pinnedOnTop ? " is-active" : ""}`}
                onClick={handleTogglePin}
                title={pinnedOnTop ? "取消置顶" : "置顶窗口"}
              >
                <Pin size={13} />
              </button>
              <button className="win-btn win-btn-close" onClick={handleClose} title="关闭">
                <X size={13} />
              </button>
            </div>
          )}
        </div>
      </header>

      <section className="todo-list">
        {activePriorities.map((priority) => (
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
        ))}
      </section>

      {pageManagerOpen && (
        <PageManagerPanel
          pages={state.pages}
          activePageId={state.activePageId}
          onClose={() => setPageManagerOpen(false)}
          onSelect={(pageId) => setState((current) => ({ ...current, activePageId: pageId }))}
          onTitleChange={updatePageTitle}
          onColorChange={updatePageColor}
          onDelete={closePage}
          onDeleteMany={deletePages}
          onReorder={reorderPages}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          state={state}
          activePage={activePage}
          onClose={() => setSettingsOpen(false)}
          onSave={saveTemplateSettings}
          onApply={applyTemplateSettings}
          onExportAll={() => exportState("all")}
          onExportActive={() => exportState("active")}
          onImport={() => isTauri ? importState() : importInputRef.current?.click()}
        />
      )}

      {previewContext && (
        <div className="preview-backdrop" onClick={() => setPreviewImage(null)}>
          <div className="preview-panel" onClick={(event) => event.stopPropagation()}>
            <div className="preview-toolbar">
              <span>{previewContext.attachment.name}</span>
              {previewContext.todo.attachments.length > 1 && (
                <div className="preview-nav">
                  <button className="icon-button" onClick={() => movePreview(-1)} title="上一张">
                    <ChevronLeft size={16} />
                  </button>
                  <span>
                    {previewContext.attachmentIndex + 1}/{previewContext.todo.attachments.length}
                  </span>
                  <button className="icon-button" onClick={() => movePreview(1)} title="下一张">
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
              <button
                className="preview-delete-button"
                onClick={() =>
                  setConfirmDialog({
                    title: "删除图片",
                    message: "确定从这个事项中删除当前图片吗？",
                    confirmLabel: "删除",
                    onConfirm: () => deleteAttachment(previewContext.todo.id, previewContext.attachment.id),
                  })
                }
              >
                <Trash2 size={15} />
                删除
              </button>
              <button className="icon-button preview-close" onClick={() => setPreviewImage(null)} title="关闭">
                <X size={18} />
              </button>
            </div>
            <img src={previewContext.attachment.dataUrl} alt={previewContext.attachment.name} />
          </div>
        </div>
      )}

      {confirmDialog && (
        <ConfirmDialog
          dialog={confirmDialog}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={() => {
            const action = confirmDialog.onConfirm;
            setConfirmDialog(null);
            action();
          }}
        />
      )}

      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}

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
    </main>
  );
}

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
  const [draftText, setDraftText] = useState(EMPTY_TEXT);
  const [composerOpen, setComposerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const draftInputRef = useRef<HTMLInputElement | null>(null);

  const openComposer = useCallback(() => {
    setComposerOpen(true);
    window.setTimeout(() => draftInputRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    onRegisterOpener(priority.id, openComposer);
    return () => onUnregisterOpener(priority.id);
  }, [priority.id, openComposer, onRegisterOpener, onUnregisterOpener]);

  function submit(attachments: ImageAttachment[] = []) {
    const text = draftText.trim();
    if (!text && attachments.length === 0) return;
    onAdd(priority.id, text, attachments);
    setDraftText(EMPTY_TEXT);
    setComposerOpen(false);
  }

  async function handleFiles(files: FileList | File[]) {
    const imageFiles = Array.from(files).filter(isImageFile);
    if (!imageFiles.length) return;
    const attachments = await Promise.all(imageFiles.map(fileToAttachment));
    submit(attachments);
  }

  async function handlePaste(event: React.ClipboardEvent) {
    const files = Array.from(event.clipboardData.files).filter(isImageFile);
    if (!files.length) return;
    event.preventDefault();
    await handleFiles(files);
  }

  return (
    <div className="priority-group">
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
      {!collapsed && composerOpen && (
        <div className="group-composer" onPaste={handlePaste}>
          <input
            ref={draftInputRef}
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
            placeholder={`添加到${priority.name}`}
          />
          <button className="icon-button" onClick={() => fileInputRef.current?.click()} title="添加图片">
            <ImagePlus size={18} />
          </button>
          <button className="primary-button" onClick={() => submit()}>
            <Plus size={17} />
          </button>
          <input
            ref={fileInputRef}
            className="hidden-input"
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              if (event.target.files) handleFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
        </div>
      )}
      <div
        className={`group-items${collapsed ? " is-collapsed" : ""}`}
        style={collapsed ? { display: "none" } : undefined}
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
        {todos.map((todo) => (
          <article
            className={`todo-item ${todo.completed ? "is-completed" : ""} ${
              draggingTodoId === todo.id ? "is-dragging" : ""
            } ${dragOverTodoId === todo.id ? "is-drop-target" : ""}`}
            key={todo.id}
            draggable
            onDragStart={(event) => {
              onDraggingTodoChange(todo.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", todo.id);
            }}
            onDragEnd={() => {
              onDraggingTodoChange(null);
              onDragOverTodoChange(null);
            }}
            onDragOver={(event) => {
              const draggedId = (event.dataTransfer?.getData("text/plain") ?? "") || draggingTodoId;
              if (draggedId === todo.id) return;
              event.preventDefault();
              event.stopPropagation();
              if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
              onDragOverTodoChange(todo.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const draggedId = event.dataTransfer.getData("text/plain") || draggingTodoId;
              if (!draggedId || draggedId === todo.id) return;
              onMoveBefore(draggedId, todo.id);
              onDraggingTodoChange(null);
              onDragOverTodoChange(null);
            }}
          >
            <button
              className={`checkbox ${todo.completed ? "checked" : ""}`}
              onClick={() => onToggle(todo.id)}
              title={todo.completed ? "标记为未完成" : "标记为完成"}
            >
              {todo.completed && <Check size={14} />}
            </button>
            <div className="todo-content">
              <TodoText text={todo.text} onChange={(text) => onTextChange(todo.id, text)} />
            </div>
            {todo.attachments.length > 0 && (
              <div className="thumb-strip">
                {todo.attachments.slice(0, 3).map((attachment) => (
                  <button className="thumb" key={attachment.id} onClick={() => onPreview(todo.id, attachment.id)}>
                    <img src={attachment.dataUrl} alt={attachment.name} />
                  </button>
                ))}
                {todo.attachments.length > 3 && (
                  <button className="thumb thumb-more" onClick={() => onPreview(todo.id, todo.attachments[3].id)}>
                    +{todo.attachments.length - 3}
                  </button>
                )}
              </div>
            )}
            <div className="todo-actions">
              <button className="delete-button" onClick={() => onDelete(todo.id)} title="删除">
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
        {todos.length === 0 && <div className="empty-group">暂无事项</div>}
      </div>
    </div>
  );
}

function PageTabs({
  pages,
  activePageId,
  canClose,
  onSelect,
  onAdd,
  onClose,
  onTitleChange,
  onColorChange,
  onReorder,
}: {
  pages: TodoPage[];
  activePageId: string;
  canClose: boolean;
  onSelect: (pageId: string) => void;
  onAdd: () => void;
  onClose: (pageId: string) => void;
  onTitleChange: (pageId: string, title: string) => void;
  onColorChange: (pageId: string, color: string) => void;
  onReorder: (pageId: string, beforePageId: string | null) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [draggingPageId, setDraggingPageId] = useState<string | null>(null);

  useEffect(() => {
    const activeTab = scrollRef.current?.querySelector<HTMLElement>(".page-tab.is-active");
    activeTab?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activePageId, pages.length]);

  function handleWheel(event: React.WheelEvent<HTMLElement>) {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;
    event.preventDefault();
    scrollContainer.scrollLeft += delta;
  }

  return (
    <nav className="page-tabs" data-tauri-drag-region aria-label="页签" onWheel={handleWheel}>
      <div className="tab-scroll" ref={scrollRef}>
        {pages.map((page) => (
          <PageTab
            key={page.id}
            page={page}
            active={page.id === activePageId}
            canClose={canClose}
            onSelect={onSelect}
            onClose={onClose}
            onTitleChange={onTitleChange}
            onColorChange={onColorChange}
            draggingPageId={draggingPageId}
            onDraggingPageChange={setDraggingPageId}
            onReorder={onReorder}
          />
        ))}
        <div
          className="tab-drop-end"
          onDragOver={(event) => {
            if (!draggingPageId) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            event.preventDefault();
            const draggedId = draggingPageId || event.dataTransfer.getData("text/plain");
            if (draggedId) onReorder(draggedId, null);
            setDraggingPageId(null);
          }}
        />
      </div>
      <button className="tab-add-button" onClick={onAdd} title="新建页签">
        <Plus size={16} />
      </button>
    </nav>
  );
}

function PageTab({
  page,
  active,
  canClose,
  onSelect,
  onClose,
  onTitleChange,
  onColorChange,
  draggingPageId,
  onDraggingPageChange,
  onReorder,
}: {
  page: TodoPage;
  active: boolean;
  canClose: boolean;
  onSelect: (pageId: string) => void;
  onClose: (pageId: string) => void;
  onTitleChange: (pageId: string, title: string) => void;
  onColorChange: (pageId: string, color: string) => void;
  draggingPageId: string | null;
  onDraggingPageChange: (pageId: string | null) => void;
  onReorder: (pageId: string, beforePageId: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(page.title);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraftTitle(page.title);
  }, [page.title]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function saveTitle() {
    onTitleChange(page.id, draftTitle);
    setEditing(false);
  }

  return (
    <div
      className={`page-tab ${active ? "is-active" : ""} ${draggingPageId === page.id ? "is-dragging" : ""}`}
      style={{ backgroundColor: page.color }}
      onClick={() => onSelect(page.id)}
      draggable={!editing}
      onDragStart={(event) => {
        if (editing) return;
        onDraggingPageChange(page.id);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", page.id);
      }}
      onDragEnd={() => onDraggingPageChange(null)}
      onDragOver={(event) => {
        const draggedId = draggingPageId || event.dataTransfer.getData("text/plain");
        if (!draggedId || draggedId === page.id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        const draggedId = draggingPageId || event.dataTransfer.getData("text/plain");
        if (draggedId && draggedId !== page.id) onReorder(draggedId, page.id);
        onDraggingPageChange(null);
      }}
    >
      <ColorPicker page={page} onColorChange={onColorChange} />
      {editing ? (
        <input
          ref={inputRef}
          className="tab-title-input"
          value={draftTitle}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={saveTitle}
          onKeyDown={(event) => {
            if (event.key === "Enter") saveTitle();
            if (event.key === "Escape") {
              setDraftTitle(page.title);
              setEditing(false);
            }
          }}
          aria-label="页签标题"
        />
      ) : (
        <button className="tab-title" onDoubleClick={() => setEditing(true)} title="双击重命名">
          {active ? page.title : truncateTabTitle(page.title)}
        </button>
      )}
      {canClose && (
        <button
          className="tab-close-button"
          onClick={(event) => {
            event.stopPropagation();
            onClose(page.id);
          }}
          title="关闭页签"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function truncateTabTitle(title: string) {
  return Array.from(title).slice(0, 4).join("");
}

function ColorPicker({ page, onColorChange }: { page: TodoPage; onColorChange: (pageId: string, color: string) => void }) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;

    function closeMenu() {
      setOpen(false);
    }

    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, [open]);

  return (
    <div className="tab-color-picker" onClick={(event) => event.stopPropagation()}>
      <button
        className="tab-color-button"
        style={{ backgroundColor: page.color }}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setMenuPosition({ top: rect.bottom + 6, left: rect.left });
          setOpen((current) => !current);
        }}
        title="选择页签颜色"
      />
      {open && (
        <div className="color-menu" style={{ top: menuPosition.top, left: menuPosition.left }}>
          {PAGE_COLORS.map((color) => (
            <button
              key={color}
              className={`color-swatch ${color === page.color ? "is-selected" : ""}`}
              style={{ backgroundColor: color }}
              onClick={() => {
                onColorChange(page.id, color);
                setOpen(false);
              }}
              title="设置页签颜色"
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PageManagerPanel({
  pages,
  activePageId,
  onClose,
  onSelect,
  onTitleChange,
  onColorChange,
  onDelete,
  onDeleteMany,
  onReorder,
}: {
  pages: TodoPage[];
  activePageId: string;
  onClose: () => void;
  onSelect: (pageId: string) => void;
  onTitleChange: (pageId: string, title: string) => void;
  onColorChange: (pageId: string, color: string) => void;
  onDelete: (pageId: string) => void;
  onDeleteMany: (pageIds: string[]) => void;
  onReorder: (pageId: string, beforePageId: string | null) => void;
}) {
  const [confirmPage, setConfirmPage] = useState<TodoPage | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [draggingPageId, setDraggingPageId] = useState<string | null>(null);
  const selectedCount = selectedPageIds.length;
  const canDeleteSelected = selectedCount > 0;
  const allSelected = selectedCount === pages.length;

  function togglePageSelection(pageId: string, selected: boolean) {
    setSelectedPageIds((current) =>
      selected ? [...new Set([...current, pageId])] : current.filter((id) => id !== pageId),
    );
  }

  function toggleAllSelection(selected: boolean) {
    setSelectedPageIds(selected ? pages.map((page) => page.id) : []);
  }

  return (
    <div className="settings-backdrop">
      <aside className="page-manager-panel">
        <header>
          <h2>页签管理</h2>
          <button className="icon-button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="page-manager-toolbar">
          <label className="manager-select-all">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(event) => toggleAllSelection(event.target.checked)}
            />
            <span>全选</span>
          </label>
          <button
            className="bulk-delete-button"
            disabled={!canDeleteSelected}
            onClick={() => setConfirmBulk(true)}
            title="批量删除"
          >
            <Trash2 size={16} />
            删除所选
          </button>
        </div>
        <div className="page-manager-list">
          {pages.map((page) => (
            <div
              className={`page-manager-row ${page.id === activePageId ? "is-active" : ""} ${
                draggingPageId === page.id ? "is-dragging" : ""
              }`}
              key={page.id}
              draggable
              onDragStart={(event) => {
                setDraggingPageId(page.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", page.id);
              }}
              onDragEnd={() => setDraggingPageId(null)}
              onDragOver={(event) => {
                const draggedId = draggingPageId || event.dataTransfer.getData("text/plain");
                if (!draggedId || draggedId === page.id) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const draggedId = draggingPageId || event.dataTransfer.getData("text/plain");
                if (draggedId && draggedId !== page.id) onReorder(draggedId, page.id);
                setDraggingPageId(null);
              }}
            >
              <input
                className="manager-row-checkbox"
                type="checkbox"
                checked={selectedPageIds.includes(page.id)}
                onChange={(event) => togglePageSelection(page.id, event.target.checked)}
                onClick={(event) => event.stopPropagation()}
                aria-label="选择页签"
              />
              <button
                className="manager-page-select"
                style={{ backgroundColor: page.color }}
                onClick={() => onSelect(page.id)}
                title="切换到此页签"
              />
              <input
                value={page.title}
                onChange={(event) => onTitleChange(page.id, event.target.value)}
                onFocus={() => onSelect(page.id)}
                aria-label="页签标题"
              />
              <ColorPicker page={page} onColorChange={onColorChange} />
              <button
                className="manager-delete-button"
                disabled={pages.length <= 1}
                onClick={() => setConfirmPage(page)}
                title={pages.length <= 1 ? "至少保留一个页签" : "删除页签"}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <div
            className="page-manager-drop-end"
            onDragOver={(event) => {
              if (!draggingPageId) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              const draggedId = draggingPageId || event.dataTransfer.getData("text/plain");
              if (draggedId) onReorder(draggedId, null);
              setDraggingPageId(null);
            }}
          />
        </div>
      </aside>
      {confirmPage && (
        <div className="confirm-backdrop" onClick={() => setConfirmPage(null)}>
          <div className="confirm-dialog" onClick={(event) => event.stopPropagation()}>
            <h3>删除页签</h3>
            <p>确定删除“{confirmPage.title}”吗？该页签中的事项也会被删除。</p>
            <div className="confirm-actions">
              <button onClick={() => setConfirmPage(null)}>取消</button>
              <button
                className="danger-button"
                onClick={() => {
                  onDelete(confirmPage.id);
                  setSelectedPageIds((current) => current.filter((id) => id !== confirmPage.id));
                  setConfirmPage(null);
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmBulk && (
        <div className="confirm-backdrop" onClick={() => setConfirmBulk(false)}>
          <div className="confirm-dialog" onClick={(event) => event.stopPropagation()}>
            <h3>批量删除页签</h3>
            <p>
              确定删除选中的 {selectedCount} 个页签吗？这些页签中的事项也会被删除。
              {selectedCount >= pages.length ? " 删除全部后会自动创建一个空的待办事项页签。" : ""}
            </p>
            <div className="confirm-actions">
              <button onClick={() => setConfirmBulk(false)}>取消</button>
              <button
                className="danger-button"
                onClick={() => {
                  onDeleteMany(selectedPageIds);
                  setSelectedPageIds([]);
                  setConfirmBulk(false);
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfirmDialog({
  dialog,
  onCancel,
  onConfirm,
}: {
  dialog: NonNullable<ConfirmDialogState>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isAcknowledgeOnly = dialog.confirmLabel === "知道了";

  return (
    <div className="confirm-backdrop" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(event) => event.stopPropagation()}>
        <h3>{dialog.title}</h3>
        <p>{dialog.message}</p>
        <div className="confirm-actions">
          {!isAcknowledgeOnly && <button onClick={onCancel}>取消</button>}
          <button className={isAcknowledgeOnly ? "" : "danger-button"} onClick={onConfirm}>
            {dialog.confirmLabel ?? "确认"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TodoText({ text, onChange }: { text: string; onChange: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(text);
  }, [text]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function save() {
    const nextText = draft.trim();
    onChange(nextText || text);
    setDraft(nextText || text);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="todo-text-editor"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") save();
          if (event.key === "Escape") {
            setDraft(text);
            setEditing(false);
          }
        }}
        aria-label="编辑待办"
      />
    );
  }

  return (
    <button className="todo-text-button" onDoubleClick={() => setEditing(true)} title="双击编辑">
      <MarkdownLine text={text} />
    </button>
  );
}

function MarkdownLine({ text }: { text: string }) {
  return (
    <div className="markdown-line">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkGemoji]}
        components={{
          p: ({ children }) => <span>{children}</span>,
          ul: ({ children }) => <span>{children}</span>,
          li: ({ children }) => <span>{children}</span>,
          input: ({ checked }) => <span className={`md-checkbox ${checked ? "checked" : ""}`} />,
        }}
      >
        {`- [ ] ${text}`}
      </ReactMarkdown>
    </div>
  );
}

function SettingsPanel({
  state,
  activePage,
  onClose,
  onSave,
  onApply,
  onExportAll,
  onExportActive,
  onImport,
}: {
  state: AppState;
  activePage: TodoPage;
  onClose: () => void;
  onSave: (draft: TemplateSettingsDraft) => void;
  onApply: (draft: TemplateSettingsDraft) => void;
  onExportAll: () => void;
  onExportActive: () => void;
  onImport: () => void;
}) {
  const [draft, setDraft] = useState<TemplateSettingsDraft>(() => ({
    templates: state.templates,
    selectedTemplateId: activePage.templateId,
  }));
  const [draggingPriorityId, setDraggingPriorityId] = useState<string | null>(null);
  const draftActiveTemplate = useMemo(
    () => draft.templates.find((template) => template.id === draft.selectedTemplateId) ?? draft.templates[0],
    [draft.selectedTemplateId, draft.templates],
  );

  function selectTemplate(templateId: string) {
    setDraft((current) => ({
      ...current,
      selectedTemplateId: templateId,
    }));
  }

  function addCustomTemplate() {
    const id = crypto.randomUUID();
    setDraft((current) => ({
      ...current,
      selectedTemplateId: id,
      templates: [
        ...current.templates,
        {
          id,
          name: "自定义优先级",
          priorities: [
            { id: crypto.randomUUID(), name: "📌 默认优先级", order: 0 },
          ],
        },
      ],
    }));
  }

  function updateTemplateName(name: string) {
    setDraft((current) => ({
      ...current,
      templates: current.templates.map((template) =>
        template.id === draftActiveTemplate.id ? { ...template, name } : template,
      ),
    }));
  }

  function updatePriority(priorityId: string, patch: Partial<Priority>) {
    setDraft((current) => ({
      ...current,
      templates: current.templates.map((template) =>
        template.id === draftActiveTemplate.id
          ? {
              ...template,
              priorities: template.priorities.map((priority) =>
                priority.id === priorityId ? { ...priority, ...patch } : priority,
              ),
            }
          : template,
      ),
    }));
  }

  function addPriority() {
    setDraft((current) => ({
      ...current,
      templates: current.templates.map((template) =>
        template.id === draftActiveTemplate.id
          ? {
              ...template,
              priorities: [
                ...template.priorities,
                {
                  id: crypto.randomUUID(),
                  name: "✨ 新优先级",
                  order: template.priorities.length,
                },
              ],
            }
          : template,
      ),
    }));
  }

  function movePriorityBefore(priorityId: string, beforePriorityId: string | null) {
    if (beforePriorityId && priorityId === beforePriorityId) return;

    setDraft((current) => ({
      ...current,
      templates: current.templates.map((template) => {
        if (template.id !== draftActiveTemplate.id) return template;

        const target = template.priorities.find((priority) => priority.id === priorityId);
        if (!target) return template;

        const ordered = [...template.priorities]
          .sort((a, b) => a.order - b.order)
          .filter((priority) => priority.id !== priorityId);
        const beforeIndex = beforePriorityId
          ? ordered.findIndex((priority) => priority.id === beforePriorityId)
          : -1;
        ordered.splice(beforeIndex >= 0 ? beforeIndex : ordered.length, 0, target);

        return {
          ...template,
          priorities: ordered.map((priority, index) => ({ ...priority, order: index })),
        };
      }),
    }));
  }

  function movePriorityByStep(priorityId: string, direction: -1 | 1) {
    const ordered = [...draftActiveTemplate.priorities].sort((a, b) => a.order - b.order);
    const currentIndex = ordered.findIndex((priority) => priority.id === priorityId);
    const swapWith = ordered[currentIndex + direction];
    if (!swapWith) return;
    movePriorityBefore(priorityId, direction < 0 ? swapWith.id : ordered[currentIndex + 2]?.id ?? null);
  }

  function deletePriority(priorityId: string) {
    if (draftActiveTemplate.priorities.length <= 1) return;
    setDraft((current) => ({
      ...current,
      templates: current.templates.map((template) =>
        template.id === draftActiveTemplate.id
          ? { ...template, priorities: template.priorities.filter((priority) => priority.id !== priorityId) }
          : template,
      ),
    }));
  }

  function resetBuiltIns() {
    setDraft((current) => ({
      ...current,
      templates: [
        ...BUILT_IN_TEMPLATES,
        ...current.templates.filter(
          (template) => !BUILT_IN_TEMPLATES.some((builtIn) => builtIn.id === template.id),
        ),
      ],
    }));
  }

  return (
    <div className="settings-backdrop">
      <aside className="settings-panel">
        <header>
          <h2>设置</h2>
          <button className="icon-button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>
        <label className="field">
          <span>模板</span>
          <select value={draft.selectedTemplateId} onChange={(event) => selectTemplate(event.target.value)}>
            {draft.templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>模板名称</span>
          <input value={draftActiveTemplate.name} onChange={(event) => updateTemplateName(event.target.value)} />
        </label>
        <div className="settings-actions">
          <button onClick={addCustomTemplate}>新建模板</button>
          <button onClick={resetBuiltIns}>恢复内置模板</button>
        </div>
        <section className="data-section">
          <div className="editor-title">
            <span>数据</span>
          </div>
          <div className="data-actions">
            <button type="button" onClick={onExportAll}>
              <Save size={15} />
              导出全部
            </button>
            <button type="button" onClick={onExportActive}>
              <Save size={15} />
              导出当前页
            </button>
            <button type="button" onClick={onImport}>
              <Import size={15} />
              导入
            </button>
          </div>
        </section>
        <div className="priority-editor">
          <div className="editor-title">
            <span>优先级</span>
            <button onClick={addPriority}>
              <Plus size={16} />
              添加
            </button>
          </div>
          {[...draftActiveTemplate.priorities]
            .sort((a, b) => a.order - b.order)
            .map((priority) => (
              <div
                className="priority-row"
                key={priority.id}
                draggable
                onDragStart={(event) => {
                  setDraggingPriorityId(priority.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", priority.id);
                }}
                onDragEnd={() => setDraggingPriorityId(null)}
                onDragOver={(event) => {
                  const draggedId = draggingPriorityId || event.dataTransfer.getData("text/plain");
                  if (!draggedId || draggedId === priority.id) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const draggedId = draggingPriorityId || event.dataTransfer.getData("text/plain");
                  if (draggedId) movePriorityBefore(draggedId, priority.id);
                  setDraggingPriorityId(null);
                }}
              >
                <input
                  value={priority.name}
                  onChange={(event) => updatePriority(priority.id, { name: event.target.value })}
                  aria-label="优先级标题"
                />
                <button className="icon-button" onClick={() => movePriorityByStep(priority.id, -1)} title="上移">
                  <MoveUp size={16} />
                </button>
                <button className="icon-button" onClick={() => movePriorityByStep(priority.id, 1)} title="下移">
                  <MoveDown size={16} />
                </button>
                <button className="icon-button" onClick={() => deletePriority(priority.id)} title="删除优先级">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
        </div>
        <div className="settings-footer">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="button" onClick={() => onSave(draft)}>
            保存模板
          </button>
          <button className="primary-button" type="button" onClick={() => onApply(draft)}>
            应用模板
          </button>
        </div>
      </aside>
    </div>
  );
}

function getFirstPriority(template: PriorityTemplate) {
  return [...template.priorities].sort((a, b) => a.order - b.order)[0];
}

function createEmptyPage(id: string, templateId: string): TodoPage {
  return {
    id,
    title: DEFAULT_PAGE_TITLE,
    color: DEFAULT_PAGE_COLOR,
    templateId,
    todos: [],
  };
}

function getActivePage(state: AppState) {
  return state.pages.find((page) => page.id === state.activePageId) ?? state.pages[0];
}

function updateActivePage(state: AppState, update: (page: TodoPage) => TodoPage): AppState {
  const active = getActivePage(state);
  return {
    ...state,
    pages: state.pages.map((page) => (page.id === active.id ? update(page) : page)),
  };
}

function sortTodos(todos: Todo[]) {
  return [...todos].sort((a, b) => a.sortIndex - b.sortIndex);
}

function isBackupLike(value: unknown) {
  return Boolean(
    value &&
      typeof value === "object" &&
      ("pages" in value || "todos" in value || "templates" in value || "schemaVersion" in value),
  );
}

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

export default App;
