import { convertToExcalidrawElements } from "@excalidraw/element";
import { newElementWith } from "@excalidraw/element";
import { randomId } from "@excalidraw/common";

import type { ExcalidrawElementSkeleton } from "@excalidraw/element";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import {
  addCardButtonLayout,
  cardLayout,
  deleteContainerButtonLayout,
  reorderButtonLayout,
  CONTAINER_WIDTH,
  ADD_CONTAINER_BUTTON_WIDTH,
  ADD_CONTAINER_BUTTON_HEIGHT,
  type Rect,
} from "./layout";
import type { KanbanElementData } from "./types";

/** Cycled through as containers are added, so a board isn't limited to the
 * three starter colors. */
export const CONTAINER_COLORS = [
  "#a5d8ff",
  "#ffec99",
  "#b2f2bb",
  "#ffc9c9",
  "#d0bfff",
  "#ffd8a8",
];

type Tag = { customData: KanbanElementData; locked?: boolean; groupIds?: string[] };

/** Accumulates skeleton fragments plus the (customData/locked/groupIds)
 * every element referenced by a known id should get once converted — the
 * skeleton format itself has no room for those fields. */
export class KanbanElementsBuilder {
  skeleton: ExcalidrawElementSkeleton[] = [];
  private tags = new Map<string, Tag>();

  addContainer(opts: {
    id: string;
    boardId: string;
    x: number;
    y: number;
    title: string;
    color: string;
    order: number;
    height: number;
  }) {
    this.skeleton.push({
      type: "rectangle",
      id: opts.id,
      x: opts.x,
      y: opts.y,
      width: CONTAINER_WIDTH,
      height: opts.height,
      backgroundColor: "#f1f3f5",
      strokeColor: "#adb5bd",
      roundness: { type: 3 },
      label: {
        text: opts.title,
        fontSize: 20,
        verticalAlign: "top",
      },
    });
    this.tags.set(opts.id, {
      customData: {
        kanban: true,
        boardId: opts.boardId,
        role: "container",
        order: opts.order,
      },
      groupIds: [opts.boardId],
    });
    return opts.id;
  }

  addCard(opts: {
    id: string;
    boardId: string;
    containerId: string;
    container: Rect;
    order: number;
    text: string;
    color: string;
  }) {
    const rect = cardLayout(opts.container, opts.order);
    this.skeleton.push({
      type: "stickynote",
      id: opts.id,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      backgroundColor: opts.color,
      label: { text: opts.text, fontSize: 16 },
    });
    this.tags.set(opts.id, {
      customData: {
        kanban: true,
        boardId: opts.boardId,
        role: "card",
        containerId: opts.containerId,
        order: opts.order,
      },
    });
    return opts.id;
  }

  addCardButton(opts: {
    id: string;
    boardId: string;
    containerId: string;
    container: Rect;
    cardCount: number;
  }) {
    const rect = addCardButtonLayout(opts.container, opts.cardCount);
    this.skeleton.push({
      type: "rectangle",
      id: opts.id,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      backgroundColor: "transparent",
      strokeColor: "#868e96",
      strokeStyle: "dashed",
      roundness: { type: 3 },
      label: { text: "+", fontSize: 18, textAlign: "center" },
    });
    this.tags.set(opts.id, {
      customData: {
        kanban: true,
        boardId: opts.boardId,
        role: "addCardButton",
        containerId: opts.containerId,
      },
      locked: true,
      groupIds: [opts.boardId],
    });
    return opts.id;
  }

  addDeleteContainerButton(opts: {
    id: string;
    boardId: string;
    containerId: string;
    container: Rect;
  }) {
    const rect = deleteContainerButtonLayout(opts.container);
    this.skeleton.push({
      type: "rectangle",
      id: opts.id,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      backgroundColor: "#f1f3f5",
      strokeColor: "#e03131",
      roundness: { type: 3 },
      label: { text: "×", fontSize: 18, strokeColor: "#e03131", textAlign: "center" },
    });
    this.tags.set(opts.id, {
      customData: {
        kanban: true,
        boardId: opts.boardId,
        role: "deleteContainerButton",
        containerId: opts.containerId,
      },
      locked: true,
      groupIds: [opts.boardId],
    });
    return opts.id;
  }

  addReorderButton(opts: {
    id: string;
    boardId: string;
    containerId: string;
    container: Rect;
    which: "left" | "right";
  }) {
    const rect = reorderButtonLayout(opts.container, opts.which);
    this.skeleton.push({
      type: "rectangle",
      id: opts.id,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      backgroundColor: "transparent",
      strokeColor: "#868e96",
      roundness: { type: 3 },
      label: {
        text: opts.which === "left" ? "◀" : "▶",
        fontSize: 14,
        textAlign: "center",
      },
    });
    this.tags.set(opts.id, {
      customData: {
        kanban: true,
        boardId: opts.boardId,
        role:
          opts.which === "left"
            ? "moveContainerLeftButton"
            : "moveContainerRightButton",
        containerId: opts.containerId,
      },
      locked: true,
      groupIds: [opts.boardId],
    });
    return opts.id;
  }

  addAddContainerButton(opts: {
    id: string;
    boardId: string;
    x: number;
    y: number;
  }) {
    this.skeleton.push({
      type: "rectangle",
      id: opts.id,
      x: opts.x,
      y: opts.y,
      width: ADD_CONTAINER_BUTTON_WIDTH,
      height: ADD_CONTAINER_BUTTON_HEIGHT,
      backgroundColor: "transparent",
      strokeColor: "#868e96",
      strokeStyle: "dashed",
      roundness: { type: 3 },
      label: { text: "+ Conteneur", fontSize: 16, textAlign: "center" },
    });
    this.tags.set(opts.id, {
      customData: {
        kanban: true,
        boardId: opts.boardId,
        role: "addContainerButton",
      },
      locked: true,
      groupIds: [opts.boardId],
    });
    return opts.id;
  }

  /** Converts the accumulated skeleton fragments into real elements and
   * applies the customData/locked/groupIds tags. `regenerateIds: false`
   * because we generate our own globally-unique ids up front (via
   * `randomId()`) specifically so we can reference them (e.g. a card's
   * `containerId`) before conversion happens. */
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
        groupIds: tag.groupIds ?? el.groupIds,
      });
    });
  }
}

export const newBoardId = () => randomId();
export const newElementId = () => randomId();
