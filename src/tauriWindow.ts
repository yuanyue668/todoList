import type { EdgeSide } from "./types";

export const isTauri = "__TAURI_INTERNALS__" in window;
const STRIP_SIZE = 8;
const EDGE_THRESHOLD = 28;

// Pre-cache the window reference at module init so startDragging() has no import latency
// on Windows/WebView2 the first dynamic import can be slow enough to miss the drag context
let _cachedWindow: any = null;
let _loadPromise: Promise<any> | null = null;

function getWindow(): Promise<any> {
  if (_cachedWindow) return Promise.resolve(_cachedWindow);
  if (!_loadPromise) {
    _loadPromise = import("@tauri-apps/api/window").then((mod) => {
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
  const screenWidth = window.screen.availWidth;
  const screenHeight = window.screen.availHeight;

  if (position.x <= EDGE_THRESHOLD) return "left";
  if (position.y <= EDGE_THRESHOLD) return "top";
  if (position.x + size.width >= screenWidth - EDGE_THRESHOLD) return "right";
  if (position.y + size.height >= screenHeight - EDGE_THRESHOLD) return "bottom";
  return null;
}

export async function setWindowHidden(edge: EdgeSide, hidden: boolean) {
  if (!isTauri || !edge) return;
  const win = await getWindow();
  const [position, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
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

  await win.setPosition({
    type: "Physical",
    ...(hidden ? hiddenPosition : visiblePosition),
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
