import { pointFrom, type LocalPoint } from "@excalidraw/math";

import type { ExcalidrawElement } from "@excalidraw/element/types";

export type Rect = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };

/** Rough width estimate for a not-yet-converted node (real elements measure
 * their own size once on the canvas — see `nodeCenter`). */
export const estimateTextWidth = (text: string, fontSize: number) =>
  Math.max(text.length, 1) * fontSize * 0.55;

/** Colors cycled through for each root-level branch; every descendant of a
 * branch inherits its color, same as the reference mind map. */
export const BRANCH_COLORS = [
  "#e8590c",
  "#1971c2",
  "#2f9e44",
  "#9c36b5",
  "#e03131",
  "#0c8599",
  "#f08c00",
  "#5c7cfa",
];

export const ROOT_COLOR = "#1e1e1e";
export const ROOT_FONT_SIZE = 26;
export const BRANCH_FONT_SIZE = 20;
export const LEAF_FONT_SIZE = 16;

/** Font size shrinks a little with depth (root's direct children are the
 * biggest, everything past that settles at the smallest size) so deeply
 * nested ideas don't visually dominate their ancestors. */
export const fontSizeForDepth = (depth: number) => {
  if (depth <= 0) {
    return ROOT_FONT_SIZE;
  }
  if (depth === 1) {
    return BRANCH_FONT_SIZE;
  }
  return LEAF_FONT_SIZE;
};

/** Radial distance from a node to its child, in px, along the branch's
 * angle — bigger for the root's own children (matching the reference
 * image's wide first hop) and a fixed, smaller step for every hop after
 * that. */
export const radiusForDepth = (childDepth: number) =>
  childDepth <= 1 ? 260 : 190;

/** Perpendicular spacing between siblings sharing the same parent (and
 * therefore the same outward angle). */
export const SIBLING_SPACING = 64;

/** Multiple children spread out evenly around the circle for the root's
 * own branches — the golden angle keeps them from clustering regardless
 * of how many get added, without needing to know the final count up
 * front (new siblings just take the next slot). */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export const rectContains = (rect: Rect, point: Point) =>
  point.x >= rect.x &&
  point.x <= rect.x + rect.width &&
  point.y >= rect.y &&
  point.y <= rect.y + rect.height;

export const asRect = (element: ExcalidrawElement): Rect => ({
  x: element.x,
  y: element.y,
  width: element.width,
  height: element.height,
});

export const rectCenter = (rect: Rect): Point => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
});

/** Where a new child of `parent` should be centered, and which angle it
 * (and, later, its own children) should continue growing in.
 * - Root's children get a fresh slot around the full circle each time.
 * - Any other node's children continue in the *parent's own* angle
 *   (the branch keeps extending outward in one direction), spread apart
 *   perpendicular to that angle so siblings don't overlap. */
export const computeChildCenter = (
  parent: { center: Point; angle: number; isRoot: boolean; depth: number },
  siblingIndex: number,
  siblingCount: number,
): { center: Point; angle: number } => {
  const angle = parent.isRoot
    ? siblingIndex * GOLDEN_ANGLE
    : parent.angle;
  const radius = radiusForDepth(parent.depth + 1);

  const baseX = parent.center.x + Math.cos(angle) * radius;
  const baseY = parent.center.y + Math.sin(angle) * radius;

  if (parent.isRoot) {
    return { center: { x: baseX, y: baseY }, angle };
  }

  const perpAngle = angle + Math.PI / 2;
  const centeredIndex = siblingIndex - (siblingCount - 1) / 2;
  const offset = centeredIndex * SIBLING_SPACING;

  return {
    center: {
      x: baseX + Math.cos(perpAngle) * offset,
      y: baseY + Math.sin(perpAngle) * offset,
    },
    angle,
  };
};

/** Geometry (start point + 3-point curve) for a gently bulging connector
 * between two node centers — the same "branch" look as the old static
 * template, just recomputed live from two arbitrary points instead of
 * being baked in once. Bulge scales with distance (capped) so short hops
 * still read as curved without long ones looking exaggerated. */
export const connectorGeometry = (
  from: Point,
  to: Point,
  inset = 10,
): { x: number; y: number; points: LocalPoint[] } => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const bulge = Math.min(36, len * 0.16);

  const startX = from.x + ux * inset;
  const startY = from.y + uy * inset;
  const segDx = dx - ux * inset * 2;
  const segDy = dy - uy * inset * 2;

  const px = (-segDy / len) * bulge;
  const py = (segDx / len) * bulge;

  const points: LocalPoint[] = [
    pointFrom<LocalPoint>(0, 0),
    pointFrom<LocalPoint>(segDx / 2 + px, segDy / 2 + py),
    pointFrom<LocalPoint>(segDx, segDy),
  ];

  return { x: startX, y: startY, points };
};
