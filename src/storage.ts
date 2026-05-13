import { DEFAULT_STATE } from "./defaults";
import type { AppState } from "./types";

const STORAGE_KEY = "edge-todos-state-v1";

export function loadState(): AppState {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return DEFAULT_STATE;
  }

  try {
    const parsed = JSON.parse(raw) as AppState;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      templates: parsed.templates?.length ? parsed.templates : DEFAULT_STATE.templates,
      todos: Array.isArray(parsed.todos) ? parsed.todos : DEFAULT_STATE.todos,
      windowPrefs: {
        ...DEFAULT_STATE.windowPrefs,
        ...parsed.windowPrefs,
      },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveState(state: AppState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
