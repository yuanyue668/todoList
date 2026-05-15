import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import App from "./App";

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
