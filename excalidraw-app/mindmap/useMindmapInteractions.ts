import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { isTextElement, newElementWith } from "@excalidraw/element";
import { viewportCoordsToSceneCoords } from "@excalidraw/common";
import { useEffect, useRef } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import { DEFAULT_NODE_TEXT, addChildNode, deleteNode, reflowMindmap } from "./board";
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

/** Drags the whole mind map by dragging just its root node — the same
 * single-node drag `reflowMindmap`'s onChange-driven cascade already
 * carries every descendant, connector, button and the root's own
 * circle along with (see its doc comment). Grabbed via a pointerdown
 * on the root's circle rather than Excalidraw's own dragging, because
 * the circle stays locked/inert to Excalidraw on purpose (so it
 * doesn't steal hits from the "+" buttons drawn over it) — so this
 * tracks the gesture itself with raw `pointermove`/`pointerup`
 * listeners instead. */
const startBoardDrag = (
  excalidrawAPI: ExcalidrawImperativeAPI,
  rootId: string,
  startScenePoint: { x: number; y: number },
) => {
  const root = excalidrawAPI
    .getSceneElementsIncludingDeleted()
    .find((el) => el.id === rootId);
  if (!root) {
    return;
  }
  const startX = root.x;
  const startY = root.y;
  let firstMove = true;
  excalidrawAPI.setCursor("grabbing");

  const handleMove = (moveEvent: PointerEvent) => {
    const scenePoint = viewportCoordsToSceneCoords(
      { clientX: moveEvent.clientX, clientY: moveEvent.clientY },
      excalidrawAPI.getAppState(),
    );
    const dx = scenePoint.x - startScenePoint.x;
    const dy = scenePoint.y - startScenePoint.y;
    const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
    const current = elements.find((el) => el.id === rootId);
    if (!current) {
      return;
    }
    const next = elements.map((el) =>
      el.id === rootId
        ? newElementWith(el, { x: startX + dx, y: startY + dy })
        : el,
    );
    excalidrawAPI.updateScene({
      elements: next,
      captureUpdate: firstMove
        ? CaptureUpdateAction.IMMEDIATELY
        : CaptureUpdateAction.NEVER,
    });
    firstMove = false;
  };

  const handleUp = () => {
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleUp);
    excalidrawAPI.resetCursor();
  };

  window.addEventListener("pointermove", handleMove);
  window.addEventListener("pointerup", handleUp);
};

/** Deletes `element` if it's still showing its own untouched default
 * placeholder — shared by every way a node's editing session can end
 * without the user actually writing anything (see the two call sites
 * below): Enter (handled inline, before Excalidraw ever sees the key),
 * and Escape/clicking away (handled generically — see the
 * `onStateChange("editingTextElement", …)` subscription). Doesn't
 * apply to the root, whose own default text stands in as a real (if
 * generic) topic and is never auto-deleted. */
const deleteIfStillDefault = (
  excalidrawAPI: ExcalidrawImperativeAPI,
  element: ExcalidrawElement,
) => {
  if (
    !isMindmapData(element.customData) ||
    element.customData.role !== "node" ||
    element.customData.parentId === null
  ) {
    return;
  }
  const { boardId } = element.customData;
  const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
  const committed = elements.find((el) => el.id === element.id);
  if (
    !committed ||
    committed.isDeleted ||
    !isTextElement(committed) ||
    committed.text !== DEFAULT_NODE_TEXT
  ) {
    return;
  }
  excalidrawAPI.updateScene({
    elements: deleteNode(elements, boardId, element.id),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};

/** Wires mind maps on the canvas up to real interactions:
 * - each node's "+" button is a real (locked) scene element, hit-tested
 *   ourselves from the raw pointer position on pointerdown (same trick
 *   as the kanban buttons — Excalidraw doesn't report a `hit.element`
 *   for locked elements, which keeps them inert to normal selection).
 * - pressing Enter while typing a node's text (Shift+Enter still
 *   inserts a newline, same convention as chat inputs) commits that
 *   text and immediately adds — and starts editing — a new sibling, so
 *   chaining several ideas at the same level never needs the mouse. On
 *   the root (which has no siblings) it adds the first *child* instead
 *   — the natural "confirm the topic, start the first idea" flow for a
 *   freshly-inserted mind map. Pressing Enter on a node that's still
 *   showing its own untouched default placeholder just commits (via
 *   `deleteIfStillDefault`, triggered by the blur below) instead of
 *   chaining yet another empty stub — covers both "Enter twice in a row
 *   without typing" and "clicked + and immediately pressed Enter".
 *   Intercepted on the DOM `keydown` itself (capture phase, so it runs
 *   before Excalidraw's own handler turns Enter into a newline) rather
 *   than through any public API — there isn't one for "the user is
 *   editing text right now" at this granularity.
 * - leaving a node's text untouched at its own default placeholder —
 *   by any means, not just Enter (Escape, clicking elsewhere, clicking
 *   a different node's own "+" button, …) — deletes that node once
 *   editing stops, via `deleteIfStillDefault`. Driven by
 *   `onStateChange("editingTextElement", …)`, which fires once editing
 *   has actually ended (gone back to `null`) rather than by any one
 *   specific key or event, so every exit path is covered uniformly.
 * - the root's decorative background circle is a bigger, easier handle
 *   for moving the *whole* mind map than the topic's own text — a
 *   pointerdown there starts a manual drag (raw `pointermove`/
 *   `pointerup` listeners, since the circle itself stays locked/inert
 *   to Excalidraw's own dragging) that repositions only the root node
 *   itself; `reflowMindmap`'s existing single-node-drag cascade (the
 *   same one a direct drag of any node already triggers) takes care of
 *   carrying every descendant, connector, button and the circle itself
 *   along with it. Intercepted on a capture-phase DOM `pointerdown`
 *   (rather than through `onPointerDown`, like the buttons above) and
 *   stopped from propagating any further: by the time `onPointerDown`
 *   fires, Excalidraw has *already* started its own rubber-band
 *   selection rectangle for the click (the circle is locked, so it
 *   doesn't hit anything selectable), which would otherwise be dragged
 *   out at the same time as the board itself. A click that lands on
 *   the root's own *text*, though — small, centered on top of the
 *   circle — is deliberately left alone here so it still reaches
 *   Excalidraw's normal selection: that's what makes the root (and so
 *   the whole board, via the delete-cascade below) selectable and
 *   deletable at all.
 * - deleting a node — the root included — the normal Excalidraw way
 *   (select it, press Delete/Backspace, or use its context menu) takes
 *   its whole subtree down with it: connectors, "+" buttons, and, for
 *   the root, the background circle too. This isn't code of ours; it's
 *   `reflowMindmap`'s existing cascade-delete (see its doc comment in
 *   board.ts), which already runs continuously via the `onChange`
 *   subscription below and reacts to *any* deleted mindmap node,
 *   however it got deleted. Deleting the root this way is how the
 *   whole mind map gets removed in one action. For this to work, the
 *   node has to actually be *selectable* right after you finish typing
 *   it — see the next point.
 * - once a node's editing session ends (same `onStateChange` as above),
 *   its selection is cleared. Left alone, the node stays selected the
 *   way Excalidraw always leaves a just-committed text element — and
 *   Excalidraw treats a click on an *already-selected* text element as
 *   "start editing it", not "select it". Without this, the very next
 *   click on an idea you'd just finished typing (the natural "actually,
 *   never mind, delete this" moment) would silently reopen editing
 *   instead of selecting it, and Delete/Backspace would edit its text
 *   rather than remove the node.
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
  const previousEditingElement = useRef<ExcalidrawElement | null>(null);

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

    // Capture phase, and ahead of Excalidraw's own pointerdown handling
    // entirely (see the doc comment above) — a plain `onPointerDown`
    // subscription runs too late to stop the rubber-band selection
    // rectangle Excalidraw already started for the same click.
    const handleRootBackgroundPointerDown = (event: PointerEvent) => {
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
        if (data.role !== "rootBackground") {
          continue;
        }
        if (!rectContains(asRect(el), scenePoint)) {
          continue;
        }
        const rootNode = elements.find(
          (n) =>
            !n.isDeleted &&
            isMindmapData(n.customData) &&
            n.customData.role === "node" &&
            n.id === data.nodeId,
        );
        if (rootNode && rectContains(asRect(rootNode), scenePoint)) {
          // Land on the topic's own text: leave it to Excalidraw's
          // normal selection instead of starting a board drag.
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        startBoardDrag(excalidrawAPI, data.nodeId, scenePoint);
        return;
      }
    };
    document.addEventListener(
      "pointerdown",
      handleRootBackgroundPointerDown,
      true,
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
      const isRoot = parentId === null;

      event.preventDefault();
      event.stopPropagation();

      // Commits the in-progress text (same as clicking away) before we
      // read the scene to add the next node, so its size/position
      // account for whatever was just typed. If nothing was actually
      // typed, this same blur is what the `onStateChange` subscription
      // below reacts to — deleting the node instead of leaving it
      // stubbed out — so there's nothing further to do here for that
      // case.
      target.blur();
      if (!isRoot && target.value === DEFAULT_NODE_TEXT) {
        return;
      }
      // On the root, Enter adds its first child (an idea); anywhere
      // else it adds a sibling (another child of the *current* node's
      // own parent).
      insertChildAndEdit(excalidrawAPI, boardId, isRoot ? editingElement.id : parentId);
    };
    document.addEventListener("keydown", handleKeyDown, true);

    const unsubscribeEditingChange = excalidrawAPI.onStateChange(
      "editingTextElement",
      (editingTextElement) => {
        const wasEditing = previousEditingElement.current;
        previousEditingElement.current = editingTextElement ?? null;
        // Only cares about editing having *stopped* (gone back to
        // null) — a transition straight from one node to another (e.g.
        // Enter chaining to a new sibling) is left alone.
        if (editingTextElement || !wasEditing || !isMindmapData(wasEditing.customData)) {
          return;
        }
        // Excalidraw's own click-to-edit shortcut re-enters edit mode
        // when a text element is clicked *while already selected* —
        // exactly what committing a node's text normally leaves it as,
        // which meant the very next click on a node you'd just finished
        // typing (the natural "actually, delete this" moment) reopened
        // editing instead of selecting it for Delete/Backspace to work
        // on. Clearing the selection here (a plain `updateScene`, not
        // `clearSelectionSync` — this callback runs from inside
        // `componentDidUpdate`, where `flushSync` isn't allowed) means
        // that click lands as a normal select instead.
        excalidrawAPI.updateScene({
          appState: { selectedElementIds: {} },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        deleteIfStillDefault(excalidrawAPI, wasEditing);
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
      document.removeEventListener(
        "pointerdown",
        handleRootBackgroundPointerDown,
        true,
      );
      document.removeEventListener("keydown", handleKeyDown, true);
      unsubscribeEditingChange();
      unsubscribeChange();
    };
  }, [excalidrawAPI]);
};
