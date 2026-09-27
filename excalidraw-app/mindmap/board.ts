import { newElementWith } from "@excalidraw/element";

import type { ExcalidrawArrowElement, ExcalidrawElement } from "@excalidraw/element/types";

import {
  MindmapElementsBuilder,
  addChildButtonOffset,
  newBoardId,
  newElementId,
} from "./elements";
import {
  BRANCH_COLORS,
  ROOT_COLOR,
  computeChildCenter,
  connectorGeometry,
  estimateTextWidth,
  fontSizeForDepth,
  rectCenter,
  asRect,
  type Point,
} from "./layout";
import { isMindmapData, type MindmapNodeData } from "./types";

const EPS = 0.01;
const numEquals = (a: number, b: number) => Math.abs(a - b) < EPS;

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

const applyUpdates = (
  elements: readonly ExcalidrawElement[],
  updates: Map<string, ExcalidrawElement>,
  additions: ExcalidrawElement[],
): ExcalidrawElement[] => [
  ...elements.map((el) => updates.get(el.id) ?? el),
  ...additions,
];

/** Moves the given elements to the end of the array (highest paint
 * order) — nodes (and their "+" buttons) should always paint above the
 * curved connectors, matching the reference image where a branch's
 * curve visually terminates at its label rather than crossing over it. */
const bringToFront = (
  elements: readonly ExcalidrawElement[],
  ids: ReadonlySet<string>,
): ExcalidrawElement[] => {
  const front: ExcalidrawElement[] = [];
  const rest: ExcalidrawElement[] = [];
  for (const el of elements) {
    (ids.has(el.id) ? front : rest).push(el);
  }
  return [...rest, ...front];
};

const isAlreadyAtFront = (
  elements: readonly ExcalidrawElement[],
  ids: ReadonlySet<string>,
): boolean => {
  if (ids.size === 0) {
    return true;
  }
  const tail = elements.slice(elements.length - ids.size);
  return tail.length === ids.size && tail.every((el) => ids.has(el.id));
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
    const positionChanged = !numEquals(pos.x, node.x) || !numEquals(pos.y, node.y);
    const metaChanged = !numEquals(pos.x, data.lastX) || !numEquals(pos.y, data.lastY);
    if (!positionChanged && !metaChanged) {
      continue;
    }
    updates.set(
      node.id,
      newElementWith(node, {
        ...(positionChanged ? { x: pos.x, y: pos.y } : {}),
        ...(metaChanged
          ? { customData: { ...data, lastX: pos.x, lastY: pos.y } }
          : {}),
      }),
    );

    const btn = findChildButton(elements, boardId, node.id);
    if (btn) {
      const { dx, dy } = addChildButtonOffset(node.width, node.height);
      const bx = pos.x + dx;
      const by = pos.y + dy;
      if (!numEquals(bx, btn.x) || !numEquals(by, btn.y)) {
        updates.set(btn.id, newElementWith(btn, { x: bx, y: by }));
      }
    }
  }

  // --- redraw every connector from (possibly just-updated) node centers ---
  const centerOf = (id: string): Point | null => {
    const node = byId.get(id);
    if (!node) {
      return null;
    }
    const updated = updates.get(id) ?? node;
    return rectCenter(asRect(updated));
  };

  for (const connector of getBoardConnectors(elements, boardId)) {
    const data = connector.customData as { parentId: string; childId: string };
    const from = centerOf(data.parentId);
    const to = centerOf(data.childId);
    if (!from || !to) {
      continue;
    }
    const geo = connectorGeometry(from, to);
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
        (data.role === "addChildButton" && deletedIds.has(data.nodeId));
      if (shouldDelete) {
        updates.set(el.id, newElementWith(updates.get(el.id) ?? el, { isDeleted: true }));
      }
    }
  }

  // Nodes (+ their buttons) should always paint above connectors.
  const frontIds = new Set<string>();
  for (const el of elements) {
    if (!isMindmapData(el.customData) || el.customData.boardId !== boardId) {
      continue;
    }
    const willBeDeleted = updates.get(el.id)?.isDeleted;
    if (willBeDeleted) {
      continue;
    }
    if (el.customData.role === "node" || el.customData.role === "addChildButton") {
      frontIds.add(el.id);
    }
  }
  const needsReorder = !isAlreadyAtFront(elements, frontIds);

  if (updates.size === 0 && !needsReorder) {
    return elements as ExcalidrawElement[];
  }

  const next = applyUpdates(elements, updates, []);
  return needsReorder ? bringToFront(next, frontIds) : next;
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
  const { dx, dy } = addChildButtonOffset(estWidth, fontSize);
  builder.addChildButton({
    id: newElementId(),
    boardId: opts.boardId,
    nodeId: opts.id,
    x: x + dx,
    y: y + dy,
  });
  return { x, y, width: estWidth, height: fontSize };
};

export const buildInitialMindmapElements = (cx: number, cy: number): ExcalidrawElement[] => {
  const boardId = newBoardId();
  const builder = new MindmapElementsBuilder();

  const rootId = newElementId();
  addNodeWithChildButton(builder, {
    id: rootId,
    boardId,
    parentId: null,
    order: 0,
    angle: 0,
    color: ROOT_COLOR,
    center: { x: cx, y: cy },
    text: "Sujet central",
    depth: 0,
  });

  const branchTexts = ["Idée 1", "Idée 2", "Idée 3"];
  branchTexts.forEach((text, index) => {
    const color = BRANCH_COLORS[index % BRANCH_COLORS.length];
    const { center, angle } = computeChildCenter(
      { center: { x: cx, y: cy }, angle: 0, isRoot: true, depth: 0 },
      index,
      branchTexts.length,
    );
    const branchId = newElementId();
    addNodeWithChildButton(builder, {
      id: branchId,
      boardId,
      parentId: rootId,
      order: index,
      angle,
      color,
      center,
      text,
      depth: 1,
    });
    builder.addConnector({
      id: newElementId(),
      boardId,
      parentId: rootId,
      childId: branchId,
      from: { x: cx, y: cy },
      to: center,
      color,
    });
  });

  return builder.build();
};

/** Adds a new child node (+ its own "+" button and the connector back to
 * its parent) and lets `reflowMindmap` settle the rest — z-order, and
 * (if the parent itself is mid-drag) position cascade. */
export const addChildNode = (
  elements: readonly ExcalidrawElement[],
  boardId: string,
  parentId: string,
): ExcalidrawElement[] => {
  const parent = findNode(elements, boardId, parentId);
  if (!parent) {
    return elements as ExcalidrawElement[];
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

  const { center, angle } = computeChildCenter(
    {
      center: rectCenter(asRect(parent)),
      angle: parentData.angle,
      isRoot,
      depth: parentDepth,
    },
    order,
    order + 1,
  );

  const builder = new MindmapElementsBuilder();
  const childId = newElementId();
  addNodeWithChildButton(builder, {
    id: childId,
    boardId,
    parentId,
    order,
    angle,
    color,
    center,
    text: "Nouvelle idée",
    depth: childDepth,
  });
  builder.addConnector({
    id: newElementId(),
    boardId,
    parentId,
    childId,
    from: rectCenter(asRect(parent)),
    to: center,
    color,
  });

  const withNewChild = [...elements, ...builder.build()];
  return reflowMindmap(withNewChild, boardId);
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
