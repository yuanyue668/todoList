import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import App from "./App";

const mockSetWindowHidden = vi.fn().mockResolvedValue(undefined);
const mockSetWindowAlwaysOnTop = vi.fn().mockResolvedValue(undefined);
const mockStartWindowDragging = vi.fn().mockResolvedValue(undefined);
const mockGetWindowOuterSize = vi.fn().mockResolvedValue({ width: 360, height: 640 });
const mockSetWindowOuterSize = vi.fn().mockResolvedValue(undefined);
const mockCloseWindow = vi.fn().mockResolvedValue(undefined);
const mockDetectDockedEdge = vi.fn().mockResolvedValue(null);
const mockGetCurrentTauriWindow = vi.fn().mockResolvedValue(null);
const mockOnWindowMoved = vi.fn().mockResolvedValue(() => {});
const mockIsCursorInRevealStrip = vi.fn().mockResolvedValue(false);
const mockOpenExternalLink = vi.fn().mockResolvedValue(undefined);

vi.mock("./tauriWindow", () => ({
  getCurrentTauriWindow: () => mockGetCurrentTauriWindow(),
  detectDockedEdge: () => mockDetectDockedEdge(),
  onWindowMoved: (callback: () => void) => mockOnWindowMoved(callback),
  isCursorInRevealStrip: (edge: string) => mockIsCursorInRevealStrip(edge),
  setWindowHidden: (edge: string, hidden: boolean) =>
    mockSetWindowHidden(edge, hidden),
  setWindowAlwaysOnTop: (value: boolean) => mockSetWindowAlwaysOnTop(value),
  startWindowDragging: () => mockStartWindowDragging(),
  getWindowOuterSize: () => mockGetWindowOuterSize(),
  setWindowOuterSize: (size: { width: number; height: number }) => mockSetWindowOuterSize(size),
  closeWindow: () => mockCloseWindow(),
  openExternalLink: (url: string) => mockOpenExternalLink(url),
  isTauri: false,
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
    mockIsCursorInRevealStrip.mockReset();
    mockIsCursorInRevealStrip.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    vi.setSystemTime(vi.getRealSystemTime());
    mockGetCurrentTauriWindow.mockResolvedValue(null);
  });

  it("calls setWindowHidden after 1500 ms when mouse leaves docked window", async () => {
    render(<App />);
    await act(async () => {
      await vi.runAllTicks();
    });

    fireEvent.click(screen.getByTitle("取消固定显示"));
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

    fireEvent.click(screen.getByTitle("取消固定显示"));
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

    fireEvent.click(screen.getByTitle("取消固定显示"));
    const shell = screen.getByRole("main");
    fireEvent.mouseLeave(shell);

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await vi.runAllTicks();
    });

    expect(mockSetWindowHidden).not.toHaveBeenCalled();
  });

  it("keeps a pinned docked window visible on mouse leave", async () => {
    render(<App />);
    await act(async () => { await vi.runAllTicks(); });

    fireEvent.mouseLeave(screen.getByRole("main"));

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await vi.runAllTicks();
    });

    expect(mockSetWindowHidden).not.toHaveBeenCalledWith("left", true);
  });

  it("reveals a hidden docked window when the cursor enters the visible strip", async () => {
    localStorage.setItem(
      "edge-todos-state-v1",
      JSON.stringify({
        ...JSON.parse(DOCKED_STATE),
        windowPrefs: { edge: "left", hidden: true },
      })
    );
    mockIsCursorInRevealStrip.mockResolvedValue(true);

    render(<App />);
    await act(async () => {
      await vi.runAllTicks();
    });

    await act(async () => {
      vi.advanceTimersByTime(120);
      await vi.runAllTicks();
    });

    expect(mockIsCursorInRevealStrip).toHaveBeenCalledWith("left");
    expect(mockSetWindowHidden).toHaveBeenCalledWith("left", false);
  });

  it("restores the resized outer size when a titlebar drag reports a default-sized move", async () => {
    let movedCallback: (() => void) | undefined;
    const resizedSize = { width: 520, height: 720 };
    mockGetWindowOuterSize
      .mockResolvedValueOnce(resizedSize)
      .mockResolvedValueOnce({ width: 360, height: 640 });
    mockOnWindowMoved.mockImplementation((callback: () => void) => {
      movedCallback = callback;
      return Promise.resolve(() => {});
    });

    render(<App />);
    await act(async () => { await vi.runAllTicks(); });

    fireEvent.mouseDown(document.querySelector(".titlebar-drag-zone")!);
    await act(async () => { await vi.runAllTicks(); });
    await act(async () => {
      movedCallback?.();
      await vi.runAllTicks();
    });

    expect(mockStartWindowDragging).toHaveBeenCalled();
    expect(mockSetWindowOuterSize).toHaveBeenCalledWith(resizedSize);
  });
});

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

  it("reorders todos when dragging by the handle", () => {
    render(<App />);
    const todoA = screen.getByText("任务 A").closest("article")!;
    const todoB = screen.getByText("任务 B").closest("article")!;
    const handleB = todoB.querySelector(".todo-drag-handle")!;

    fireEvent.dragStart(handleB, {
      dataTransfer: { setData: vi.fn(), effectAllowed: "move" },
    });
    fireEvent.drop(todoA, {
      dataTransfer: { getData: () => "todo-b" },
    });

    const saved = JSON.parse(localStorage.getItem("edge-todos-state-v1")!);
    const sortedTexts = [...saved.pages[0].todos]
      .sort((a, b) => a.sortIndex - b.sortIndex)
      .map((todo) => todo.text);
    expect(sortedTexts).toEqual(["任务 B", "任务 A"]);
  });

  it("reorders todos when pointer dragging the handle over another todo", () => {
    render(<App />);
    const todoA = screen.getByText("任务 A").closest("article")!;
    const todoB = screen.getByText("任务 B").closest("article")!;
    const handleB = todoB.querySelector(".todo-drag-handle")!;
    const originalElementFromPoint = document.elementFromPoint;
    const elementFromPoint = vi.fn(() => todoA);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: elementFromPoint,
    });

    fireEvent.pointerDown(handleB, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(handleB, { pointerId: 1, buttons: 1, clientX: 12, clientY: 20 });
    fireEvent.pointerUp(handleB, { pointerId: 1, clientX: 12, clientY: 20 });

    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint,
    });

    const saved = JSON.parse(localStorage.getItem("edge-todos-state-v1")!);
    const sortedTexts = [...saved.pages[0].todos]
      .sort((a, b) => a.sortIndex - b.sortIndex)
      .map((todo) => todo.text);
    expect(sortedTexts).toEqual(["任务 B", "任务 A"]);
  });
});

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
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    const input = screen.getByPlaceholderText("添加到🔥 高");
    input.focus();

    fireEvent.keyDown(window, { key: "2", ctrlKey: true });
    expect(screen.queryByPlaceholderText("添加到⭐ 中")).not.toBeInTheDocument();
  });
});

describe("GitHub issues — todo controls", () => {
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

  it("closes the group composer with the close button", () => {
    render(<App />);
    fireEvent.click(screen.getByTitle("在此分组添加事项"));
    expect(screen.getByPlaceholderText("添加到🔥 高")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("关闭添加框"));

    expect(screen.queryByPlaceholderText("添加到🔥 高")).not.toBeInTheDocument();
  });

  it("records completion time when a todo is completed", () => {
    vi.setSystemTime(new Date("2026-05-28T10:20:00+08:00"));
    render(<App />);
    fireEvent.click(screen.getByTitle("标记为完成"));

    expect(screen.getByText("完成于")).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem("edge-todos-state-v1")!);
    expect(saved.pages[0].todos[0].completed).toBe(true);
    expect(saved.pages[0].todos[0].completedAt).toBe(new Date("2026-05-28T10:20:00+08:00").getTime());
  });

  it("allows editing and clearing the completion time", () => {
    render(<App />);
    fireEvent.click(screen.getByTitle("标记为完成"));

    fireEvent.change(screen.getByLabelText("完成时间"), { target: { value: "2026-05-28T09:30" } });
    let saved = JSON.parse(localStorage.getItem("edge-todos-state-v1")!);
    expect(saved.pages[0].todos[0].completed).toBe(true);
    expect(saved.pages[0].todos[0].completedAt).toBe(new Date("2026-05-28T09:30").getTime());

    fireEvent.click(screen.getByTitle("清除完成时间"));
    saved = JSON.parse(localStorage.getItem("edge-todos-state-v1")!);
    expect(saved.pages[0].todos[0].completed).toBe(true);
    expect(saved.pages[0].todos[0].completedAt).toBeNull();
    expect(screen.getByText("完成于")).toBeInTheDocument();
  });

  it("allows setting and clearing a planned time before completion", () => {
    render(<App />);

    expect(screen.queryByText("计划于")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("计划时间")).not.toBeInTheDocument();
    expect(screen.queryByTitle("清除计划时间")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle("设置计划时间"));

    fireEvent.change(screen.getByLabelText("计划时间"), { target: { value: "2026-05-29T12:15" } });
    let saved = JSON.parse(localStorage.getItem("edge-todos-state-v1")!);
    expect(saved.pages[0].todos[0].completed).toBe(false);
    expect(saved.pages[0].todos[0].completedAt).toBeNull();
    expect(saved.pages[0].todos[0].plannedAt).toBe(new Date("2026-05-29T12:15").getTime());
    expect(screen.getByText("计划于")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("清除计划时间"));
    saved = JSON.parse(localStorage.getItem("edge-todos-state-v1")!);
    expect(saved.pages[0].todos[0].plannedAt).toBeNull();
    expect(screen.queryByText("计划于")).not.toBeInTheDocument();
    expect(screen.getByTitle("设置计划时间")).toBeInTheDocument();
  });

  it("applies a text style from the style toolbar", () => {
    render(<App />);
    fireEvent.click(screen.getByTitle("文字样式"));
    fireEvent.click(screen.getByTitle("粗体"));

    const saved = JSON.parse(localStorage.getItem("edge-todos-state-v1")!);
    expect(saved.pages[0].todos[0].style.bold).toBe(true);
  });

  it("closes the text style panel with Escape and outside clicks", () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("文字样式"));
    expect(screen.getByTitle("粗体")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTitle("粗体")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle("文字样式"));
    expect(screen.getByTitle("粗体")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByTitle("粗体")).not.toBeInTheDocument();
  });

  it("applies underline, strike, color, highlight, and link styles from the toolbar", () => {
    render(<App />);
    fireEvent.click(screen.getByTitle("文字样式"));
    fireEvent.click(screen.getByTitle("下划线"));
    fireEvent.click(screen.getByTitle("删除线"));
    fireEvent.change(screen.getByTitle("字体颜色").querySelector("input")!, { target: { value: "#ff0000" } });
    fireEvent.change(screen.getByTitle("文本高亮色").querySelector("input")!, { target: { value: "#00ff00" } });
    fireEvent.change(screen.getByPlaceholderText("https://"), { target: { value: "example.com" } });
    fireEvent.blur(screen.getByPlaceholderText("https://"));

    const saved = JSON.parse(localStorage.getItem("edge-todos-state-v1")!);
    expect(saved.pages[0].todos[0].style).toMatchObject({
      underline: true,
      strike: true,
      color: "#ff0000",
      highlight: "#00ff00",
      link: "https://example.com",
    });
  });

  it("adds an image to an existing todo from the row action", () => {
    render(<App />);
    const file = new File(["GIF89a"], "todo.gif", { type: "image/gif" });
    const input = screen.getByTitle("给事项添加图片").parentElement!.querySelector("input")!;

    fireEvent.change(input, { target: { files: [file] } });

    return screen.findByAltText("todo.gif").then(() => {
      const saved = JSON.parse(localStorage.getItem("edge-todos-state-v1")!);
      expect(saved.pages[0].todos[0].attachments).toHaveLength(1);
      expect(saved.pages[0].todos[0].attachments[0].name).toBe("todo.gif");
    });
  });

  it("opens markdown links externally without navigating the app WebView", () => {
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
                id: "todo-link",
                text: "点我 [链接](https://example.com)",
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

    render(<App />);
    fireEvent.click(screen.getByRole("link", { name: "链接" }));

    expect(mockOpenExternalLink).toHaveBeenCalledWith("https://example.com");
  });

  it("creates distinguishable default titles for new pages", () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("新建页签"));
    fireEvent.click(screen.getByTitle("新建页签"));

    const saved = JSON.parse(localStorage.getItem("edge-todos-state-v1")!);
    expect(saved.pages.map((page: { title: string }) => page.title)).toEqual([
      "待办事项",
      "待办事项 2",
      "待办事项 3",
    ]);
  });

  it("closes settings and page manager panels with Escape and backdrop clicks", () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("设置"));
    expect(screen.getByRole("heading", { name: "设置" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "设置" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle("页签管理"));
    expect(screen.getByRole("heading", { name: "页签管理" })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("page-manager-backdrop"));
    expect(screen.queryByRole("heading", { name: "页签管理" })).not.toBeInTheDocument();
  });
});

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

    fireEvent.click(screen.getByTestId("about-backdrop"));

    expect(screen.queryByText("Edge Todos")).not.toBeInTheDocument();
  });
});
