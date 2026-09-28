import {
  computeBoundTextPosition,
  getBoundTextElement,
  newElementWith,
} from "@excalidraw/element";

import type {
  ExcalidrawArrowElement,
  ExcalidrawElement,
  ElementsMap,
} from "@excalidraw/element/types";

import {
  ADD_CHILD_BUTTON_SIZE,
  MindmapElementsBuilder,
  addChildButtonOffset,
  newBoardId,
  newElementId,
} from "./elements";
import {
  BRANCH_COLORS,
  ROOT_CIRCLE_SIZE,
  ROOT_COLOR,
  SUBTREE_GAP,
  computeChildCenter,
  connectorGeometry,
  estimateTextWidth,
  fontSizeForDepth,
  nodeInset,
  packSizesCentered,
  radiusForDepth,
  rectCenter,
  asRect,
  sideForRootChildIndex,
  type Point,
  type Side,
} from "./layout";
import { isMindmapData, type MindmapNodeData } from "./types";

const EPS = 0.01;
const numEquals = (a: number, b: number) => Math.abs(a - b) < EPS;

export const DEFAULT_ROOT_TEXT = "Sujet central";
export const DEFAULT_NODE_TEXT = "Nouvelle idée";

const getBoardNodes = (elements: readonly ExcalidrawElement[], boardId: string) =>
  elements.filter(
    (el): el is ExcalidrawElement & { customData: MindmapNodeData } =>
      !el.isDeleted &&
      isMindmapData(el.customData) &&
      el.customData.boardId === boardId &&
      el.customData.role === "node",
  );

const getBoardConnectors = (elements: readonly ExcalidrawElement[], boardId: string) =>
  elements.filter(
    (el): el is ExcalidrawArrowElement =>
      !el.isDeleted &&
      isMindmapData(el.customData) &&
      el.customData.boardId === boardId &&
      el.customData.role === "connector",
  );

const findNode = (elements: readonly ExcalidrawElement[], boardId: string, nodeId: string) =>
  elements.find(
    (el): el is ExcalidrawElement & { customData: MindmapNodeData } =>
      el.id === nodeId &&
      !el.isDeleted &&
      isMindmapData(el.customData) &&
      el.customData.boardId === boardId &&
      el.customData.role === "node",
  );

const findChildButton = (
  elements: readonly ExcalidrawElement[],
  boardId: string,
  nodeId: string,
) =>
  elements.find(
    (el) =>
      !el.isDeleted &&
      isMindmapData(el.customData) &&
      el.customData.boardId === boardId &&
      el.customData.role === "addChildButton" &&
      el.customData.nodeId === nodeId,
  );

const findRootBackground = (
  elements: readonly ExcalidrawElement[],
  boardId: string,
  nodeId: string,
) =>
  elements.find(
    (el) =>
      !el.isDeleted &&
      isMindmapData(el.customData) &&
      el.customData.boardId === boardId &&
      el.customData.role === "rootBackground" &&
      el.customData.nodeId === nodeId,
  );

const buildChildrenMap = (
  nodes: readonly (ExcalidrawElement & { customData: MindmapNodeData })[],
) => {
  const map = new Map<string, (ExcalidrawElement & { customData: MindmapNodeData })[]>();
  for (const node of nodes) {
    const parentId = node.customData.parentId;
    if (parentId) {
      const list = map.get(parentId) ?? [];
      list.push(node);
      map.set(parentId, list);
    }
  }
  return map;
};

/** The vertical span (top edge to bottom edge) a node's whole subtree
 * currently occupies, recursively — a sibling with many descendants
 * needs proportionally more room than one that's still a single leaf.
 * Used to size each sibling's "box" when packing a sibling group (see
 * `rebalanceSiblingGroup`), so a branch that's grown doesn't start
 * overlapping its neighbor branch's own descendants. */
const subtreeYRange = (
  nodeId: string,
  byId: ReadonlyMap<string, ExcalidrawElement>,
  childrenOf: ReadonlyMap<string, ExcalidrawElement[]>,
): { minY: number; maxY: number } => {
  const node = byId.get(nodeId)!;
  let minY = node.y;
  let maxY = node.y + node.height;
  for (const child of childrenOf.get(nodeId) ?? []) {
    const childRange = subtreeYRange(child.id, byId, childrenOf);
    minY = Math.min(minY, childRange.minY);
    maxY = Math.max(maxY, childRange.maxY);
  }
  return { minY, maxY };
};

/** Repositions one sibling group (all children of `parentId`, or — when
 * `parentId` is the root — just those on `side`) so each sibling gets a
 * vertical "slot" sized to its own current subtree, packed without
 * overlap and centered on the branch (see `packSizesCentered`). Only
 * ever changes each sibling's *own* x/y — cascading that down to its
 * descendants (so a whole subtree moves together, not just its root) is
 * `reflowMindmap`'s job, triggered by the resulting stale `lastX/lastY`
 * the same way a manual drag is.
 *
 * Called once per ancestor level on every `addChildNode` (see there):
 * adding one idea can grow every ancestor's subtree up to the root, so
 * every level a new leaf's ancestors pass through potentially needs its
 * own siblings spread further apart too, not just the new leaf's
 * immediate siblings. */
const rebalanceSiblingGroup = (
  elements: readonly ExcalidrawElement[],
  boardId: string,
  parentId: string,
  side?: Side,
): readonly ExcalidrawElement[] => {
  const parent = findNode(elements, boardId, parentId);
  if (!parent) {
    return elements;
  }
  const isRoot = parent.customData.parentId === null;
  const nodes = getBoardNodes(elements, boardId);
  const allChildren = nodes.filter((n) => n.customData.parentId === parentId);
  const siblings = isRoot
    ? allChildren.filter((_, i) => sideForRootChildIndex(i) === side)
    : allChildren;
  if (siblings.length === 0) {
    return elements;
  }
  siblings.sort((a, b) => a.customData.order - b.customData.order);

  const byId = new Map(nodes.map((n) => [n.id, n as ExcalidrawElement]));
  const childrenOf = buildChildrenMap(nodes);
  const heights = siblings.map((s) => {
    const range = subtreeYRange(s.id, byId, childrenOf);
    return Math.max(s.height, range.maxY - range.minY);
  });
  const offsets = packSizesCentered(heights, SUBTREE_GAP);

  const angle = isRoot ? (side === "left" ? Math.PI : 0) : siblings[0].customData.angle;
  const depth = countDepth(elements, boardId, parentId) + 1;
  const radius = radiusForDepth(depth);
  const parentCenter = rectCenter(asRect(parent));
  const baseX = parentCenter.x + Math.cos(angle) * radius;
  const baseY = parentCenter.y + Math.sin(angle) * radius;
  const perpAngle = angle + Math.PI / 2;

  const updates = new Map<string, ExcalidrawElement>();
  siblings.forEach((sibling, i) => {
    const offset = offsets[i];
    const centerX = baseX + Math.cos(perpAngle) * offset;
    const centerY = baseY + Math.sin(perpAngle) * offset;
    const newX = centerX - sibling.width / 2;
    const newY = centerY - sibling.height / 2;
    if (!numEquals(newX, sibling.x) || !numEquals(newY, sibling.y)) {
      updates.set(sibling.id, newElementWith(sibling, { x: newX, y: newY }));
    }
  });
  if (updates.size === 0) {
    return elements;
  }
  return elements.map((el) => updates.get(el.id) ?? el);
};

/** Moves an element and, crucially, its bound label along with it — a
 * programmatic `updateScene` that changes an element's x/y doesn't drag
 * its bound text along the way an *interactive* move does, so the "+"
 * buttons' labels would otherwise detach and stay behind every time
 * reflow repositions the button itself. */
const moveWithBoundText = (
  elementsMap: ElementsMap,
  updates: Map<string, ExcalidrawElement>,
  element: ExcalidrawElement,
  x: number,
  y: number,
) => {
  const updated = newElementWith(element, { x, y });
  updates.set(element.id, updated);
  const boundText = getBoundTextElement(element, elementsMap);
  if (boundText) {
    const pos = computeBoundTextPosition(updated, boundText, elementsMap);
    updates.set(boundText.id, newElementWith(boundText, { x: pos.x, y: pos.y }));
  }
};

const applyUpdates = (
  elements: readonly ExcalidrawElement[],
  updates: Map<string, ExcalidrawElement>,
  additions: ExcalidrawElement[],
): ExcalidrawElement[] => [
  ...elements.map((el) => updates.get(el.id) ?? el),
  ...additions,
];

/** Reorders one board's own elements so its nodes/buttons/root-circle
 * (`frontIds`) paint above its own connectors — matching the reference
 * image where a branch's curve visually terminates at its label rather
 * than crossing over it. Deliberately scoped to *this board's own*
 * elements only (`scopeIds`, identified purely by their current array
 * positions): reordering only within those slots, leaving every element
 * of any other board (or anything else on the canvas) exactly where it
 * was.
 *
 * An earlier version moved `frontIds` to the very end of the *whole*
 * scene array instead. With a single board that's indistinguishable
 * from this, but with two or more mindmaps on the same canvas it
 * oscillates forever: each board's reflow bumps its own elements to the
 * global end, which knocks every other board's elements off the end,
 * making *their* next reflow think it needs reordering too — an
 * unbounded ping-pong between boards that never returns the same
 * `elements` reference twice, so `onChange` → `updateScene` → `onChange`
 * never converges and React eventually crashes ("Maximum update depth
 * exceeded"). Reordering only within this board's own slots can't
 * perturb another board's array positions, so that feedback loop can't
 * happen. */
/** Cheap check for whether `reorderWithinBoard` would actually change
 * anything, without allocating — lets the caller skip both it *and*
 * `applyUpdates` (which always allocates a new array) when nothing
 * needs to change at all, preserving the "same reference in, same
 * reference out" no-op guarantee `reflowMindmap` depends on to avoid
 * looping via `onChange` for no reason. */
const isAlreadyOrderedWithinBoard = (
  elements: readonly ExcalidrawElement[],
  scopeIds: ReadonlySet<string>,
  frontIds: ReadonlySet<string>,
): boolean => {
  let seenFront = false;
  for (const el of elements) {
    if (!scopeIds.has(el.id)) {
      continue;
    }
    if (frontIds.has(el.id)) {
      seenFront = true;
    } else if (seenFront) {
      return false;
    }
  }
  return true;
};

const reorderWithinBoard = (
  elements: readonly ExcalidrawElement[],
  scopeIds: ReadonlySet<string>,
  frontIds: ReadonlySet<string>,
): ExcalidrawElement[] => {
  const indices: number[] = [];
  const scoped: ExcalidrawElement[] = [];
  elements.forEach((el, i) => {
    if (scopeIds.has(el.id)) {
      indices.push(i);
      scoped.push(el);
    }
  });

  const front: ExcalidrawElement[] = [];
  const rest: ExcalidrawElement[] = [];
  for (const el of scoped) {
    (frontIds.has(el.id) ? front : rest).push(el);
  }
  const reordered = [...rest, ...front];

  if (reordered.every((el, i) => el.id === scoped[i].id)) {
    return elements as ExcalidrawElement[];
  }

  const next = elements.slice();
  indices.forEach((idx, i) => {
    next[idx] = reordered[i];
  });
  return next;
};

/** Recomputes connector curves and cascades node drags down their
 * subtree, from a board's current element positions + parent/child
 * links — the mind map equivalent of `reflowBoard`. Called continuously
 * from `onChange` (see useMindmapInteractions) so it stays live while a
 * node is mid-drag, not just once the drag ends.
 *
 * Unlike kanban cards, a node's position is free-form and can't be
 * re-derived from its parent alone, so instead of recomputing an
 * absolute layout every tick, this detects *movement* — a node whose
 * x/y no longer matches its own `customData.lastX/lastY` — and cascades
 * that same delta down to every descendant, before resyncing everyone's
 * lastX/lastY and redrawing every connector from the (possibly just
 * updated) node centers.
 *
 * Also cascades deletion: a node marked `isDeleted` (e.g. the user
 * pressed Delete on it) takes its whole subtree and connectors down
 * with it, so no orphaned branch is left floating.
 *
 * Returns the exact same `elements` reference when nothing needs to
 * change, so the caller can skip a redundant `updateScene` and avoid
 * looping back into `onChange` for no reason. */
export const reflowMindmap = (
  elements: readonly ExcalidrawElement[],
  boardId: string,
): ExcalidrawElement[] => {
  const nodes = getBoardNodes(elements, boardId);
  if (nodes.length === 0) {
    return elements as ExcalidrawElement[];
  }

  const updates = new Map<string, ExcalidrawElement>();
  const elementsMap: ElementsMap = new Map(elements.map((el) => [el.id, el]));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, (ExcalidrawElement & { customData: MindmapNodeData })[]>();
  for (const n of nodes) {
    const parentId = n.customData.parentId;
    if (parentId) {
      const list = childrenOf.get(parentId) ?? [];
      list.push(n);
      childrenOf.set(parentId, list);
    }
  }

  // --- cascade drags: accumulate each node's inherited delta (from a
  // dragged ancestor) plus its own raw delta, top-down. ---
  const finalPos = new Map<string, Point>();
  const roots = nodes.filter((n) => !n.customData.parentId || !byId.has(n.customData.parentId));

  const visit = (node: ExcalidrawElement & { customData: MindmapNodeData }, inheritedDx: number, inheritedDy: number) => {
    const rawDx = node.x - node.customData.lastX;
    const rawDy = node.y - node.customData.lastY;
    const finalX = node.x + inheritedDx;
    const finalY = node.y + inheritedDy;
    finalPos.set(node.id, { x: finalX, y: finalY });

    const outgoingDx = inheritedDx + rawDx;
    const outgoingDy = inheritedDy + rawDy;
    for (const child of childrenOf.get(node.id) ?? []) {
      visit(child, outgoingDx, outgoingDy);
    }
  };
  for (const root of roots) {
    visit(root, 0, 0);
  }

  for (const node of nodes) {
    const pos = finalPos.get(node.id) ?? { x: node.x, y: node.y };
    const data = node.customData;
    const isRoot = data.parentId === null;
    const positionChanged = !numEquals(pos.x, node.x) || !numEquals(pos.y, node.y);
    const metaChanged = !numEquals(pos.x, data.lastX) || !numEquals(pos.y, data.lastY);
    if (positionChanged || metaChanged) {
      updates.set(
        node.id,
        newElementWith(node, {
          ...(positionChanged ? { x: pos.x, y: pos.y } : {}),
          ...(metaChanged
            ? { customData: { ...data, lastX: pos.x, lastY: pos.y } }
            : {}),
        }),
      );
    }

    // Button/background offsets are also re-derived from the node's
    // *current* width/height even when its position hasn't moved, so a
    // node that grows wider (its text edited in place) still keeps its
    // "+" button glued past its new edge instead of overlapping it.
    const btn = findChildButton(elements, boardId, node.id);
    if (btn) {
      const { dx, dy } = isRoot
        ? {
            dx: node.width / 2 + ROOT_CIRCLE_SIZE / 2 + 14,
            dy: node.height / 2 - ADD_CHILD_BUTTON_SIZE / 2,
          }
        : addChildButtonOffset(node.width, node.height);
      const bx = pos.x + dx;
      const by = pos.y + dy;
      if (!numEquals(bx, btn.x) || !numEquals(by, btn.y)) {
        moveWithBoundText(elementsMap, updates, btn, bx, by);
      }
    }

    if (isRoot) {
      const bg = findRootBackground(elements, boardId, node.id);
      if (bg) {
        const centerX = pos.x + node.width / 2;
        const centerY = pos.y + node.height / 2;
        const bx = centerX - ROOT_CIRCLE_SIZE / 2;
        const by = centerY - ROOT_CIRCLE_SIZE / 2;
        if (!numEquals(bx, bg.x) || !numEquals(by, bg.y)) {
          updates.set(bg.id, newElementWith(bg, { x: bx, y: by }));
        }
      }
    }
  }

  // --- redraw every connector from (possibly just-updated) node centers ---
  const updatedOf = (id: string) => {
    const node = byId.get(id);
    return node ? updates.get(id) ?? node : null;
  };

  for (const connector of getBoardConnectors(elements, boardId)) {
    const data = connector.customData as { parentId: string; childId: string };
    const parentNode = updatedOf(data.parentId);
    const childNode = updatedOf(data.childId);
    if (!parentNode || !childNode) {
      continue;
    }
    const from = rectCenter(asRect(parentNode));
    const to = rectCenter(asRect(childNode));
    const parentData = parentNode.customData as MindmapNodeData;
    const fromInset =
      parentData.parentId === null ? ROOT_CIRCLE_SIZE / 2 : nodeInset(parentNode);
    const toInset = nodeInset(childNode);
    const geo = connectorGeometry(from, to, fromInset, toInset);
    const pointsChanged =
      geo.points.length !== connector.points.length ||
      geo.points.some((p, i) => {
        const existing = connector.points[i];
        return !existing || !numEquals(p[0], existing[0]) || !numEquals(p[1], existing[1]);
      });
    const posChanged = !numEquals(geo.x, connector.x) || !numEquals(geo.y, connector.y);
    if (pointsChanged || posChanged) {
      updates.set(
        connector.id,
        newElementWith(connector, { x: geo.x, y: geo.y, points: geo.points }),
      );
    }
  }

  // --- cascade delete: a deleted node takes its subtree + connectors down ---
  const deletedIds = new Set<string>();
  const collectDeletedSubtree = (nodeId: string) => {
    for (const child of childrenOf.get(nodeId) ?? []) {
      if (!deletedIds.has(child.id)) {
        deletedIds.add(child.id);
        collectDeletedSubtree(child.id);
      }
    }
  };
  for (const el of elements) {
    if (
      el.isDeleted &&
      isMindmapData(el.customData) &&
      el.customData.boardId === boardId &&
      el.customData.role === "node" &&
      !deletedIds.has(el.id)
    ) {
      deletedIds.add(el.id);
      collectDeletedSubtree(el.id);
    }
  }
  if (deletedIds.size > 0) {
    for (const el of elements) {
      if (el.isDeleted || !isMindmapData(el.customData) || el.customData.boardId !== boardId) {
        continue;
      }
      const data = el.customData;
      const shouldDelete =
        (data.role === "node" && deletedIds.has(el.id)) ||
        (data.role === "connector" &&
          (deletedIds.has(data.parentId) || deletedIds.has(data.childId))) ||
        ((data.role === "addChildButton" || data.role === "rootBackground") &&
          deletedIds.has(data.nodeId));
      if (shouldDelete) {
        updates.set(el.id, newElementWith(updates.get(el.id) ?? el, { isDeleted: true }));
      }
    }
  }

  // Nodes (+ their buttons/root-circle) should always paint above this
  // board's own connectors — scoped to just this board's elements (see
  // `reorderWithinBoard`'s doc comment for why a global reorder isn't
  // safe once more than one board is on the canvas).
  const scopeIds = new Set<string>();
  const frontIds = new Set<string>();
  for (const el of elements) {
    if (!isMindmapData(el.customData) || el.customData.boardId !== boardId) {
      continue;
    }
    const willBeDeleted = updates.get(el.id)?.isDeleted;
    if (willBeDeleted) {
      continue;
    }
    scopeIds.add(el.id);
    if (
      el.customData.role === "node" ||
      el.customData.role === "addChildButton" ||
      el.customData.role === "rootBackground"
    ) {
      frontIds.add(el.id);
    }
  }

  const needsReorder = !isAlreadyOrderedWithinBoard(elements, scopeIds, frontIds);
  if (updates.size === 0 && !needsReorder) {
    return elements as ExcalidrawElement[];
  }

  const next = applyUpdates(elements, updates, []);
  return needsReorder ? reorderWithinBoard(next, scopeIds, frontIds) : next;
};

const addNodeWithChildButton = (
  builder: MindmapElementsBuilder,
  opts: {
    id: string;
    boardId: string;
    parentId: string | null;
    order: number;
    angle: number;
    color: string;
    center: Point;
    text: string;
    depth: number;
    isRoot?: boolean;
  },
) => {
  const fontSize = fontSizeForDepth(opts.depth);
  // Text elements measure themselves once converted; place top-left from
  // an estimate so the *initial* center is close, reflow settles the rest.
  const estWidth = estimateTextWidth(opts.text, fontSize);
  const x = opts.center.x - estWidth / 2;
  const y = opts.center.y - fontSize / 2;
  builder.addNode({
    id: opts.id,
    boardId: opts.boardId,
    parentId: opts.parentId,
    order: opts.order,
    angle: opts.angle,
    color: opts.color,
    x,
    y,
    text: opts.text,
    fontSize,
  });
  const { dx, dy } = opts.isRoot
    ? {
        dx: estWidth / 2 + ROOT_CIRCLE_SIZE / 2 + 14,
        dy: fontSize / 2 - ADD_CHILD_BUTTON_SIZE / 2,
      }
    : addChildButtonOffset(estWidth, fontSize);
  builder.addChildButton({
    id: newElementId(),
    boardId: opts.boardId,
    nodeId: opts.id,
    x: x + dx,
    y: y + dy,
  });
  return { x, y, width: estWidth, height: fontSize };
};

/** Builds a mind map with nothing but its central topic — no starter
 * branches. The caller (see `insertMindmapBoard`) immediately puts the
 * root into text-editing mode with its default label selected, so
 * typing a real topic and pressing Enter (see `useMindmapInteractions`)
 * is the very first thing that happens, and the first *idea* only
 * exists once the user actually asks for one. */
export const buildInitialMindmapElements = (
  cx: number,
  cy: number,
): { elements: ExcalidrawElement[]; rootId: string } => {
  const boardId = newBoardId();
  const builder = new MindmapElementsBuilder();

  const rootId = newElementId();
  // Pushed before the root's own text so it stays visually behind it —
  // see `addRootBackground`'s doc comment.
  builder.addRootBackground({
    id: newElementId(),
    boardId,
    nodeId: rootId,
    x: cx - ROOT_CIRCLE_SIZE / 2,
    y: cy - ROOT_CIRCLE_SIZE / 2,
  });
  addNodeWithChildButton(builder, {
    id: rootId,
    boardId,
    parentId: null,
    order: 0,
    angle: 0,
    color: ROOT_COLOR,
    isRoot: true,
    center: { x: cx, y: cy },
    text: DEFAULT_ROOT_TEXT,
    depth: 0,
  });

  return { elements: builder.build(), rootId };
};

/** Adds a new child node (+ its own "+" button and the connector back to
 * its parent) and lets `reflowMindmap` settle the rest — z-order, and
 * (if the parent itself is mid-drag) position cascade. Returns the new
 * node's id alongside the updated elements so the caller can put it
 * straight into text-editing mode. */
export const addChildNode = (
  elements: readonly ExcalidrawElement[],
  boardId: string,
  parentId: string,
): { elements: ExcalidrawElement[]; newNodeId: string } | null => {
  const parent = findNode(elements, boardId, parentId);
  if (!parent) {
    return null;
  }
  const parentData = parent.customData;
  const isRoot = parentData.parentId === null;
  const siblings = getBoardNodes(elements, boardId).filter(
    (n) => n.customData.parentId === parentId,
  );
  const order = siblings.length;
  const parentDepth = countDepth(elements, boardId, parentId);
  const childDepth = parentDepth + 1;
  const color = isRoot ? BRANCH_COLORS[order % BRANCH_COLORS.length] : parentData.color;

  const parentCenter = rectCenter(asRect(parent));

  // Root's children alternate sides (see `sideForRootChildIndex`) — a
  // provisional slot for the new node itself; `rebalanceSiblingGroup`
  // (below, once the node actually exists) repositions it precisely
  // alongside its siblings, sized to each one's real subtree.
  const side = isRoot ? sideForRootChildIndex(order) : undefined;
  const { center, angle } = computeChildCenter(
    { center: parentCenter, angle: parentData.angle, isRoot, depth: parentDepth },
    order,
    order + 1,
    side,
  );

  const builder = new MindmapElementsBuilder();
  const childId = newElementId();
  const childSize = addNodeWithChildButton(builder, {
    id: childId,
    boardId,
    parentId,
    order,
    angle,
    color,
    center,
    text: DEFAULT_NODE_TEXT,
    depth: childDepth,
  });
  builder.addConnector({
    id: newElementId(),
    boardId,
    parentId,
    childId,
    from: parentCenter,
    to: center,
    color,
    fromInset: isRoot ? ROOT_CIRCLE_SIZE / 2 : nodeInset(asRect(parent)),
    toInset: nodeInset(childSize),
  });

  let withNewChild: readonly ExcalidrawElement[] = [...elements, ...builder.build()];

  // A branch that just grew needs more room than a fixed spacing would
  // give it, or it starts overlapping its neighbor branch's own
  // descendants — not just at the level the new idea was added, but at
  // every ancestor level up to the root, since each one's subtree also
  // just grew. Walk that whole chain, re-packing each level's sibling
  // group (see `rebalanceSiblingGroup`) by every sibling's *current*
  // subtree size. A node's own `order` is stable once assigned, so
  // re-deriving its root side from it (rather than tracking it through
  // the walk) stays correct at every step.
  let node = findNode(withNewChild, boardId, childId)!;
  while (node.customData.parentId) {
    const groupParentId = node.customData.parentId;
    const groupParent = findNode(withNewChild, boardId, groupParentId);
    if (!groupParent) {
      break;
    }
    const groupSide =
      groupParent.customData.parentId === null
        ? sideForRootChildIndex(node.customData.order)
        : undefined;
    withNewChild = rebalanceSiblingGroup(withNewChild, boardId, groupParentId, groupSide);
    const nextNode = findNode(withNewChild, boardId, groupParentId);
    if (!nextNode) {
      break;
    }
    node = nextNode;
  }

  return { elements: reflowMindmap(withNewChild, boardId), newNodeId: childId };
};

/** Marks a node deleted and lets `reflowMindmap` cascade that down to
 * its own descendants, connectors and button — same cascade a native
 * Delete keypress on a node already triggers (see `reflowMindmap`'s
 * doc comment), just invoked directly. Used to drop a node that was
 * created but never actually turned into a real idea (see
 * `useMindmapInteractions`'s Enter handling). */
export const deleteNode = (
  elements: readonly ExcalidrawElement[],
  boardId: string,
  nodeId: string,
): ExcalidrawElement[] => {
  const node = findNode(elements, boardId, nodeId);
  if (!node) {
    return elements as ExcalidrawElement[];
  }
  const next = elements.map((el) =>
    el.id === nodeId ? newElementWith(el, { isDeleted: true }) : el,
  );
  return reflowMindmap(next, boardId);
};

const countDepth = (
  elements: readonly ExcalidrawElement[],
  boardId: string,
  nodeId: string,
): number => {
  let depth = 0;
  let current = findNode(elements, boardId, nodeId);
  while (current && current.customData.parentId) {
    depth += 1;
    current = findNode(elements, boardId, current.customData.parentId);
  }
  return depth;
};
