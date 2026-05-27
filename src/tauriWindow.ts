import type { EdgeSide } from "./types";

export const isTauri = "__TAURI_INTERNALS__" in window;
export const REVEAL_STRIP_SIZE = 24;
const EDGE_THRESHOLD = 28;

// Pre-cache the window reference at module init so startDragging() has no import latency
// on Windows/WebView2 the first dynamic import can be slow enough to miss the drag context
let _cachedWindow: any = null;
let _loadPromise: Promise<any> | null = null;
let _windowApiPromise: Promise<any> | null = null;

function getWindowApi(): Promise<any> {
  if (!_windowApiPromise) {
    _windowApiPromise = import("@tauri-apps/api/window");
  }
  return _windowApiPromise;
}

function getWindow(): Promise<any> {
  if (_cachedWindow) return Promise.resolve(_cachedWindow);
  if (!_loadPromise) {
    _loadPromise = getWindowApi().then((mod) => {
      _cachedWindow = mod.getCurrentWindow();
      return _cachedWindow;
    });
  }
  return _loadPromise;
}

if (isTauri) {
  getWindow(); // fire preload immediately
}

export async function startWindowDragging(): Promise<void> {
  if (!isTauri) return;
  const win = await getWindow();
  await win.startDragging();
}

export async function closeWindow(): Promise<void> {
  if (!isTauri) return;
  const win = await getWindow();
  await win.hide();
}

export async function setWindowAlwaysOnTop(value: boolean): Promise<void> {
  if (!isTauri) return;
  const win = await getWindow();
  await win.setAlwaysOnTop(value);
}

export async function getCurrentTauriWindow(): Promise<any | null> {
  if (!isTauri) return null;
  try {
    return await getWindow();
  } catch {
    return null;
  }
}

export async function detectDockedEdge(): Promise<EdgeSide> {
  if (!isTauri) return null;
  const win = await getWindow();
  const [position, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
  // outerPosition/outerSize return physical pixels; scale screen dimensions to match
  const dpr = window.devicePixelRatio || 1;
  const screenWidth = Math.round(window.screen.availWidth * dpr);
  const screenHeight = Math.round(window.screen.availHeight * dpr);
  const threshold = Math.round(EDGE_THRESHOLD * dpr);

  if (position.x <= threshold) return "left";
  if (position.y <= threshold) return "top";
  if (position.x + size.width >= screenWidth - threshold) return "right";
  if (position.y + size.height >= screenHeight - threshold) return "bottom";
  return null;
}

export async function setWindowHidden(edge: EdgeSide, hidden: boolean) {
  if (!isTauri || !edge) return;
  const win = await getWindow();
  const [position, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
  const dpr = window.devicePixelRatio || 1;
  const screenWidth = Math.round(window.screen.availWidth * dpr);
  const screenHeight = Math.round(window.screen.availHeight * dpr);

  const nextPosition = getEdgeWindowPosition(edge, hidden, position, size, {
    width: screenWidth,
    height: screenHeight,
  });

  await win.setPosition({
    type: "Physical",
    ...nextPosition,
  });
}

export async function isCursorInRevealStrip(edge: EdgeSide): Promise<boolean> {
  if (!isTauri || !edge) return false;
  const win = await getWindow();
  const windowApi = await getWindowApi();
  const [cursor, position, size] = await Promise.all([
    windowApi.cursorPosition(),
    win.outerPosition(),
    win.outerSize(),
  ]);

  return isCursorInsideVisibleStrip(edge, cursor, position, size);
}

type PhysicalPosition = { x: number; y: number };
type PhysicalSize = { width: number; height: number };
type DockedEdge = Exclude<EdgeSide, null>;

export function getEdgeWindowPosition(
  edge: DockedEdge,
  hidden: boolean,
  position: PhysicalPosition,
  size: PhysicalSize,
  screen: PhysicalSize
): PhysicalPosition {
  const visiblePosition = {
    left: { x: 0, y: clamp(position.y, 0, screen.height - size.height) },
    right: { x: screen.width - size.width, y: clamp(position.y, 0, screen.height - size.height) },
    top: { x: clamp(position.x, 0, screen.width - size.width), y: 0 },
    bottom: { x: clamp(position.x, 0, screen.width - size.width), y: screen.height - size.height },
  }[edge];

  const hiddenPosition = {
    left: { x: REVEAL_STRIP_SIZE - size.width, y: visiblePosition.y },
    right: { x: screen.width - REVEAL_STRIP_SIZE, y: visiblePosition.y },
    top: { x: visiblePosition.x, y: REVEAL_STRIP_SIZE - size.height },
    bottom: { x: visiblePosition.x, y: screen.height - REVEAL_STRIP_SIZE },
  }[edge];

  return hidden ? hiddenPosition : visiblePosition;
}

export function isCursorInsideVisibleStrip(
  edge: DockedEdge,
  cursor: PhysicalPosition,
  position: PhysicalPosition,
  size: PhysicalSize
): boolean {
  const withinY = cursor.y >= position.y && cursor.y <= position.y + size.height;
  const withinX = cursor.x >= position.x && cursor.x <= position.x + size.width;

  if (edge === "left") {
    const stripStart = position.x + size.width - REVEAL_STRIP_SIZE;
    const stripEnd = position.x + size.width;
    return withinY && cursor.x >= stripStart && cursor.x <= stripEnd;
  }

  if (edge === "right") {
    const stripStart = position.x;
    const stripEnd = position.x + REVEAL_STRIP_SIZE;
    return withinY && cursor.x >= stripStart && cursor.x <= stripEnd;
  }

  if (edge === "top") {
    const stripStart = position.y + size.height - REVEAL_STRIP_SIZE;
    const stripEnd = position.y + size.height;
    return withinX && cursor.y >= stripStart && cursor.y <= stripEnd;
  }

  const stripStart = position.y;
  const stripEnd = position.y + REVEAL_STRIP_SIZE;
  return withinX && cursor.y >= stripStart && cursor.y <= stripEnd;
}

export async function onWindowMoved(callback: () => void): Promise<() => void> {
  if (!isTauri) return () => {};
  const win = await getWindow();
  return win.onMoved(callback);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
