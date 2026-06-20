import type { GraphNode } from "./api";

const RING_RADIUS = 4.2;

export function ringPosition(index: number, total: number, radius = RING_RADIUS): [number, number, number] {
  if (total <= 0) return [0, 0, 0];
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  const yWave = Math.sin(angle * 2) * 0.35;
  return [Math.cos(angle) * radius, yWave, Math.sin(angle) * radius * 0.55];
}

export function nodeLabel(node: GraphNode): string {
  if (node.year) return `${node.title} (${node.year})`;
  return node.title;
}
