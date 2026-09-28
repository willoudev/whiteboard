import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { viewportCoordsToSceneCoords } from "@excalidraw/common";
import { useEffect } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import { addChildNode, reflowMindmap } from "./board";
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

/** Wires mind maps on the canvas up to real interactions:
 * - each node's "+" button is a real (locked) scene element, hit-tested
 *   ourselves from the raw pointer position on pointerdown (same trick
 *   as the kanban buttons — Excalidraw doesn't report a `hit.element`
 *   for locked elements, which keeps them inert to normal selection).
 * - pressing Enter while typing a node's text (Shift+Enter still
 *   inserts a newline, same convention as chat inputs) commits that
 *   text and immediately adds — and starts editing — a new sibling, so
 *   chaining several ideas at the same level never needs the mouse.
 *   Intercepted on the DOM `keydown` itself (capture phase, so it runs
 *   before Excalidraw's own handler turns Enter into a newline) rather
 *   than through any public API — there isn't one for "the user is
 *   editing text right now" at this granularity.
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
      if (!parentId) {
        // The root has no siblings — leave Enter as a plain newline.
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      // Commits the in-progress text (same as clicking away) before we
      // read the scene to add the sibling, so its size/position account
      // for whatever was just typed.
      target.blur();
      insertChildAndEdit(excalidrawAPI, boardId, parentId);
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
