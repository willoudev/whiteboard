import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { viewportCoordsToSceneCoords } from "@excalidraw/common";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { placeAvoidingOverlap } from "../data/placement";

import { buildInitialMindmapElements } from "./board";
import { startEditingNode } from "./startTextEditing";

/** Inserts a fresh mind map — just its central topic, nothing else yet
 * — centered on the current viewport, the same way pasting or dropping
 * a library item does, nudged clear of anything already on the canvas
 * there (see `placeAvoidingOverlap`). Immediately puts the topic into
 * text-editing mode with its default label selected, so typing the
 * real topic (and then Enter — see `useMindmapInteractions` — to add
 * the first idea) is the very next thing the user does. */
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
  const built = buildInitialMindmapElements(center.x, center.y);
  const newElements = placeAvoidingOverlap(existingElements, built.elements);

  excalidrawAPI.updateScene({
    elements: [...existingElements, ...newElements],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  startEditingNode(excalidrawAPI, built.rootId);
};
