export type ViewMode = "2d" | "3d";

const NODE_DIAMETER = 3.4;
const MIN_RADIUS = 5.5;
const GAP = 0.55;

export function layoutRingTuples(count: number, mode: ViewMode = "3d"): [number, number, number][] {
  if (count <= 0) return [];

  const spacing = NODE_DIAMETER + GAP;
  const circumference = count * spacing;
  const radius = Math.max(MIN_RADIUS, circumference / (2 * Math.PI));

  const positions: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    if (mode === "2d") {
      positions.push([Math.cos(angle) * radius, Math.sin(angle) * radius, 0]);
    } else {
      positions.push([
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.12,
        Math.sin(angle) * radius * 0.25,
      ]);
    }
  }
  return positions;
}

export function nodeDescription(node: {
  type: "movie" | "person";
  title: string;
  subtitle?: string;
  year?: string;
}): string {
  if (node.type === "movie") {
    return node.year ? `Movie · ${node.year}` : "Movie";
  }
  if (node.subtitle && node.subtitle !== "Actor") {
    return `Actor · ${node.subtitle}`;
  }
  return "Actor";
}

export function nodeLabel(node: { title: string; year?: string }): string {
  if (node.year) return `${node.title} (${node.year})`;
  return node.title;
}
