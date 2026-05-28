import { DEFAULT_PAGE_COLOR, DEFAULT_STATE, DEFAULT_TODO_STYLE } from "./defaults";
import type { AppState, ImageAttachment, PriorityTemplate, Todo, TodoPage, TodoTextStyle, WindowPrefs } from "./types";

const STORAGE_KEY = "edge-todos-state-v1";
const CURRENT_SCHEMA_VERSION = 3;

type LegacyAppState = Partial<AppState> & {
  activeTemplateId?: string;
  todos?: Todo[];
};

export function loadState(): AppState {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return DEFAULT_STATE;
  }

  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveState(state: AppState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function normalizeState(raw: unknown): AppState {
  const parsed = isObject(raw) ? (raw as LegacyAppState) : {};
  const templates = normalizeTemplates(parsed.templates);
  const pages = normalizePages(parsed, templates);

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    templates,
    pages,
    activePageId: normalizeActivePageId(parsed, pages),
    windowPrefs: normalizeWindowPrefs(parsed.windowPrefs),
  };
}

function normalizePages(parsed: LegacyAppState, templates: PriorityTemplate[]): TodoPage[] {
  if (Array.isArray(parsed.pages) && parsed.pages.length) {
    return parsed.pages.map((rawPage, index) => {
      const page = isObject(rawPage) ? (rawPage as Partial<TodoPage>) : {};
      const templateId =
        typeof page.templateId === "string" && page.templateId
          ? page.templateId
          : parsed.activeTemplateId || DEFAULT_STATE.pages[0].templateId;
      return normalizePage(
        {
          id: typeof page.id === "string" && page.id ? page.id : `page-${index}`,
          title: typeof page.title === "string" ? page.title : "待办事项",
          color: typeof page.color === "string" && page.color ? page.color : DEFAULT_PAGE_COLOR,
          templateId,
          todos: Array.isArray(page.todos) ? page.todos.map((todo, todoIndex) => normalizeTodo(todo, todoIndex)) : [],
        },
        templates,
      );
    });
  }

  return normalizePages(
    {
      ...parsed,
      pages: [
        createLegacyPage(parsed),
      ],
    },
    templates,
  );
}

function normalizePage(page: TodoPage, templates: PriorityTemplate[]): TodoPage {
  const fallbackTemplate = templates[0] ?? DEFAULT_STATE.templates[0];
  const template = templates.find((item) => item.id === page.templateId) ?? fallbackTemplate;
  const fallbackPriority = [...template.priorities].sort((a, b) => a.order - b.order)[0];
  const validPriorityIds = new Set(template.priorities.map((priority) => priority.id));

  return {
    ...page,
    templateId: template.id,
    todos: page.todos.map((todo) =>
      fallbackPriority && !validPriorityIds.has(todo.priorityId)
        ? { ...todo, priorityId: fallbackPriority.id }
        : todo,
    ),
  };
}

function createLegacyPage(parsed: LegacyAppState): TodoPage {
  return {
    ...DEFAULT_STATE.pages[0],
    templateId: parsed.activeTemplateId || DEFAULT_STATE.pages[0].templateId,
    todos: Array.isArray(parsed.todos)
      ? parsed.todos.map((todo, todoIndex) => normalizeTodo(todo, todoIndex))
      : DEFAULT_STATE.pages[0].todos,
  };
}

function normalizeActivePageId(parsed: LegacyAppState, pages: TodoPage[]) {
  if (pages.some((page) => page.id === parsed.activePageId)) {
    return parsed.activePageId!;
  }
  return pages[0]?.id ?? DEFAULT_STATE.activePageId;
}

function normalizeTemplates(templates: unknown): PriorityTemplate[] {
  if (!Array.isArray(templates) || templates.length === 0) {
    return DEFAULT_STATE.templates;
  }

  const normalized = templates
    .map((template, templateIndex) => {
      if (!template || typeof template !== "object") return null;
      const source = template as Partial<PriorityTemplate>;
      const priorities = Array.isArray(source.priorities)
        ? source.priorities
            .map((priority, priorityIndex) => {
              if (!priority || typeof priority !== "object") return null;
              const prioritySource = priority as PriorityTemplate["priorities"][number];
              return {
                id:
                  typeof prioritySource.id === "string" && prioritySource.id
                    ? prioritySource.id
                    : `priority-${templateIndex}-${priorityIndex}`,
                name: typeof prioritySource.name === "string" ? prioritySource.name : "未命名优先级",
                order: typeof prioritySource.order === "number" ? prioritySource.order : priorityIndex,
              };
            })
            .filter((priority): priority is PriorityTemplate["priorities"][number] => Boolean(priority))
        : [];

      if (!priorities.length) return null;

      return {
        id: typeof source.id === "string" && source.id ? source.id : `template-${templateIndex}`,
        name: typeof source.name === "string" ? source.name : "未命名模板",
        priorities,
      };
    })
    .filter((template): template is PriorityTemplate => Boolean(template));

  return normalized.length ? normalized : DEFAULT_STATE.templates;
}

function normalizeTodo(todo: unknown, index: number): Todo {
  const source = isObject(todo) ? (todo as Partial<Todo>) : {};
  const now = Date.now();
  return {
    id: typeof source.id === "string" && source.id ? source.id : `todo-${now}-${index}`,
    text: typeof source.text === "string" && source.text ? source.text : "未命名事项",
    priorityId:
      typeof source.priorityId === "string" && source.priorityId
        ? source.priorityId
        : DEFAULT_STATE.pages[0].todos[0]?.priorityId ?? DEFAULT_STATE.templates[0].priorities[0].id,
    completed: Boolean(source.completed),
    completedAt:
      typeof source.completedAt === "number"
        ? source.completedAt
        : source.completed
          ? typeof source.updatedAt === "number"
            ? source.updatedAt
            : now
          : null,
    createdAt: typeof source.createdAt === "number" ? source.createdAt : now,
    updatedAt: typeof source.updatedAt === "number" ? source.updatedAt : now,
    sortIndex: typeof source.sortIndex === "number" ? source.sortIndex : index,
    attachments: Array.isArray(source.attachments)
      ? source.attachments
          .map((attachment, attachmentIndex) => normalizeAttachment(attachment, attachmentIndex))
          .filter((attachment): attachment is ImageAttachment => Boolean(attachment))
      : [],
    style: normalizeTodoStyle(source.style),
  };
}

function normalizeTodoStyle(style: TodoTextStyle | undefined): TodoTextStyle {
  const source = isObject(style) ? (style as Partial<TodoTextStyle>) : {};
  return {
    bold: Boolean(source.bold),
    italic: Boolean(source.italic),
    underline: Boolean(source.underline),
    strike: Boolean(source.strike),
    color: typeof source.color === "string" && source.color ? source.color : DEFAULT_TODO_STYLE.color,
    highlight:
      typeof source.highlight === "string" && source.highlight ? source.highlight : DEFAULT_TODO_STYLE.highlight,
    link: typeof source.link === "string" && source.link ? source.link : DEFAULT_TODO_STYLE.link,
  };
}

function normalizeAttachment(attachment: unknown, index: number): ImageAttachment | null {
  const source = isObject(attachment) ? (attachment as Partial<ImageAttachment>) : {};
  if (typeof source.dataUrl !== "string" || !source.dataUrl) {
    return null;
  }

  return {
    id: typeof source.id === "string" && source.id ? source.id : `attachment-${Date.now()}-${index}`,
    name: typeof source.name === "string" && source.name ? source.name : "image",
    mimeType: typeof source.mimeType === "string" && source.mimeType ? source.mimeType : "image/png",
    dataUrl: source.dataUrl,
    createdAt: typeof source.createdAt === "number" ? source.createdAt : Date.now(),
  };
}

function normalizeWindowPrefs(windowPrefs: WindowPrefs | undefined): WindowPrefs {
  const validEdges = new Set(["left", "right", "top", "bottom", null]);
  return {
    edge: validEdges.has(windowPrefs?.edge ?? null) ? windowPrefs?.edge ?? null : null,
    hidden: Boolean(windowPrefs?.hidden),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
