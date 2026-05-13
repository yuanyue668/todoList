import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGemoji from "remark-gemoji";
import remarkGfm from "remark-gfm";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  LayoutGrid,
  MoveDown,
  MoveUp,
  Plus,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { BUILT_IN_TEMPLATES } from "./defaults";
import { fileToAttachment, isImageFile } from "./image";
import { detectDockedEdge, getCurrentTauriWindow, setWindowHidden } from "./tauriWindow";
import { loadState, saveState } from "./storage";
import type { AppState, ImageAttachment, Priority, PriorityTemplate, Todo } from "./types";

const EMPTY_TEXT = "";

function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<ImageAttachment | null>(null);
  const [hasTauriWindow, setHasTauriWindow] = useState(false);
  const [draggingTodoId, setDraggingTodoId] = useState<string | null>(null);

  const activeTemplate = useMemo(
    () => state.templates.find((template) => template.id === state.activeTemplateId) ?? state.templates[0],
    [state.activeTemplateId, state.templates],
  );

  const activePriorities = useMemo(
    () => [...activeTemplate.priorities].sort((a, b) => a.order - b.order),
    [activeTemplate.priorities],
  );

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    getCurrentTauriWindow().then((window) => setHasTauriWindow(Boolean(window)));
  }, []);

  useEffect(() => {
    if (!hasTauriWindow) return;
    let timer: number | undefined;
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
    return () => {
      window.removeEventListener("mouseup", detect);
      window.removeEventListener("resize", detect);
      window.clearTimeout(timer);
    };
  }, [hasTauriWindow]);

  function addTodo(priorityId: string, textValue: string, attachments: ImageAttachment[] = []) {
    const text = textValue.trim();
    if (!text && attachments.length === 0) return;

    const now = Date.now();
    if (!priorityId) return;

    setState((current) => ({
      ...current,
      todos: [
        ...current.todos,
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
    }));
  }

  function toggleTodo(todoId: string) {
    setState((current) => {
      const now = Date.now();
      return {
        ...current,
        todos: current.todos.map((todo) =>
          todo.id === todoId
            ? {
                ...todo,
                completed: !todo.completed,
                updatedAt: now,
                sortIndex: now,
              }
            : todo,
        ),
      };
    });
  }

  function deleteTodo(todoId: string) {
    setState((current) => ({
      ...current,
      todos: current.todos.filter((todo) => todo.id !== todoId),
    }));
  }

  function updateTodoText(todoId: string, text: string) {
    setState((current) => ({
      ...current,
      todos: current.todos.map((todo) =>
        todo.id === todoId ? { ...todo, text, updatedAt: Date.now() } : todo,
      ),
    }));
  }

  function moveTodoBefore(todoId: string, beforeTodoId: string | null) {
    setState((current) => {
      const target = current.todos.find((todo) => todo.id === todoId);
      if (!target) return current;
      const beforeTodo = beforeTodoId ? current.todos.find((todo) => todo.id === beforeTodoId) : null;
      const nextPriorityId = beforeTodo?.priorityId ?? target.priorityId;
      const ordered = sortTodos(current.todos.filter((todo) => todo.priorityId === nextPriorityId)).filter(
        (todo) => todo.id !== todoId,
      );

      const beforeIndex = beforeTodoId ? ordered.findIndex((todo) => todo.id === beforeTodoId) : -1;
      const insertIndex = beforeIndex >= 0 ? beforeIndex : ordered.length;
      ordered.splice(insertIndex, 0, { ...target, priorityId: nextPriorityId });

      const now = Date.now();
      const reordered = new Map(ordered.map((todo, index) => [todo.id, index]));

      return {
        ...current,
        todos: current.todos.map((todo) => {
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
      };
    });
  }

  function moveTodoToGroupEnd(todoId: string, priorityId: string) {
    setState((current) => {
      const target = current.todos.find((todo) => todo.id === todoId);
      if (!target) return current;

      const ordered = sortTodos(current.todos.filter((todo) => todo.priorityId === priorityId)).filter(
        (todo) => todo.id !== todoId,
      );
      ordered.push({ ...target, priorityId });

      const now = Date.now();
      const reordered = new Map(ordered.map((todo, index) => [todo.id, index]));

      return {
        ...current,
        todos: current.todos.map((todo) => {
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
      };
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
    const edge = state.windowPrefs.edge;
    if (!edge) return;
    await setWindowHidden(edge, false);
    setState((current) => ({
      ...current,
      windowPrefs: { edge, hidden: false },
    }));
  }

  return (
    <main className="app-shell" onMouseEnter={handleReveal}>
      <header className="titlebar" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region>
          <LayoutGrid size={18} />
          <span data-tauri-drag-region>Edge Todos</span>
        </div>
        <div className="title-actions">
          {hasTauriWindow && state.windowPrefs.edge && (
            <button className="icon-button" onClick={handleHide} title="贴边隐藏">
              {state.windowPrefs.hidden ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </button>
          )}
          <button className="icon-button" onClick={() => setSettingsOpen(true)} title="设置">
            <Settings size={18} />
          </button>
        </div>
      </header>

      <section className="todo-list">
        {activePriorities.map((priority) => (
          <PriorityGroup
            key={priority.id}
            priority={priority}
            todos={sortTodos(state.todos.filter((todo) => todo.priorityId === priority.id))}
            onToggle={toggleTodo}
            onDelete={deleteTodo}
            onTextChange={updateTodoText}
            onPreview={setPreviewImage}
            onAdd={addTodo}
            onMoveBefore={moveTodoBefore}
            onMoveToGroupEnd={moveTodoToGroupEnd}
            draggingTodoId={draggingTodoId}
            onDraggingTodoChange={setDraggingTodoId}
          />
        ))}
      </section>

      {settingsOpen && (
        <SettingsPanel
          state={state}
          activeTemplate={activeTemplate}
          onClose={() => setSettingsOpen(false)}
          onChange={setState}
        />
      )}

      {previewImage && (
        <div className="preview-backdrop" onClick={() => setPreviewImage(null)}>
          <div className="preview-panel" onClick={(event) => event.stopPropagation()}>
            <button className="icon-button preview-close" onClick={() => setPreviewImage(null)} title="关闭">
              <X size={18} />
            </button>
            <img src={previewImage.dataUrl} alt={previewImage.name} />
          </div>
        </div>
      )}
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
}: {
  priority: Priority;
  todos: Todo[];
  onToggle: (todoId: string) => void;
  onDelete: (todoId: string) => void;
  onTextChange: (todoId: string, text: string) => void;
  onPreview: (image: ImageAttachment) => void;
  onAdd: (priorityId: string, text: string, attachments?: ImageAttachment[]) => void;
  onMoveBefore: (todoId: string, beforeTodoId: string | null) => void;
  onMoveToGroupEnd: (todoId: string, priorityId: string) => void;
  draggingTodoId: string | null;
  onDraggingTodoChange: (todoId: string | null) => void;
}) {
  const [draftText, setDraftText] = useState(EMPTY_TEXT);
  const [composerOpen, setComposerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const draftInputRef = useRef<HTMLInputElement | null>(null);

  function openComposer() {
    setComposerOpen(true);
    window.setTimeout(() => draftInputRef.current?.focus(), 0);
  }

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
      </div>
      {composerOpen && (
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
        className="group-items"
        onDragOver={(event) => {
          const draggedId = event.dataTransfer.getData("text/plain") || draggingTodoId;
          if (!draggedId) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          event.preventDefault();
          const draggedId = event.dataTransfer.getData("text/plain") || draggingTodoId;
          if (!draggedId) return;
          onMoveToGroupEnd(draggedId, priority.id);
          onDraggingTodoChange(null);
        }}
      >
        {todos.map((todo) => (
          <article
            className={`todo-item ${todo.completed ? "is-completed" : ""} ${
              draggingTodoId === todo.id ? "is-dragging" : ""
            }`}
            key={todo.id}
            draggable
            onDragStart={(event) => {
              onDraggingTodoChange(todo.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", todo.id);
            }}
            onDragEnd={() => onDraggingTodoChange(null)}
            onDragOver={(event) => {
              const draggedId = event.dataTransfer.getData("text/plain") || draggingTodoId;
              if (!draggedId || draggedId === todo.id) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const draggedId = event.dataTransfer.getData("text/plain") || draggingTodoId;
              if (!draggedId || draggedId === todo.id) return;
              onMoveBefore(draggedId, todo.id);
              onDraggingTodoChange(null);
            }}
          >
            <button
              className={`checkbox ${todo.completed ? "checked" : ""}`}
              onClick={() => onToggle(todo.id)}
              title={todo.completed ? "标记为未完成" : "标记为完成"}
            >
              {todo.completed && <Check size={15} />}
            </button>
            <div className="todo-content">
              <TodoText text={todo.text} onChange={(text) => onTextChange(todo.id, text)} />
            </div>
            {todo.attachments.length > 0 && (
              <div className="thumb-strip">
                {todo.attachments.slice(0, 3).map((attachment) => (
                  <button className="thumb" key={attachment.id} onClick={() => onPreview(attachment)}>
                    <img src={attachment.dataUrl} alt={attachment.name} />
                  </button>
                ))}
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
  activeTemplate,
  onClose,
  onChange,
}: {
  state: AppState;
  activeTemplate: PriorityTemplate;
  onClose: () => void;
  onChange: React.Dispatch<React.SetStateAction<AppState>>;
}) {
  const [draggingPriorityId, setDraggingPriorityId] = useState<string | null>(null);

  function selectTemplate(templateId: string) {
    const template = state.templates.find((item) => item.id === templateId);
    const fallbackPriority = template?.priorities[0]?.id;
    onChange((current) => ({
      ...current,
      activeTemplateId: templateId,
      todos: fallbackPriority
        ? current.todos.map((todo) =>
            template.priorities.some((priority) => priority.id === todo.priorityId)
              ? todo
              : { ...todo, priorityId: fallbackPriority, updatedAt: Date.now() },
          )
        : current.todos,
    }));
  }

  function addCustomTemplate() {
    const id = crypto.randomUUID();
    onChange((current) => ({
      ...current,
      activeTemplateId: id,
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
    onChange((current) => ({
      ...current,
      templates: current.templates.map((template) =>
        template.id === activeTemplate.id ? { ...template, name } : template,
      ),
    }));
  }

  function updatePriority(priorityId: string, patch: Partial<Priority>) {
    onChange((current) => ({
      ...current,
      templates: current.templates.map((template) =>
        template.id === activeTemplate.id
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
    onChange((current) => ({
      ...current,
      templates: current.templates.map((template) =>
        template.id === activeTemplate.id
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

    onChange((current) => ({
      ...current,
      templates: current.templates.map((template) => {
        if (template.id !== activeTemplate.id) return template;

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
    const ordered = [...activeTemplate.priorities].sort((a, b) => a.order - b.order);
    const currentIndex = ordered.findIndex((priority) => priority.id === priorityId);
    const swapWith = ordered[currentIndex + direction];
    if (!swapWith) return;
    movePriorityBefore(priorityId, direction < 0 ? swapWith.id : ordered[currentIndex + 2]?.id ?? null);
  }

  function deletePriority(priorityId: string) {
    if (activeTemplate.priorities.length <= 1) return;
    const fallback = activeTemplate.priorities.find((priority) => priority.id !== priorityId);
    onChange((current) => ({
      ...current,
      templates: current.templates.map((template) =>
        template.id === activeTemplate.id
          ? { ...template, priorities: template.priorities.filter((priority) => priority.id !== priorityId) }
          : template,
      ),
      todos: fallback
        ? current.todos.map((todo) =>
            todo.priorityId === priorityId ? { ...todo, priorityId: fallback.id, updatedAt: Date.now() } : todo,
          )
        : current.todos,
    }));
  }

  function resetBuiltIns() {
    onChange((current) => ({
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
          <span>当前模板</span>
          <select value={state.activeTemplateId} onChange={(event) => selectTemplate(event.target.value)}>
            {state.templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>模板名称</span>
          <input value={activeTemplate.name} onChange={(event) => updateTemplateName(event.target.value)} />
        </label>
        <div className="settings-actions">
          <button onClick={addCustomTemplate}>新建模板</button>
          <button onClick={resetBuiltIns}>恢复内置模板</button>
        </div>
        <div className="priority-editor">
          <div className="editor-title">
            <span>优先级</span>
            <button onClick={addPriority}>
              <Plus size={16} />
              添加
            </button>
          </div>
          {[...activeTemplate.priorities]
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
      </aside>
    </div>
  );
}

function sortTodos(todos: Todo[]) {
  return [...todos].sort((a, b) => a.sortIndex - b.sortIndex);
}

export default App;
