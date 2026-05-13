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

export type WindowPrefs = {
  edge: EdgeSide;
  hidden: boolean;
};

export type AppState = {
  templates: PriorityTemplate[];
  activeTemplateId: string;
  todos: Todo[];
  windowPrefs: WindowPrefs;
};
