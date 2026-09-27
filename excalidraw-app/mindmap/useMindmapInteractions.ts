import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { viewportCoordsToSceneCoords } from "@excalidraw/common";
import { useEffect } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import { addChildNode, reflowMindmap } from "./board";
import { asRect, rectContains } from "./layout";
import { isMindmapData } from "./types";

/** Wires mind maps on the canvas up to real interactions:
 * - each node's "+" button is a real (locked) scene element, hit-tested
 *   ourselves from the raw pointer position on pointerdown (same trick
 *   as the kanban buttons — Excalidraw doesn't report a `hit.element`
 *   for locked elements, which keeps them inert to normal selection).
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
          excalidrawAPI.updateScene({
            elements: addChildNode(elements, data.boardId, data.nodeId),
            captureUpdate: CaptureUpdateAction.IMMEDIATELY,
          });
          return;
        }
      },
    );

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
      unsubscribeChange();
    };
  }, [excalidrawAPI]);
};
