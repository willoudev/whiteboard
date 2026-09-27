import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { viewportCoordsToSceneCoords } from "@excalidraw/common";
import { useEffect } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import {
  addCardToContainer,
  addContainer,
  deleteContainer,
  moveContainerLeft,
  moveContainerRight,
  reflowBoard,
  reorderCardAfterDrag,
} from "./board";
import { asRect, rectContains } from "./layout";
import { isKanbanData } from "./types";

/** Wires the kanban boards on the canvas up to real interactions:
 * - the "+"/"×"/"◀"/"▶"/"+ Conteneur" buttons are real (locked) scene
 *   elements, so we hit-test them ourselves from the raw pointer
 *   position on pointerdown (Excalidraw doesn't report a `hit.element`
 *   for locked elements, which is otherwise exactly what we want — it
 *   keeps them inert to normal selection/dragging/deletion).
 * - cards are deliberately NOT part of the containers' native group (so
 *   a single click-drag can move just one card between columns); on
 *   pointerup we figure out which container it was dropped into and
 *   restack both the source and destination columns.
 * - everything else — a container being dragged or resized (containers
 *   ARE one native Excalidraw group per board, so grabbing any one of
 *   them moves/scales the whole row together), or a card's bound text
 *   wrapping to more lines as it's edited — is kept in sync through a
 *   continuous `onChange` subscription rather than one-off pointer
 *   handlers. `reflowBoard` is a no-op (returns the exact same
 *   reference) once nothing is actually out of sync, so re-running it on
 *   every scene change is cheap and converges instead of looping: this
 *   is what makes the cards visibly follow along *while* the containers
 *   are still being dragged/resized (not just once you let go), and
 *   what pushes cards below a taller one down as its text grows. */
export const useKanbanBoardInteractions = (
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
          if (el.isDeleted || !isKanbanData(el.customData)) {
            continue;
          }
          const data = el.customData;
          if (!rectContains(asRect(el), scenePoint)) {
            continue;
          }

          if (data.role === "addCardButton") {
            excalidrawAPI.updateScene({
              elements: addCardToContainer(
                elements,
                data.boardId,
                data.containerId,
              ),
              captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
            return;
          }

          if (data.role === "deleteContainerButton") {
            if (
              window.confirm(
                "Supprimer ce conteneur et toutes ses tâches ?",
              )
            ) {
              excalidrawAPI.updateScene({
                elements: deleteContainer(
                  elements,
                  data.boardId,
                  data.containerId,
                ),
                captureUpdate: CaptureUpdateAction.IMMEDIATELY,
              });
            }
            return;
          }

          if (data.role === "addContainerButton") {
            excalidrawAPI.updateScene({
              elements: addContainer(elements, data.boardId),
              captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
            return;
          }

          if (data.role === "moveContainerLeftButton") {
            excalidrawAPI.updateScene({
              elements: moveContainerLeft(
                elements,
                data.boardId,
                data.containerId,
              ),
              captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
            return;
          }

          if (data.role === "moveContainerRightButton") {
            excalidrawAPI.updateScene({
              elements: moveContainerRight(
                elements,
                data.boardId,
                data.containerId,
              ),
              captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
            return;
          }
        }
      },
    );

    const unsubscribeUp = excalidrawAPI.onPointerUp((_activeTool, pointerDownState) => {
      if (!pointerDownState.drag.hasOccurred) {
        return;
      }

      const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
      const appState = excalidrawAPI.getAppState();
      const selectedIds = Object.keys(appState.selectedElementIds);
      const draggedCard =
        selectedIds.length === 1
          ? elements.find((el) => el.id === selectedIds[0])
          : pointerDownState.hit.element;

      if (
        draggedCard &&
        !draggedCard.isDeleted &&
        isKanbanData(draggedCard.customData) &&
        draggedCard.customData.role === "card"
      ) {
        excalidrawAPI.updateScene({
          elements: reorderCardAfterDrag(
            elements,
            draggedCard.customData.boardId,
            draggedCard.id,
          ),
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
      }
    });

    const unsubscribeChange = excalidrawAPI.onChange((elements, appState) => {
      const boardIds = new Set<string>();
      for (const el of elements) {
        if (!el.isDeleted && isKanbanData(el.customData)) {
          boardIds.add(el.customData.boardId);
        }
      }
      if (boardIds.size === 0) {
        return;
      }

      // Don't fight a card the user is actively dragging right now —
      // let it follow the pointer freely; reorderCardAfterDrag (above)
      // takes over the instant it's dropped.
      let draggingCardId: string | undefined;
      if (appState.selectedElementsAreBeingDragged) {
        const selectedIds = Object.keys(appState.selectedElementIds);
        if (selectedIds.length === 1) {
          const el = elements.find((e) => e.id === selectedIds[0]);
          if (el && isKanbanData(el.customData) && el.customData.role === "card") {
            draggingCardId = el.id;
          }
        }
      }

      let next: readonly ExcalidrawElement[] = elements;
      for (const boardId of boardIds) {
        next = reflowBoard(next, boardId, { excludeCardId: draggingCardId });
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
      unsubscribeUp();
      unsubscribeChange();
    };
  }, [excalidrawAPI]);
};
