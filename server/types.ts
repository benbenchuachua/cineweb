export type NodeType = "movie" | "person";

export interface GraphNode {
  id: string;
  type: NodeType;
  tmdbId: number;
  title: string;
  subtitle?: string;
  imagePath: string | null;
  year?: string;
}

export interface GraphResponse {
  center: GraphNode;
  connections: GraphNode[];
}

export interface SearchResult {
  id: string;
  type: NodeType;
  tmdbId: number;
  title: string;
  subtitle?: string;
  imagePath: string | null;
  year?: string;
}

export interface SearchResponse {
  results: SearchResult[];
}

export interface RandomResponse {
  result: SearchResult;
}
