import type { EdgeSide } from "./types";

type WebviewWindow = {
  setPosition(position: { type: "Physical"; x: number; y: number }): Promise<void>;
  setSize(size: { type: "Physical"; width: number; height: number }): Promise<void>;
  outerSize(): Promise<{ width: number; height: number }>;
  outerPosition(): Promise<{ x: number; y: number }>;
};

export const isTauri = "__TAURI_INTERNALS__" in window;
const STRIP_SIZE = 8;
const EDGE_THRESHOLD = 28;

export async function startWindowDragging(): Promise<void> {
  if (!isTauri) return;
  const mod = await import("@tauri-apps/api/window");
  await mod.getCurrentWindow().startDragging();
}

export async function getCurrentTauriWindow(): Promise<WebviewWindow | null> {
  if (!isTauri) {
    return null;
  }

  try {
    const mod = await import("@tauri-apps/api/window");
    return mod.getCurrentWindow() as unknown as WebviewWindow;
  } catch {
    return null;
  }
}

export async function detectDockedEdge(): Promise<EdgeSide> {
  const appWindow = await getCurrentTauriWindow();
  if (!appWindow) {
    return null;
  }

  const [position, size] = await Promise.all([appWindow.outerPosition(), appWindow.outerSize()]);
  const screenWidth = window.screen.availWidth;
  const screenHeight = window.screen.availHeight;

  if (position.x <= EDGE_THRESHOLD) return "left";
  if (position.y <= EDGE_THRESHOLD) return "top";
  if (position.x + size.width >= screenWidth - EDGE_THRESHOLD) return "right";
  if (position.y + size.height >= screenHeight - EDGE_THRESHOLD) return "bottom";
  return null;
}

export async function setWindowHidden(edge: EdgeSide, hidden: boolean) {
  const appWindow = await getCurrentTauriWindow();
  if (!appWindow || !edge) {
    return;
  }

  const [position, size] = await Promise.all([appWindow.outerPosition(), appWindow.outerSize()]);
  const screenWidth = window.screen.availWidth;
  const screenHeight = window.screen.availHeight;

  const visiblePosition = {
    left: { x: 0, y: clamp(position.y, 0, screenHeight - size.height) },
    right: { x: screenWidth - size.width, y: clamp(position.y, 0, screenHeight - size.height) },
    top: { x: clamp(position.x, 0, screenWidth - size.width), y: 0 },
    bottom: { x: clamp(position.x, 0, screenWidth - size.width), y: screenHeight - size.height },
  }[edge];

  const hiddenPosition = {
    left: { x: STRIP_SIZE - size.width, y: visiblePosition.y },
    right: { x: screenWidth - STRIP_SIZE, y: visiblePosition.y },
    top: { x: visiblePosition.x, y: STRIP_SIZE - size.height },
    bottom: { x: visiblePosition.x, y: screenHeight - STRIP_SIZE },
  }[edge];

  await appWindow.setPosition({
    type: "Physical",
    ...(hidden ? hiddenPosition : visiblePosition),
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
