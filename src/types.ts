export type EdgeSide = "left" | "right" | "top" | "bottom" | null;

export type ImageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  createdAt: number;
};

export type Priority = {
  id: string;
  name: string;
  order: number;
};

export type PriorityTemplate = {
  id: string;
  name: string;
  priorities: Priority[];
};

export type Todo = {
  id: string;
  text: string;
  priorityId: string;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
  sortIndex: number;
  attachments: ImageAttachment[];
};

export type TodoPage = {
  id: string;
  title: string;
  color: string;
  templateId: string;
  todos: Todo[];
};

export type WindowPrefs = {
  edge: EdgeSide;
  hidden: boolean;
};

export type AppState = {
  schemaVersion: number;
  templates: PriorityTemplate[];
  pages: TodoPage[];
  activePageId: string;
  windowPrefs: WindowPrefs;
};
