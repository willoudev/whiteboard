import {
  computeBoundTextPosition,
  getBoundTextElement,
  getBoundTextElementId,
  newElementWith,
} from "@excalidraw/element";

import type { ExcalidrawElement, ElementsMap } from "@excalidraw/element/types";

import { KanbanElementsBuilder, CONTAINER_COLORS, newBoardId, newElementId } from "./elements";
import {
  addCardButtonLayout,
  asRect,
  cardLayout,
  containerHeightForCardCount,
  containerX,
  deleteContainerButtonLayout,
  getBoardCards,
  getBoardContainers,
  getContainerCards,
  rectCenter,
  rectContains,
  scaleForContainerWidth,
  CONTAINER_GAP,
  CONTAINER_WIDTH,
  ADD_CONTAINER_BUTTON_WIDTH,
} from "./layout";
import { isKanbanData, type KanbanCardData, type KanbanContainerData } from "./types";

/** Moves/resizes an element and, crucially, its bound label text along
 * with it — Excalidraw only keeps a bound text glued to its container
 * automatically during an *interactive* drag/resize; a programmatic
 * `updateScene` that changes a container's x/y/width/height on its own
 * leaves the label exactly where it was, visibly detached from its box. */
const moveElement = (
  elementsMap: ElementsMap,
  updates: Map<string, ExcalidrawElement>,
  element: ExcalidrawElement,
  patch: Partial<Pick<ExcalidrawElement, "x" | "y" | "width" | "height">>,
) => {
  const updated = newElementWith(element, patch);
  updates.set(element.id, updated);
  const boundText = getBoundTextElement(element, elementsMap);
  if (boundText) {
    const pos = computeBoundTextPosition(updated, boundText, elementsMap);
    updates.set(boundText.id, newElementWith(boundText, { x: pos.x, y: pos.y }));
  }
  return updated;
};

/** Applies a set of element replacements (and appends any brand-new
 * elements) to the full scene array, leaving everything unrelated to this
 * board untouched. */
const applyUpdates = (
  elements: readonly ExcalidrawElement[],
  updates: Map<string, ExcalidrawElement>,
  additions: ExcalidrawElement[],
): ExcalidrawElement[] => [
  ...elements.map((el) => updates.get(el.id) ?? el),
  ...additions,
];

/** Moves the given elements to the end of the array (highest paint
 * order), preserving everyone else's relative order. A card's z-order
 * only ever matches its *original* container's position in the array —
 * dragging it into a container created later keeps it at its old
 * (lower) paint order, so that later container's opaque background
 * silently paints over it even though its x/y/customData are all
 * correct. `updateScene` re-derives each element's fractional `.index`
 * from array position (`syncInvalidIndices`, called internally), so
 * physically moving it here is enough — no manual index math needed. */
const bringToFront = (
  elements: readonly ExcalidrawElement[],
  ids: ReadonlySet<string>,
): ExcalidrawElement[] => {
  if (ids.size === 0) {
    return elements as ExcalidrawElement[];
  }
  const front: ExcalidrawElement[] = [];
  const rest: ExcalidrawElement[] = [];
  for (const el of elements) {
    (ids.has(el.id) ? front : rest).push(el);
  }
  return [...rest, ...front];
};

/** Recomputes every visual position/size for a board from its current
 * container order + card containerId/order assignments — the single place
 * that turns "which container is this card logically in, at what index"
 * into actual x/y/width/height. Called after every mutation (add/delete
 * container, add card, reorder-after-drag) and after a native resize of
 * the (grouped) containers finishes. */
export const reflowBoard = (
  elements: readonly ExcalidrawElement[],
  boardId: string,
): ExcalidrawElement[] => {
  const containers = getBoardContainers(elements, boardId).sort(
    (a, b) =>
      (a.customData as KanbanContainerData).order -
      (b.customData as KanbanContainerData).order,
  );
  if (containers.length === 0) {
    return elements as ExcalidrawElement[];
  }

  const anchor = containers[0];
  const scale = scaleForContainerWidth(anchor.width);
  const updates = new Map<string, ExcalidrawElement>();
  const elementsMap: ElementsMap = new Map(elements.map((el) => [el.id, el]));

  containers.forEach((container, index) => {
    const cards = getContainerCards(elements, boardId, container.id).sort(
      (a, b) =>
        (a.customData as KanbanCardData).order -
        (b.customData as KanbanCardData).order,
    );
    const newX = containerX(anchor.x, index, scale);
    const newHeight = containerHeightForCardCount(cards.length, scale);
    const rect = { x: newX, y: container.y, width: container.width, height: newHeight };

    moveElement(elementsMap, updates, container, { x: newX, height: newHeight });

    cards.forEach((card, cardIndex) => {
      const layout = cardLayout(rect, cardIndex);
      moveElement(elementsMap, updates, card, {
        x: layout.x,
        y: layout.y,
        width: layout.width,
        height: layout.height,
      });
    });

    const addBtnLayout = addCardButtonLayout(rect, cards.length);
    const addBtn = findByRole(elements, boardId, "addCardButton", container.id);
    if (addBtn) {
      moveElement(elementsMap, updates, addBtn, {
        x: addBtnLayout.x,
        y: addBtnLayout.y,
        width: addBtnLayout.width,
        height: addBtnLayout.height,
      });
    }

    const delBtnLayout = deleteContainerButtonLayout(rect);
    const delBtn = findByRole(
      elements,
      boardId,
      "deleteContainerButton",
      container.id,
    );
    if (delBtn) {
      moveElement(elementsMap, updates, delBtn, {
        x: delBtnLayout.x,
        y: delBtnLayout.y,
        width: delBtnLayout.width,
        height: delBtnLayout.height,
      });
    }
  });

  const lastRect = (() => {
    const last = containers[containers.length - 1];
    const updated = updates.get(last.id) ?? last;
    return asRect(updated);
  })();
  const addContainerBtn = findByRole(elements, boardId, "addContainerButton");
  if (addContainerBtn) {
    moveElement(elementsMap, updates, addContainerBtn, {
      x: lastRect.x + lastRect.width + CONTAINER_GAP * scale,
      y: lastRect.y,
      width: ADD_CONTAINER_BUTTON_WIDTH * scale,
      height: lastRect.height > 0 ? Math.min(lastRect.height, 64 * scale) : 64 * scale,
    });
  }

  const next = applyUpdates(elements, updates, []);

  // Cards must always paint above every container of this board — see
  // `bringToFront`'s doc comment. Re-asserted on every reflow (not just
  // after a drag) so this holds regardless of what caused it.
  const cardAndLabelIds = new Set<string>();
  const nextElementsMap: ElementsMap = new Map(next.map((el) => [el.id, el]));
  for (const card of getBoardCards(next, boardId)) {
    cardAndLabelIds.add(card.id);
    const boundText = getBoundTextElement(card, nextElementsMap);
    if (boundText) {
      cardAndLabelIds.add(boundText.id);
    }
  }
  return bringToFront(next, cardAndLabelIds);
};

const findByRole = (
  elements: readonly ExcalidrawElement[],
  boardId: string,
  role: "addCardButton" | "deleteContainerButton" | "addContainerButton",
  containerId?: string,
) =>
  elements.find(
    (el) =>
      !el.isDeleted &&
      isKanbanData(el.customData) &&
      el.customData.boardId === boardId &&
      el.customData.role === role &&
      (role === "addContainerButton" ||
        (el.customData as any).containerId === containerId),
  );

export const buildInitialBoardElements = (
  cx: number,
  cy: number,
): ExcalidrawElement[] => {
  const boardId = newBoardId();
  const builder = new KanbanElementsBuilder();

  const columns: { title: string; cards: string[] }[] = [
    { title: "À faire", cards: ["Tâche à faire", "Autre tâche"] },
    { title: "En cours", cards: ["Tâche en cours"] },
    { title: "Terminé", cards: ["Tâche terminée"] },
  ];
  const maxCards = Math.max(...columns.map((c) => c.cards.length));
  const height = containerHeightForCardCount(maxCards);
  const totalWidth =
    columns.length * (CONTAINER_WIDTH + CONTAINER_GAP) -
    CONTAINER_GAP +
    CONTAINER_GAP +
    ADD_CONTAINER_BUTTON_WIDTH;
  const boardX = cx - totalWidth / 2;
  const boardY = cy - height / 2;

  columns.forEach((column, index) => {
    const containerId = newElementId();
    const x = containerX(boardX, index);
    builder.addContainer({
      id: containerId,
      boardId,
      x,
      y: boardY,
      title: column.title,
      color: CONTAINER_COLORS[index % CONTAINER_COLORS.length],
      order: index,
      height,
    });
    const containerRect = { x, y: boardY, width: CONTAINER_WIDTH, height };
    column.cards.forEach((text, cardIndex) => {
      builder.addCard({
        id: newElementId(),
        boardId,
        containerId,
        container: containerRect,
        order: cardIndex,
        text,
        color: CONTAINER_COLORS[index % CONTAINER_COLORS.length],
      });
    });
    builder.addCardButton({
      id: newElementId(),
      boardId,
      containerId,
      container: containerRect,
      cardCount: column.cards.length,
    });
    builder.addDeleteContainerButton({
      id: newElementId(),
      boardId,
      containerId,
      container: containerRect,
    });
  });

  const lastX = containerX(boardX, columns.length - 1);
  builder.addAddContainerButton({
    id: newElementId(),
    boardId,
    x: lastX + CONTAINER_WIDTH + CONTAINER_GAP,
    y: boardY,
  });

  return builder.build();
};

export const addCardToContainer = (
  elements: readonly ExcalidrawElement[],
  boardId: string,
  containerId: string,
): ExcalidrawElement[] => {
  const container = elements.find((el) => el.id === containerId);
  if (!container) {
    return elements as ExcalidrawElement[];
  }
  const existing = getContainerCards(elements, boardId, containerId);
  const order = existing.length;
  const builder = new KanbanElementsBuilder();
  builder.addCard({
    id: newElementId(),
    boardId,
    containerId,
    container: asRect(container),
    order,
    text: "Nouvelle tâche",
    color: CONTAINER_COLORS[order % CONTAINER_COLORS.length],
  });
  const withNewCard = [...elements, ...builder.build()];
  return reflowBoard(withNewCard, boardId);
};

export const deleteContainer = (
  elements: readonly ExcalidrawElement[],
  boardId: string,
  containerId: string,
): ExcalidrawElement[] => {
  const toDelete = new Set<string>([containerId]);
  for (const el of elements) {
    if (!isKanbanData(el.customData) || el.customData.boardId !== boardId) {
      continue;
    }
    if (
      el.customData.role === "card" &&
      el.customData.containerId === containerId
    ) {
      toDelete.add(el.id);
    }
    if (
      (el.customData.role === "addCardButton" ||
        el.customData.role === "deleteContainerButton") &&
      el.customData.containerId === containerId
    ) {
      toDelete.add(el.id);
    }
  }
  // Bound label text is a separate element — deleting a container/card/
  // button doesn't cascade to its label on its own.
  for (const id of Array.from(toDelete)) {
    const el = elements.find((e) => e.id === id);
    const textId = el ? getBoundTextElementId(el) : null;
    if (textId) {
      toDelete.add(textId);
    }
  }

  const remainingContainers = getBoardContainers(elements, boardId)
    .filter((c) => c.id !== containerId)
    .sort(
      (a, b) =>
        (a.customData as KanbanContainerData).order -
        (b.customData as KanbanContainerData).order,
    );

  const updates = new Map<string, ExcalidrawElement>();
  for (const el of elements) {
    if (toDelete.has(el.id)) {
      updates.set(el.id, newElementWith(el, { isDeleted: true }));
    }
  }
  remainingContainers.forEach((container, index) => {
    updates.set(
      container.id,
      newElementWith(container, {
        customData: { ...(container.customData as KanbanContainerData), order: index },
      }),
    );
  });

  const next = applyUpdates(elements, updates, []);
  return reflowBoard(next, boardId);
};

export const addContainer = (
  elements: readonly ExcalidrawElement[],
  boardId: string,
): ExcalidrawElement[] => {
  const containers = getBoardContainers(elements, boardId);
  const order = containers.length;
  const reference = containers[0];
  const y = reference ? reference.y : 0;
  const width = reference ? reference.width : CONTAINER_WIDTH;
  const scale = scaleForContainerWidth(width);

  const containerId = newElementId();
  const builder = new KanbanElementsBuilder();
  builder.addContainer({
    id: containerId,
    boardId,
    x: 0, // reflowBoard() repositions every container from `order` right away
    y,
    title: "Nouveau",
    color: CONTAINER_COLORS[order % CONTAINER_COLORS.length],
    order,
    height: containerHeightForCardCount(0, scale),
  });
  const containerRect = { x: 0, y, width, height: containerHeightForCardCount(0, scale) };
  builder.addCardButton({
    id: newElementId(),
    boardId,
    containerId,
    container: containerRect,
    cardCount: 0,
  });
  builder.addDeleteContainerButton({
    id: newElementId(),
    boardId,
    containerId,
    container: containerRect,
  });

  const withNewContainer = [...elements, ...builder.build()];
  return reflowBoard(withNewContainer, boardId);
};

/** Called once a card drag finishes: figures out which container the card
 * was dropped into (by its current center point) and where among that
 * container's existing cards it lands, then commits the new
 * containerId/order and snaps everything into place via reflowBoard. */
export const reorderCardAfterDrag = (
  elements: readonly ExcalidrawElement[],
  boardId: string,
  cardId: string,
): ExcalidrawElement[] => {
  const card = elements.find((el) => el.id === cardId);
  if (!card || !isKanbanData(card.customData) || card.customData.role !== "card") {
    return elements as ExcalidrawElement[];
  }
  const cardData = card.customData as KanbanCardData;
  const containers = getBoardContainers(elements, boardId);
  const center = rectCenter(asRect(card));
  const target =
    containers.find((c) => rectContains(asRect(c), center)) ??
    containers.find((c) => c.id === cardData.containerId);
  if (!target) {
    return elements as ExcalidrawElement[];
  }

  const updates = new Map<string, ExcalidrawElement>();
  const sourceContainerId = cardData.containerId;

  const targetSiblings = getContainerCards(elements, boardId, target.id).filter(
    (c) => c.id !== cardId,
  );
  const targetSorted = [...targetSiblings, card].sort((a, b) => a.y - b.y);
  targetSorted.forEach((c, index) => {
    updates.set(
      c.id,
      newElementWith(c, {
        customData: {
          kanban: true,
          boardId,
          role: "card",
          containerId: target.id,
          order: index,
        },
      }),
    );
  });

  if (sourceContainerId !== target.id) {
    const sourceSiblings = getContainerCards(elements, boardId, sourceContainerId)
      .filter((c) => c.id !== cardId)
      .sort(
        (a, b) =>
          (a.customData as KanbanCardData).order -
          (b.customData as KanbanCardData).order,
      );
    sourceSiblings.forEach((c, index) => {
      updates.set(
        c.id,
        newElementWith(c, {
          customData: { ...(c.customData as KanbanCardData), order: index },
        }),
      );
    });
  }

  const next = applyUpdates(elements, updates, []);
  return reflowBoard(next, boardId);
};

/** Shifts every card belonging to this board by (dx, dy) — used to keep
 * cards visually attached when the (grouped) containers are dragged as a
 * whole, since cards deliberately aren't part of that native group (so
 * they stay individually, single-click draggable between containers). */
export const translateBoardCards = (
  elements: readonly ExcalidrawElement[],
  boardId: string,
  dx: number,
  dy: number,
): ExcalidrawElement[] => {
  if (dx === 0 && dy === 0) {
    return elements as ExcalidrawElement[];
  }
  const updates = new Map<string, ExcalidrawElement>();
  const elementsMap: ElementsMap = new Map(elements.map((el) => [el.id, el]));
  for (const card of getBoardCards(elements, boardId)) {
    moveElement(elementsMap, updates, card, { x: card.x + dx, y: card.y + dy });
  }
  return applyUpdates(elements, updates, []);
};
