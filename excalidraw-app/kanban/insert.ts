import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { viewportCoordsToSceneCoords } from "@excalidraw/common";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { buildInitialBoardElements } from "./board";

/** Inserts a fresh interactive kanban board centered on the current
 * viewport, the same way pasting or dropping a library item does. */
export const insertKanbanBoard = (excalidrawAPI: ExcalidrawImperativeAPI) => {
  const appState = excalidrawAPI.getAppState();
  const center = viewportCoordsToSceneCoords(
    {
      clientX: appState.offsetLeft + appState.width / 2,
      clientY: appState.offsetTop + appState.height / 2,
    },
    appState,
  );

  const newElements = buildInitialBoardElements(center.x, center.y);

  excalidrawAPI.updateScene({
    elements: [
      ...excalidrawAPI.getSceneElementsIncludingDeleted(),
      ...newElements,
    ],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};
