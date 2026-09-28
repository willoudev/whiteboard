import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { viewportCoordsToSceneCoords } from "@excalidraw/common";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { placeAvoidingOverlap } from "../data/placement";

import { buildInitialMindmapElements } from "./board";

/** Inserts a fresh interactive mind map centered on the current
 * viewport, the same way pasting or dropping a library item does —
 * nudged clear of anything already on the canvas there (see
 * `placeAvoidingOverlap`). */
export const insertMindmapBoard = (excalidrawAPI: ExcalidrawImperativeAPI) => {
  const appState = excalidrawAPI.getAppState();
  const center = viewportCoordsToSceneCoords(
    {
      clientX: appState.offsetLeft + appState.width / 2,
      clientY: appState.offsetTop + appState.height / 2,
    },
    appState,
  );

  const existingElements = excalidrawAPI.getSceneElementsIncludingDeleted();
  const newElements = placeAvoidingOverlap(
    existingElements,
    buildInitialMindmapElements(center.x, center.y),
  );

  excalidrawAPI.updateScene({
    elements: [...existingElements, ...newElements],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};
