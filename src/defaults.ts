import type { AppState, PriorityTemplate } from "./types";

const now = Date.now();

export const BUILT_IN_TEMPLATES: PriorityTemplate[] = [
  {
    id: "matrix",
    name: "四象限优先级",
    priorities: [
      { id: "matrix-urgent-important", name: "🔥 紧急且重要", order: 0 },
      { id: "matrix-urgent-not-important", name: "⚡ 紧急但不重要", order: 1 },
      { id: "matrix-important-not-urgent", name: "⭐ 重要但不紧急", order: 2 },
      { id: "matrix-neither", name: "🌿 不紧急也不重要", order: 3 },
    ],
  },
  {
    id: "levels",
    name: "高/中/低优先级",
    priorities: [
      { id: "level-high", name: "🔴 高优先级", order: 0 },
      { id: "level-medium", name: "🟡 中优先级", order: 1 },
      { id: "level-low", name: "🟢 低优先级", order: 2 },
    ],
  },
];

export const DEFAULT_STATE: AppState = {
  templates: BUILT_IN_TEMPLATES,
  activeTemplateId: "matrix",
  windowPrefs: {
    edge: null,
    hidden: false,
  },
  todos: [
    {
      id: "sample-1",
      text: "任务一（已完成）",
      priorityId: "matrix-urgent-important",
      completed: true,
      createdAt: now - 3000,
      updatedAt: now - 1000,
      sortIndex: 0,
      attachments: [],
    },
    {
      id: "sample-2",
      text: "任务二（未完成） :sparkles:",
      priorityId: "matrix-urgent-important",
      completed: false,
      createdAt: now - 2000,
      updatedAt: now - 2000,
      sortIndex: 1,
      attachments: [],
    },
    {
      id: "sample-3",
      text: "任务三（未完成）",
      priorityId: "matrix-important-not-urgent",
      completed: false,
      createdAt: now - 1000,
      updatedAt: now - 1000,
      sortIndex: 2,
      attachments: [],
    },
  ],
};
