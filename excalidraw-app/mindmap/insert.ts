import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { viewportCoordsToSceneCoords } from "@excalidraw/common";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { buildInitialMindmapElements } from "./board";

/** Inserts a fresh interactive mind map centered on the current
 * viewport, the same way pasting or dropping a library item does. */
export const insertMindmapBoard = (excalidrawAPI: ExcalidrawImperativeAPI) => {
  const appState = excalidrawAPI.getAppState();
  const center = viewportCoordsToSceneCoords(
    {
      clientX: appState.offsetLeft + appState.width / 2,
      clientY: appState.offsetTop + appState.height / 2,
    },
    appState,
  );

  const newElements = buildInitialMindmapElements(center.x, center.y);

  excalidrawAPI.updateScene({
    elements: [
      ...excalidrawAPI.getSceneElementsIncludingDeleted(),
      ...newElements,
    ],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};
