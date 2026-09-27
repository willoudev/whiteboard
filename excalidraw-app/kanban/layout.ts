import type { ExcalidrawElement } from "@excalidraw/element/types";

import { isKanbanData, type KanbanContainerData } from "./types";

/** All sizes below are for a freshly-inserted board (scale === 1). Actual
 * on-canvas sizes are derived from a container's *live* width via
 * `scaleForContainerWidth`, so resizing the (grouped) containers natively
 * scales every card that's laid out relative to them too — see
 * `useKanbanBoardInteractions`. */
export const CONTAINER_WIDTH = 300;
export const CONTAINER_GAP = 40;
export const CONTAINER_HEADER_HEIGHT = 64;
export const CONTAINER_PADDING = 18;
export const CONTAINER_MIN_HEIGHT = 220;
export const CARD_WIDTH = CONTAINER_WIDTH - CONTAINER_PADDING * 2;
export const CARD_HEIGHT = 80;
export const CARD_GAP = 14;
export const BUTTON_SIZE = 32;
export const ADD_CONTAINER_BUTTON_WIDTH = 160;
export const ADD_CONTAINER_BUTTON_HEIGHT = 64;

export type Rect = { x: number; y: number; width: number; height: number };

export const rectContains = (rect: Rect, point: { x: number; y: number }) =>
  point.x >= rect.x &&
  point.x <= rect.x + rect.width &&
  point.y >= rect.y &&
  point.y <= rect.y + rect.height;

export const rectCenter = (rect: Rect) => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
});

/** How much bigger/smaller this container currently is versus a freshly
 * inserted one, derived purely from its live width. Used to scale every
 * other measurement (cards, gaps, header) so a native group-resize of the
 * containers proportionally affects the cards too, without us having to
 * track resize deltas ourselves. */
export const scaleForContainerWidth = (containerWidth: number) =>
  containerWidth / CONTAINER_WIDTH;

export const containerX = (boardX: number, order: number, scale = 1) =>
  boardX + order * (CONTAINER_WIDTH + CONTAINER_GAP) * scale;

export const cardLayout = (container: Rect, order: number) => {
  const scale = scaleForContainerWidth(container.width);
  return {
    x: container.x + CONTAINER_PADDING * scale,
    y:
      container.y +
      CONTAINER_HEADER_HEIGHT * scale +
      order * (CARD_HEIGHT + CARD_GAP) * scale,
    width: container.width - CONTAINER_PADDING * 2 * scale,
    height: CARD_HEIGHT * scale,
  };
};

export const addCardButtonLayout = (container: Rect, cardCount: number) => {
  const scale = scaleForContainerWidth(container.width);
  return {
    x: container.x + CONTAINER_PADDING * scale,
    y:
      container.y +
      CONTAINER_HEADER_HEIGHT * scale +
      cardCount * (CARD_HEIGHT + CARD_GAP) * scale,
    width: container.width - CONTAINER_PADDING * 2 * scale,
    height: BUTTON_SIZE * scale,
  };
};

export const deleteContainerButtonLayout = (container: Rect) => {
  const scale = scaleForContainerWidth(container.width);
  const size = BUTTON_SIZE * scale;
  return {
    x: container.x + container.width - size - 8 * scale,
    y: container.y + 8 * scale,
    width: size,
    height: size,
  };
};

/** Order-swap arrows, top-left of the header — mirrors the delete "×" at
 * top-right. */
export const reorderButtonLayout = (
  container: Rect,
  which: "left" | "right",
) => {
  const scale = scaleForContainerWidth(container.width);
  const size = BUTTON_SIZE * scale;
  return {
    x: container.x + 8 * scale + (which === "right" ? size + 4 * scale : 0),
    y: container.y + 8 * scale,
    width: size,
    height: size,
  };
};

/** Stacks cards top-to-bottom using each card's *own current* height
 * (rather than a fixed formula), so a card that grew taller — its bound
 * text wrapped to more lines — pushes the ones below it down instead of
 * overlapping them. Width still tracks the container (cards stay
 * column-width, only height is content-driven). Only `x`/`y`/`width` are
 * proposed per card; height is deliberately left alone by the caller. */
export const stackContainer = (
  container: Rect,
  cardHeights: readonly number[],
) => {
  const scale = scaleForContainerWidth(container.width);
  const cardX = container.x + CONTAINER_PADDING * scale;
  const cardWidth = container.width - CONTAINER_PADDING * 2 * scale;
  let cursorY = container.y + CONTAINER_HEADER_HEIGHT * scale;
  const cardPositions = cardHeights.map((height) => {
    const pos = { x: cardX, y: cursorY, width: cardWidth };
    cursorY += height + CARD_GAP * scale;
    return pos;
  });
  const addButtonLayout = {
    x: cardX,
    y: cursorY,
    width: cardWidth,
    height: BUTTON_SIZE * scale,
  };
  const containerHeight = Math.max(
    CONTAINER_MIN_HEIGHT * scale,
    cursorY + BUTTON_SIZE * scale + CONTAINER_PADDING * scale - container.y,
  );
  return { cardPositions, addButtonLayout, containerHeight };
};

export const containerHeightForCardCount = (n: number, scale = 1) =>
  Math.max(
    CONTAINER_MIN_HEIGHT * scale,
    (CONTAINER_HEADER_HEIGHT +
      n * (CARD_HEIGHT + CARD_GAP) +
      CARD_GAP +
      BUTTON_SIZE +
      CONTAINER_PADDING) *
      scale,
  );

export const asRect = (element: ExcalidrawElement): Rect => ({
  x: element.x,
  y: element.y,
  width: element.width,
  height: element.height,
});

export const getBoardContainers = (
  elements: readonly ExcalidrawElement[],
  boardId: string,
) =>
  elements.filter(
    (el): el is ExcalidrawElement & { customData: KanbanContainerData } =>
      !el.isDeleted &&
      isKanbanData(el.customData) &&
      el.customData.boardId === boardId &&
      el.customData.role === "container",
  );

export const getContainerCards = (
  elements: readonly ExcalidrawElement[],
  boardId: string,
  containerId: string,
) =>
  elements.filter(
    (el) =>
      !el.isDeleted &&
      isKanbanData(el.customData) &&
      el.customData.boardId === boardId &&
      el.customData.role === "card" &&
      el.customData.containerId === containerId,
  );

export const getBoardCards = (
  elements: readonly ExcalidrawElement[],
  boardId: string,
) =>
  elements.filter(
    (el) =>
      !el.isDeleted &&
      isKanbanData(el.customData) &&
      el.customData.boardId === boardId &&
      el.customData.role === "card",
  );

/** Bounding box of just the containers (not cards/buttons) — used as the
 * board's reference frame for translate/rescale cascades. */
export const containersBoundingBox = (
  elements: readonly ExcalidrawElement[],
  boardId: string,
): Rect | null => {
  const containers = getBoardContainers(elements, boardId);
  if (containers.length === 0) {
    return null;
  }
  const minX = Math.min(...containers.map((c) => c.x));
  const minY = Math.min(...containers.map((c) => c.y));
  const maxX = Math.max(...containers.map((c) => c.x + c.width));
  const maxY = Math.max(...containers.map((c) => c.y + c.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};
