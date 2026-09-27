import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { asRect, rectCenter } from "./layout";

/** Puts a just-inserted text node into edit mode with its default text
 * selected, as if the user had double-clicked it — so typing the real
 * idea can start immediately instead of requiring a manual double-click
 * to rename the "Nouvelle idée" placeholder afterwards.
 *
 * `excalidrawAPI.startTextEditing` (a small addition to this fork's
 * `ExcalidrawImperativeAPI` — see packages/excalidraw/types.ts) reuses
 * whatever unbound text element is already sitting at the given scene
 * position instead of creating a new one, so calling it with our node's
 * own center lands on that exact node. Desktop already auto-selects the
 * whole text on entry (Excalidraw's own wysiwyg setup), so the
 * placeholder gets replaced by the very first keystroke with no extra
 * work here.
 *
 * Deferred one animation frame because the node was *just* added via
 * `updateScene` in this same tick — giving the scene a moment to settle
 * first avoids racing that update. */
export const startEditingNode = (
  excalidrawAPI: ExcalidrawImperativeAPI,
  nodeId: string,
) => {
  requestAnimationFrame(() => {
    const node = excalidrawAPI
      .getSceneElementsIncludingDeleted()
      .find((el) => el.id === nodeId);
    if (!node || node.isDeleted) {
      return;
    }
    const center = rectCenter(asRect(node));
    excalidrawAPI.startTextEditing({
      sceneX: center.x,
      sceneY: center.y,
      insertAtParentCenter: false,
      container: null,
    });
  });
};
