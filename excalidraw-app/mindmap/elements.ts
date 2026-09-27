import { convertToExcalidrawElements, newElementWith } from "@excalidraw/element";
import { randomId } from "@excalidraw/common";

import type { ExcalidrawElementSkeleton } from "@excalidraw/element";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import { connectorGeometry, type Point } from "./layout";
import type { MindmapElementData } from "./types";

export const ADD_CHILD_BUTTON_SIZE = 26;

/** Where a node's "+" button sits relative to its own top-left/size —
 * just past its right edge, vertically centered. Shared by both the
 * builder (initial placement) and reflow (keeping it glued on move). */
export const addChildButtonOffset = (nodeWidth: number, nodeHeight: number) => ({
  dx: nodeWidth + 6,
  dy: nodeHeight / 2 - ADD_CHILD_BUTTON_SIZE / 2,
});

type Tag = { customData: MindmapElementData; locked?: boolean };

/** Accumulates skeleton fragments plus the (customData/locked) every
 * element referenced by a known id should get once converted — the
 * skeleton format itself has no room for those fields. Mirrors
 * `KanbanElementsBuilder`. */
export class MindmapElementsBuilder {
  skeleton: ExcalidrawElementSkeleton[] = [];
  private tags = new Map<string, Tag>();

  addNode(opts: {
    id: string;
    boardId: string;
    parentId: string | null;
    order: number;
    angle: number;
    color: string;
    x: number;
    y: number;
    text: string;
    fontSize: number;
  }) {
    this.skeleton.push({
      type: "text",
      id: opts.id,
      x: opts.x,
      y: opts.y,
      text: opts.text,
      fontSize: opts.fontSize,
      strokeColor: opts.color,
    });
    this.tags.set(opts.id, {
      customData: {
        mindmap: true,
        boardId: opts.boardId,
        role: "node",
        parentId: opts.parentId,
        order: opts.order,
        angle: opts.angle,
        color: opts.color,
        lastX: opts.x,
        lastY: opts.y,
      },
    });
    return opts.id;
  }

  /** Deliberately NOT bound (no start/end id) to either node — as of
   * @excalidraw/element 2.2.x, convertToExcalidrawElements's binding path
   * for an arrow endpoint referencing an existing plain text element
   * unconditionally recomputes and overwrites that text element's x/y,
   * ignoring the *other* endpoint — which would silently relocate nodes
   * on top of each other. The connector's geometry is instead
   * recalculated from both live node positions on every reflow tick (see
   * board.ts), so it still tracks a dragged node — just not through
   * Excalidraw's own binding. */
  addConnector(opts: {
    id: string;
    boardId: string;
    parentId: string;
    childId: string;
    from: Point;
    to: Point;
    color: string;
  }) {
    const geo = connectorGeometry(opts.from, opts.to);
    this.skeleton.push({
      type: "arrow",
      id: opts.id,
      x: geo.x,
      y: geo.y,
      points: geo.points,
      roundness: { type: 2 },
      strokeColor: opts.color,
      strokeWidth: 2,
      startArrowhead: null,
      endArrowhead: null,
    });
    this.tags.set(opts.id, {
      customData: {
        mindmap: true,
        boardId: opts.boardId,
        role: "connector",
        parentId: opts.parentId,
        childId: opts.childId,
      },
    });
    return opts.id;
  }

  addChildButton(opts: {
    id: string;
    boardId: string;
    nodeId: string;
    x: number;
    y: number;
  }) {
    this.skeleton.push({
      type: "rectangle",
      id: opts.id,
      x: opts.x,
      y: opts.y,
      width: ADD_CHILD_BUTTON_SIZE,
      height: ADD_CHILD_BUTTON_SIZE,
      backgroundColor: "#f1f3f5",
      strokeColor: "#868e96",
      roundness: { type: 3 },
      label: { text: "+", fontSize: 13, textAlign: "center" },
    });
    this.tags.set(opts.id, {
      customData: {
        mindmap: true,
        boardId: opts.boardId,
        role: "addChildButton",
        nodeId: opts.nodeId,
      },
      locked: true,
    });
    return opts.id;
  }

  /** Converts the accumulated skeleton fragments into real elements and
   * applies the customData/locked tags. `regenerateIds: false` because we
   * generate our own globally-unique ids up front (via `randomId()`)
   * specifically so we can reference them (e.g. a connector's
   * parentId/childId) before conversion happens. */
  build(): ExcalidrawElement[] {
    const converted = convertToExcalidrawElements(this.skeleton, {
      regenerateIds: false,
    });
    return converted.map((el) => {
      const tag = this.tags.get(el.id);
      if (!tag) {
        return el;
      }
      return newElementWith(el, {
        customData: tag.customData,
        locked: tag.locked ?? el.locked,
      });
    });
  }
}

export const newBoardId = () => randomId();
export const newElementId = () => randomId();
