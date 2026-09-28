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
 * own center lands on that exact node.
 *
 * Excalidraw's own wysiwyg setup only auto-selects the whole text for a
 * mouse/keyboard user (`autoSelect: !isTouchScreen`, since select-all
 * on focus is often unwanted on touch) — but for a node we *just*
 * created with a throwaway placeholder, replacing it on the very first
 * keystroke is exactly what's wanted everywhere, phone included. So
 * this selects the textarea's content itself, right after
 * `startTextEditing` mounts it, instead of relying on that heuristic.
 *
 * Must be called *synchronously* within the same pointerdown handler
 * that added the node — not deferred via `requestAnimationFrame` or a
 * timeout. Two reasons:
 * - Mobile browsers only auto-open the on-screen keyboard when the
 *   focus() call that starts editing happens inside the original
 *   trusted user-gesture call stack; deferring it even by one frame
 *   focuses the field silently, with no keyboard.
 * - It doesn't need the wait anyway: `updateScene` (called right before
 *   this, to add the node) synchronously replaces the scene's element
 *   list via `Scene.replaceAllElements` before returning, and
 *   `startTextEditing` mounts the textarea synchronously too — the node
 *   (and, right after, its editable textarea) already exist by the time
 *   each is needed. */
export const startEditingNode = (
  excalidrawAPI: ExcalidrawImperativeAPI,
  nodeId: string,
) => {
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
  document.querySelector<HTMLTextAreaElement>("textarea.excalidraw-wysiwyg")?.select();
};
