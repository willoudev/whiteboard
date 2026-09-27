/** Tags this fork adds to plain Excalidraw elements (via `customData`) to
 * turn a handful of grouped rectangles into an interactive kanban board.
 * Nothing here is special to Excalidraw's own model — it's just data the
 * `useKanbanBoardInteractions` hook reads back out of the scene to decide
 * what a click/drag/resize on a given element should do. */
export type KanbanContainerData = {
  kanban: true;
  boardId: string;
  role: "container";
  /** Horizontal position among this board's containers (0-based). */
  order: number;
};

export type KanbanCardData = {
  kanban: true;
  boardId: string;
  role: "card";
  /** Element id of the container rectangle this card currently belongs to. */
  containerId: string;
  /** Vertical position within its container (0-based). */
  order: number;
};

export type KanbanAddCardButtonData = {
  kanban: true;
  boardId: string;
  role: "addCardButton";
  containerId: string;
};

export type KanbanDeleteContainerButtonData = {
  kanban: true;
  boardId: string;
  role: "deleteContainerButton";
  containerId: string;
};

export type KanbanAddContainerButtonData = {
  kanban: true;
  boardId: string;
  role: "addContainerButton";
};

export type KanbanElementData =
  | KanbanContainerData
  | KanbanCardData
  | KanbanAddCardButtonData
  | KanbanDeleteContainerButtonData
  | KanbanAddContainerButtonData;

export const isKanbanData = (data: unknown): data is KanbanElementData =>
  !!data && typeof data === "object" && (data as any).kanban === true;
