import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { viewportCoordsToSceneCoords } from "@excalidraw/common";
import { useEffect, useRef } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import {
  addCardToContainer,
  addContainer,
  deleteContainer,
  reflowBoard,
  reorderCardAfterDrag,
  translateBoardCards,
} from "./board";
import { asRect, containersBoundingBox, rectContains } from "./layout";
import { isKanbanData } from "./types";

type ContainerInteraction = {
  boardId: string;
  kind: "move" | "resize";
  beforeBox: { x: number; y: number; width: number; height: number };
};

/** Wires the kanban boards on the canvas up to real interactions:
 * - the "+"/"×"/"+ Conteneur" buttons are real (locked) scene elements, so
 *   we hit-test them ourselves from the raw pointer position on
 *   pointerdown (Excalidraw doesn't report a `hit.element` for locked
 *   elements, which is otherwise exactly what we want — it keeps them
 *   inert to normal selection/dragging/deletion).
 * - cards are deliberately NOT part of the containers' native group (so a
 *   single click-drag can move just one card between containers); on
 *   pointerup we figure out which container it was dropped into and
 *   restack both the source and destination containers.
 * - containers ARE one native Excalidraw group per board, so dragging or
 *   resizing any one of them moves/scales the whole row together; since
 *   cards sit outside that group we cascade the same move/rescale to them
 *   on pointerup (translate on a plain drag, full reflow — which derives
 *   every card's size from its container's now-live width — on resize). */
export const useKanbanBoardInteractions = (
  excalidrawAPI: ExcalidrawImperativeAPI | null,
) => {
  const interactionRef = useRef<ContainerInteraction | null>(null);

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }

    const unsubscribeDown = excalidrawAPI.onPointerDown(
      (_activeTool, pointerDownState, event) => {
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

          if (
            data.role === "addCardButton" &&
            rectContains(asRect(el), scenePoint)
          ) {
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

          if (
            data.role === "deleteContainerButton" &&
            rectContains(asRect(el), scenePoint)
          ) {
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

          if (
            data.role === "addContainerButton" &&
            rectContains(asRect(el), scenePoint)
          ) {
            excalidrawAPI.updateScene({
              elements: addContainer(elements, data.boardId),
              captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
            return;
          }
        }

        // A resize-handle drag doesn't report a `hit.element` at all (the
        // handle isn't a scene element) — find which board is being
        // resized from the *selection* instead, which already holds the
        // whole containers-group by the time a handle is grabbed.
        let boardContainer: ExcalidrawElement | undefined;
        if (pointerDownState.resize.isResizing) {
          const selectedIds = appState.selectedElementIds;
          boardContainer = elements.find(
            (el) =>
              selectedIds[el.id] &&
              isKanbanData(el.customData) &&
              el.customData.role === "container",
          );
        } else {
          const hit = pointerDownState.hit.element;
          boardContainer =
            hit && isKanbanData(hit.customData) && hit.customData.role === "container"
              ? hit
              : undefined;
        }

        if (boardContainer) {
          const boardId = (boardContainer.customData as { boardId: string }).boardId;
          const box = containersBoundingBox(elements, boardId);
          interactionRef.current = box
            ? {
                boardId,
                kind: pointerDownState.resize.isResizing ? "resize" : "move",
                beforeBox: box,
              }
            : null;
        } else {
          interactionRef.current = null;
        }
      },
    );

    const unsubscribeUp = excalidrawAPI.onPointerUp((_activeTool, pointerDownState) => {
      const isResizing = pointerDownState.resize.isResizing;
      // `drag.hasOccurred` tracks whether a *position* drag happened —
      // it stays false throughout a resize (a distinct interaction kind
      // from Excalidraw's point of view), so a resize needs its own
      // check here or this bails out before the cascade below ever runs.
      if (!pointerDownState.drag.hasOccurred && !isResizing) {
        interactionRef.current = null;
        return;
      }

      const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
      const appState = excalidrawAPI.getAppState();

      if (!isResizing && pointerDownState.drag.hasOccurred) {
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
      }

      const interaction = interactionRef.current;
      interactionRef.current = null;
      if (interaction) {
        // The native resize/move commit isn't necessarily flushed into the
        // scene yet at the exact moment this pointerup listener runs —
        // reading it synchronously here can still see the pre-drag
        // geometry, so the cascade would compute from stale sizes/
        // positions. Deferring one tick lets Excalidraw's own commit land
        // first.
        window.setTimeout(() => {
          const freshElements = excalidrawAPI.getSceneElementsIncludingDeleted();
          if (interaction.kind === "resize") {
            excalidrawAPI.updateScene({
              elements: reflowBoard(freshElements, interaction.boardId),
              captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
          } else {
            const afterBox = containersBoundingBox(
              freshElements,
              interaction.boardId,
            );
            if (afterBox) {
              const dx = afterBox.x - interaction.beforeBox.x;
              const dy = afterBox.y - interaction.beforeBox.y;
              excalidrawAPI.updateScene({
                elements: translateBoardCards(
                  freshElements,
                  interaction.boardId,
                  dx,
                  dy,
                ),
                captureUpdate: CaptureUpdateAction.IMMEDIATELY,
              });
            }
          }
        }, 0);
      }
    });

    return () => {
      unsubscribeDown();
      unsubscribeUp();
    };
  }, [excalidrawAPI]);
};
