import { newElementWith } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

type Rect = { x: number; y: number; width: number; height: number };

const boundingBoxOf = (elements: readonly ExcalidrawElement[]): Rect | null => {
  const nonDeleted = elements.filter((el) => !el.isDeleted);
  if (nonDeleted.length === 0) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of nonDeleted) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const rectsOverlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

const PLACEMENT_MARGIN = 60;

/** Translates a freshly-built block of new elements (already positioned
 * wherever the caller wanted, typically centered on the current
 * viewport) so it doesn't land on top of whatever's already on the
 * canvas — nudged to the right of or below the existing content's
 * bounding box, whichever is the smaller move, so it stays close to
 * where it was meant to appear rather than jumping somewhere arbitrary.
 * An empty canvas, or a new block that doesn't actually overlap
 * anything, is returned unchanged.
 *
 * Used by every "insert a ready-made structure" action (kanban board,
 * mind map, and any future one) — never by freehand drawing, where
 * placing shapes wherever the user clicks/drags is the whole point. */
export const placeAvoidingOverlap = (
  existingElements: readonly ExcalidrawElement[],
  newElements: readonly ExcalidrawElement[],
): ExcalidrawElement[] => {
  const existingBounds = boundingBoxOf(existingElements);
  const newBounds = boundingBoxOf(newElements);
  if (!existingBounds || !newBounds || !rectsOverlap(existingBounds, newBounds)) {
    return newElements as ExcalidrawElement[];
  }

  const rightDx =
    existingBounds.x + existingBounds.width + PLACEMENT_MARGIN - newBounds.x;
  const downDy =
    existingBounds.y + existingBounds.height + PLACEMENT_MARGIN - newBounds.y;

  const [dx, dy] =
    Math.abs(rightDx) <= Math.abs(downDy) ? [rightDx, 0] : [0, downDy];

  return newElements.map((el) => newElementWith(el, { x: el.x + dx, y: el.y + dy }));
};
