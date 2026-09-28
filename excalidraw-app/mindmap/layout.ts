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
 * therefore the same outward angle). Generous enough that two default
 * (single-line) labels never touch. Used only for a sibling's very
 * first placement, the moment it's created — once any sibling in the
 * group has descendants of its own, `packSizesCentered` below takes
 * over and spaces the whole group by each one's actual subtree size
 * instead. */
export const SIBLING_SPACING = 76;

/** Gap left between two adjacent siblings' subtree "boxes" once each is
 * sized to its own actual footprint (see `packSizesCentered`) — on top
 * of their sizes, not instead of them. */
export const SUBTREE_GAP = 24;

/** Lays `sizes` out end-to-end with `gap` between each pair, centered as
 * a whole around 0, and returns each one's own center offset — the 1-D
 * "pack boxes of different sizes without overlap" a mindmap needs at
 * every branch point: a sibling whose own subtree has grown needs more
 * room than a fixed per-sibling spacing would give it, or it starts
 * overlapping its neighbor's descendants instead of just its neighbor's
 * own label. */
export const packSizesCentered = (sizes: readonly number[], gap: number): number[] => {
  const total = sizes.reduce((sum, s) => sum + s, 0) + gap * Math.max(0, sizes.length - 1);
  let cursor = -total / 2;
  return sizes.map((size) => {
    const center = cursor + size / 2;
    cursor += size + gap;
    return center;
  });
};

/** Fixed-size filled circle drawn behind the root topic, matching the
 * reference image's central node. Deliberately not grown to fit long
 * root text (keeps the layout simple/predictable) — connectors from the
 * root are inset to its radius so they visually start at its edge. */
export const ROOT_CIRCLE_SIZE = 190;

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

/** How far a connector should stay clear of an ordinary (non-root) node's
 * own center, regardless of which direction it approaches from — a flat
 * few-pixel inset is nowhere near enough once the node's label has any
 * real width, and the curve ends up cutting straight through the text
 * instead of stopping at its edge. */
export const nodeInset = (size: { width: number; height: number }) =>
  Math.max(10, Math.max(size.width, size.height) / 2 + 6);

export type Side = "left" | "right";

/** Which side of the root a given root-child index belongs to — strictly
 * alternating (right, left, right, left, …), so the mindmap's main
 * branches always grow along the same horizontal axis as the topic
 * itself instead of spreading up/down/diagonally off-screen. */
export const sideForRootChildIndex = (index: number): Side =>
  index % 2 === 0 ? "right" : "left";

/** Where a new child of `parent` should be centered, and which angle it
 * (and, later, its own children) should continue growing in.
 * - Root's children always sit due left or due right of it (`side`,
 *   required when `parent.isRoot`) — a purely horizontal main axis, so
 *   the branches stay visible/readable instead of fanning out in every
 *   direction. Multiple children on the *same* side stack vertically,
 *   same as any other node's siblings.
 * - Any other node's children continue in the *parent's own* angle
 *   (the branch keeps extending outward in one direction), spread apart
 *   perpendicular to that angle so siblings don't overlap.
 *
 * `siblingIndex`/`siblingCount` are scoped to whatever `angle` ends up
 * being: for the root, that's the count of children on the *same side*
 * (not all of the root's children); for anyone else, all of the
 * parent's children (there's only one possible angle for those). */
export const computeChildCenter = (
  parent: { center: Point; angle: number; isRoot: boolean; depth: number },
  siblingIndex: number,
  siblingCount: number,
  side?: Side,
): { center: Point; angle: number } => {
  const angle = parent.isRoot ? (side === "left" ? Math.PI : 0) : parent.angle;
  const radius = radiusForDepth(parent.depth + 1);

  const baseX = parent.center.x + Math.cos(angle) * radius;
  const baseY = parent.center.y + Math.sin(angle) * radius;

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
 * still read as curved without long ones looking exaggerated.
 *
 * `fromInset`/`toInset` pull each endpoint back from the raw center —
 * a small fixed gap for an ordinary text node, or the root circle's
 * radius when the connector starts at the root, so the curve begins at
 * the circle's edge instead of poking through it. */
export const connectorGeometry = (
  from: Point,
  to: Point,
  fromInset = 10,
  toInset = 10,
): { x: number; y: number; points: LocalPoint[] } => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const bulge = Math.min(36, len * 0.16);

  const startX = from.x + ux * fromInset;
  const startY = from.y + uy * fromInset;
  const segDx = dx - ux * (fromInset + toInset);
  const segDy = dy - uy * (fromInset + toInset);

  const px = (-segDy / len) * bulge;
  const py = (segDx / len) * bulge;

  const points: LocalPoint[] = [
    pointFrom<LocalPoint>(0, 0),
    pointFrom<LocalPoint>(segDx / 2 + px, segDy / 2 + py),
    pointFrom<LocalPoint>(segDx, segDy),
  ];

  return { x: startX, y: startY, points };
};
