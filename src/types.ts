export type EdgeSide = "left" | "right" | "top" | "bottom" | null;

export type ImageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  createdAt: number;
};

export type TodoTextStyle = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string;
  highlight: string;
  link: string;
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
  completedAt: number | null;
  plannedAt: number | null;
  createdAt: number;
  updatedAt: number;
  sortIndex: number;
  attachments: ImageAttachment[];
  style: TodoTextStyle;
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
