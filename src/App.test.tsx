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
