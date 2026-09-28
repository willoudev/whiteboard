import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { newElementWith } from "@excalidraw/element";
import { viewportCoordsToSceneCoords } from "@excalidraw/common";
import { useEffect } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import { DEFAULT_NODE_TEXT, addChildNode, deleteNode, reflowMindmap } from "./board";
import { asRect, rectContains } from "./layout";
import { startEditingNode } from "./startTextEditing";
import { isMindmapData } from "./types";

/** Adds a child under `parentId` and immediately starts editing it —
 * the shared tail end of both the "+" button click and the Enter-adds-
 * a-sibling shortcut below (a sibling is just another child of the
 * *current* node's own parent). */
const insertChildAndEdit = (
  excalidrawAPI: ExcalidrawImperativeAPI,
  boardId: string,
  parentId: string,
) => {
  const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
  const added = addChildNode(elements, boardId, parentId);
  if (!added) {
    return;
  }
  excalidrawAPI.updateScene({
    elements: added.elements,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  startEditingNode(excalidrawAPI, added.newNodeId);
};

/** Drags the whole mind map by dragging just its root node — the same
 * single-node drag `reflowMindmap`'s onChange-driven cascade already
 * carries every descendant, connector, button and the root's own
 * circle along with (see its doc comment). Grabbed via a pointerdown
 * on the root's circle rather than Excalidraw's own dragging, because
 * the circle stays locked/inert to Excalidraw on purpose (so it
 * doesn't steal hits from the "+" buttons drawn over it) — so this
 * tracks the gesture itself with raw `pointermove`/`pointerup`
 * listeners instead. */
const startBoardDrag = (
  excalidrawAPI: ExcalidrawImperativeAPI,
  rootId: string,
  startScenePoint: { x: number; y: number },
) => {
  const root = excalidrawAPI
    .getSceneElementsIncludingDeleted()
    .find((el) => el.id === rootId);
  if (!root) {
    return;
  }
  const startX = root.x;
  const startY = root.y;
  let firstMove = true;
  excalidrawAPI.setCursor("grabbing");

  const handleMove = (moveEvent: PointerEvent) => {
    const scenePoint = viewportCoordsToSceneCoords(
      { clientX: moveEvent.clientX, clientY: moveEvent.clientY },
      excalidrawAPI.getAppState(),
    );
    const dx = scenePoint.x - startScenePoint.x;
    const dy = scenePoint.y - startScenePoint.y;
    const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
    const current = elements.find((el) => el.id === rootId);
    if (!current) {
      return;
    }
    const next = elements.map((el) =>
      el.id === rootId
        ? newElementWith(el, { x: startX + dx, y: startY + dy })
        : el,
    );
    excalidrawAPI.updateScene({
      elements: next,
      captureUpdate: firstMove
        ? CaptureUpdateAction.IMMEDIATELY
        : CaptureUpdateAction.NEVER,
    });
    firstMove = false;
  };

  const handleUp = () => {
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleUp);
    excalidrawAPI.resetCursor();
  };

  window.addEventListener("pointermove", handleMove);
  window.addEventListener("pointerup", handleUp);
};

/** Wires mind maps on the canvas up to real interactions:
 * - each node's "+" button is a real (locked) scene element, hit-tested
 *   ourselves from the raw pointer position on pointerdown (same trick
 *   as the kanban buttons — Excalidraw doesn't report a `hit.element`
 *   for locked elements, which keeps them inert to normal selection).
 * - pressing Enter while typing a node's text (Shift+Enter still
 *   inserts a newline, same convention as chat inputs) commits that
 *   text and immediately adds — and starts editing — a new sibling, so
 *   chaining several ideas at the same level never needs the mouse. On
 *   the root (which has no siblings) it adds the first *child* instead
 *   — the natural "confirm the topic, start the first idea" flow for a
 *   freshly-inserted mind map. Pressing Enter on a node that's still
 *   showing its own untouched default placeholder deletes it instead
 *   of chaining yet another empty stub — covers both "Enter twice in a
 *   row without typing" and "clicked + and immediately pressed Enter".
 *   Intercepted on the DOM `keydown` itself (capture phase, so it runs
 *   before Excalidraw's own handler turns Enter into a newline) rather
 *   than through any public API — there isn't one for "the user is
 *   editing text right now" at this granularity.
 * - the root's decorative background circle is a bigger, easier handle
 *   for moving the *whole* mind map than the topic's own text — a
 *   pointerdown there starts a manual drag (raw `pointermove`/
 *   `pointerup` listeners, since the circle itself stays locked/inert
 *   to Excalidraw's own dragging) that repositions only the root node
 *   itself; `reflowMindmap`'s existing single-node-drag cascade (the
 *   same one a direct drag of any node already triggers) takes care of
 *   carrying every descendant, connector, button and the circle itself
 *   along with it.
 * - everything else — a node being dragged (and its whole subtree +
 *   connectors needing to follow live), a node's text growing as it's
 *   edited (shifting its own "+" button and connector endpoints), or a
 *   node being deleted (cascading to its descendants) — is kept in sync
 *   through a continuous `onChange` subscription rather than one-off
 *   pointer handlers. `reflowMindmap` is a no-op (returns the exact same
 *   reference) once nothing is actually out of sync, so re-running it on
 *   every scene change is cheap and converges instead of looping. */
export const useMindmapInteractions = (
  excalidrawAPI: ExcalidrawImperativeAPI | null,
) => {
  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }

    const unsubscribeDown = excalidrawAPI.onPointerDown(
      (_activeTool, _pointerDownState, event) => {
        const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
        const appState = excalidrawAPI.getAppState();
        const scenePoint = viewportCoordsToSceneCoords(
          { clientX: event.clientX, clientY: event.clientY },
          appState,
        );

        for (const el of elements) {
          if (el.isDeleted || !isMindmapData(el.customData)) {
            continue;
          }
          const data = el.customData;
          if (data.role !== "addChildButton") {
            continue;
          }
          if (!rectContains(asRect(el), scenePoint)) {
            continue;
          }
          insertChildAndEdit(excalidrawAPI, data.boardId, data.nodeId);
          return;
        }

        for (const el of elements) {
          if (el.isDeleted || !isMindmapData(el.customData)) {
            continue;
          }
          const data = el.customData;
          if (data.role !== "rootBackground") {
            continue;
          }
          if (!rectContains(asRect(el), scenePoint)) {
            continue;
          }
          startBoardDrag(excalidrawAPI, data.nodeId, scenePoint);
          return;
        }
      },
    );

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
        return;
      }
      const target = event.target;
      if (
        !(target instanceof HTMLTextAreaElement) ||
        !target.classList.contains("excalidraw-wysiwyg")
      ) {
        return;
      }
      const editingElement = excalidrawAPI.getAppState().editingTextElement;
      if (
        !editingElement ||
        !isMindmapData(editingElement.customData) ||
        editingElement.customData.role !== "node"
      ) {
        return;
      }
      const { parentId, boardId } = editingElement.customData;
      const isRoot = parentId === null;

      event.preventDefault();
      event.stopPropagation();

      // A node still showing its own untouched placeholder gets removed
      // instead of chaining another one — doesn't apply to the root,
      // whose own default text stands in as a real (if generic) topic.
      if (!isRoot && target.value === DEFAULT_NODE_TEXT) {
        target.blur();
        const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
        excalidrawAPI.updateScene({
          elements: deleteNode(elements, boardId, editingElement.id),
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
        return;
      }

      // Commits the in-progress text (same as clicking away) before we
      // read the scene to add the next node, so its size/position
      // account for whatever was just typed.
      target.blur();
      // On the root, Enter adds its first child (an idea); anywhere
      // else it adds a sibling (another child of the *current* node's
      // own parent).
      insertChildAndEdit(excalidrawAPI, boardId, isRoot ? editingElement.id : parentId);
    };
    document.addEventListener("keydown", handleKeyDown, true);

    const unsubscribeChange = excalidrawAPI.onChange((elements) => {
      const boardIds = new Set<string>();
      for (const el of elements) {
        if (isMindmapData(el.customData)) {
          boardIds.add(el.customData.boardId);
        }
      }
      if (boardIds.size === 0) {
        return;
      }

      let next: readonly ExcalidrawElement[] = elements;
      for (const boardId of boardIds) {
        next = reflowMindmap(next, boardId);
      }
      if (next !== elements) {
        excalidrawAPI.updateScene({
          elements: next as ExcalidrawElement[],
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }
    });

    return () => {
      unsubscribeDown();
      document.removeEventListener("keydown", handleKeyDown, true);
      unsubscribeChange();
    };
  }, [excalidrawAPI]);
};
