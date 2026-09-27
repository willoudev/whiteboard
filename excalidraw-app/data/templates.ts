import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { convertToExcalidrawElements } from "@excalidraw/element";
import { viewportCoordsToSceneCoords } from "@excalidraw/common";
import { pointFrom, type LocalPoint } from "@excalidraw/math";

import type { ExcalidrawElementSkeleton } from "@excalidraw/element";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

/** Rough width estimate (text elements measure their own real size once
 * converted, but the curve control point only needs an approximate
 * center to look right — it doesn't affect the actual binding). */
const estimateTextWidth = (text: string, fontSize: number) =>
  text.length * fontSize * 0.55;

/** A gently curved, arrowhead-less connector between two text nodes —
 * the "branch" look of a mindmap, as opposed to a straight
 * flowchart-style arrow.
 *
 * Deliberately NOT bound (no start/end id) to either node: as of
 * @excalidraw/element 2.2.x, convertToExcalidrawElements's binding
 * path for an arrow endpoint that references an existing plain text
 * element (as opposed to a container) unconditionally recomputes and
 * overwrites that text element's x/y from a formula that ignores the
 * *other* endpoint's position — which silently relocates every leaf
 * bound this way on top of its neighbours. Drawing a plain positioned
 * curve between the two known coordinates sidesteps that entirely; the
 * trade-off is the connector won't auto-follow if a node is dragged
 * later, same as any hand-drawn arrow. */
const addCurvedConnector = (
  elements: ExcalidrawElementSkeleton[],
  from: { cx: number; cy: number },
  to: { cx: number; cy: number },
  color: string,
  bulge: number,
  inset = 14,
) => {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  const startX = from.cx + ux * inset;
  const startY = from.cy + uy * inset;
  const segDx = dx - ux * inset * 2;
  const segDy = dy - uy * inset * 2;

  const perpX = (-segDy / len) * bulge;
  const perpY = (segDx / len) * bulge;

  const points: LocalPoint[] = [
    pointFrom<LocalPoint>(0, 0),
    pointFrom<LocalPoint>(segDx / 2 + perpX, segDy / 2 + perpY),
    pointFrom<LocalPoint>(segDx, segDy),
  ];

  elements.push({
    type: "arrow",
    x: startX,
    y: startY,
    points,
    roundness: { type: 2 },
    strokeColor: color,
    strokeWidth: 2,
    startArrowhead: null,
    endArrowhead: null,
  });
};

type MindmapNode = {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
};

const addTextNode = (
  elements: ExcalidrawElementSkeleton[],
  node: MindmapNode,
) => {
  elements.push({
    type: "text",
    id: node.id,
    x: node.x,
    y: node.y,
    text: node.text,
    fontSize: node.fontSize,
    strokeColor: node.color,
  });
};

const nodeCenter = (node: MindmapNode) => ({
  cx: node.x + estimateTextWidth(node.text, node.fontSize) / 2,
  cy: node.y + node.fontSize / 2,
});

const buildMindmapSkeleton = (
  cx: number,
  cy: number,
): ExcalidrawElementSkeleton[] => {
  const elements: ExcalidrawElementSkeleton[] = [];

  const root: MindmapNode = {
    id: "mindmap-root",
    x: cx - 65,
    y: cy - 16,
    text: "Sujet central",
    fontSize: 28,
    color: "#1e1e1e",
  };
  addTextNode(elements, root);
  const rootCenter = nodeCenter(root);

  const branches: {
    node: MindmapNode;
    leaves: MindmapNode[];
  }[] = [
    {
      node: {
        id: "mindmap-n",
        x: cx - 55,
        y: cy - 170,
        text: "Objectifs",
        fontSize: 20,
        color: "#e8590c",
      },
      leaves: [
        {
          id: "mindmap-n1",
          x: cx - 260,
          y: cy - 260,
          text: "Trafic du site",
          fontSize: 16,
          color: "#e8590c",
        },
        {
          id: "mindmap-n2",
          x: cx + 30,
          y: cy - 260,
          text: "Générer des leads",
          fontSize: 16,
          color: "#e8590c",
        },
      ],
    },
    {
      node: {
        id: "mindmap-e",
        x: cx + 220,
        y: cy - 26,
        text: "Audience",
        fontSize: 20,
        color: "#1971c2",
      },
      leaves: [
        {
          id: "mindmap-e1",
          x: cx + 440,
          y: cy - 90,
          text: "Démographie",
          fontSize: 16,
          color: "#1971c2",
        },
        {
          id: "mindmap-e2",
          x: cx + 440,
          y: cy + 30,
          text: "Comportements",
          fontSize: 16,
          color: "#1971c2",
        },
      ],
    },
    {
      node: {
        id: "mindmap-s",
        x: cx - 45,
        y: cy + 150,
        text: "Contenu",
        fontSize: 20,
        color: "#2f9e44",
      },
      leaves: [
        {
          id: "mindmap-s1",
          x: cx - 250,
          y: cy + 240,
          text: "Texte & images",
          fontSize: 16,
          color: "#2f9e44",
        },
        {
          id: "mindmap-s2",
          x: cx + 30,
          y: cy + 240,
          text: "Vidéos",
          fontSize: 16,
          color: "#2f9e44",
        },
      ],
    },
    {
      node: {
        id: "mindmap-w",
        x: cx - 340,
        y: cy - 26,
        text: "Mesures",
        fontSize: 20,
        color: "#9c36b5",
      },
      leaves: [
        {
          id: "mindmap-w1",
          x: cx - 560,
          y: cy - 90,
          text: "Portée",
          fontSize: 16,
          color: "#9c36b5",
        },
        {
          id: "mindmap-w2",
          x: cx - 560,
          y: cy + 30,
          text: "Taux de conversion",
          fontSize: 16,
          color: "#9c36b5",
        },
      ],
    },
  ];

  for (const branch of branches) {
    addTextNode(elements, branch.node);
    const branchCenter = nodeCenter(branch.node);
    addCurvedConnector(
      elements,
      rootCenter,
      branchCenter,
      branch.node.color,
      40,
    );

    for (const leaf of branch.leaves) {
      addTextNode(elements, leaf);
      addCurvedConnector(
        elements,
        branchCenter,
        nodeCenter(leaf),
        leaf.color,
        20,
      );
    }
  }

  return elements;
};

/** Inserts a template centered on the current viewport, the same way
 * pasting or dropping a library item does. */
const insertSkeleton = (
  excalidrawAPI: ExcalidrawImperativeAPI,
  buildSkeleton: (cx: number, cy: number) => ExcalidrawElementSkeleton[],
) => {
  const appState = excalidrawAPI.getAppState();
  const center = viewportCoordsToSceneCoords(
    {
      clientX: appState.offsetLeft + appState.width / 2,
      clientY: appState.offsetTop + appState.height / 2,
    },
    appState,
  );

  const newElements = convertToExcalidrawElements(
    buildSkeleton(center.x, center.y),
    { regenerateIds: true },
  );

  excalidrawAPI.updateScene({
    elements: [
      ...excalidrawAPI.getSceneElementsIncludingDeleted(),
      ...newElements,
    ],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};

export const insertMindmapTemplate = (
  excalidrawAPI: ExcalidrawImperativeAPI,
) => insertSkeleton(excalidrawAPI, buildMindmapSkeleton);
