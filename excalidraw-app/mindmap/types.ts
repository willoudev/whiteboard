/** Tags this fork adds to plain Excalidraw elements (via `customData`) to
 * turn a handful of text nodes and curved connectors into an interactive,
 * freely-extensible mind map. Nothing here is special to Excalidraw's own
 * model — it's just data the `useMindmapInteractions` hook reads back out
 * of the scene to decide what a click/drag on a given element should do. */
export type MindmapNodeData = {
  mindmap: true;
  boardId: string;
  role: "node";
  /** Element id of the parent node's text element, or null for the root. */
  parentId: string | null;
  /** Sibling position among this node's own children (0-based), used to
   * spread multiple children of the same parent apart. */
  order: number;
  /** Direction (radians) this node's branch grows in, inherited by its
   * own children so a branch keeps extending outward in one direction. */
  angle: number;
  /** Branch color, inherited by every descendant of a root-level branch. */
  color: string;
  /** Last-known position, used to detect a user-driven drag so the whole
   * subtree (and its connectors) can be cascaded by the same delta —
   * unlike kanban cards, a node's position is free-form and can't be
   * re-derived from its parent alone. */
  lastX: number;
  lastY: number;
};

export type MindmapConnectorData = {
  mindmap: true;
  boardId: string;
  role: "connector";
  parentId: string;
  childId: string;
};

export type MindmapAddChildButtonData = {
  mindmap: true;
  boardId: string;
  role: "addChildButton";
  nodeId: string;
};

/** Decorative circle drawn behind the root topic — see
 * `MindmapElementsBuilder.addRootBackground`. */
export type MindmapRootBackgroundData = {
  mindmap: true;
  boardId: string;
  role: "rootBackground";
  nodeId: string;
};

export type MindmapElementData =
  | MindmapNodeData
  | MindmapConnectorData
  | MindmapAddChildButtonData
  | MindmapRootBackgroundData;

export const isMindmapData = (data: unknown): data is MindmapElementData =>
  !!data && typeof data === "object" && (data as any).mindmap === true;
