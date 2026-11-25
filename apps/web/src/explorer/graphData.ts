import {
  expansionModes,
  relationKinds,
  type Edge,
  type Repo,
  type Result,
} from "./contracts";
import { edgeKey } from "./explorationData";
export type GraphNode = {
  id: string;
  kind: "repo" | "topic";
  label: string;
  repo?: Repo;
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
};
export type GraphLink = {
  source: string | GraphNode;
  target: string | GraphNode;
  kind?: string;
  basis?: string;
  relations?: Edge[];
  curvature?: number;
};
export type GraphData = { nodes: GraphNode[]; links: GraphLink[] };
export const endpoint = (value: string | GraphNode) =>
  typeof value === "string" ? value : value.id;

export function relationshipLabel(link: GraphLink, nodes: GraphNode[]): string {
  if (!link.relations?.length) return "";
  const label = (id: string) =>
    nodes.find((node) => node.id === id)?.label || id;
  const modes = [
    ...new Set(
      link.relations.map((edge) =>
        edge.knowledge
          ? `${relationKinds[edge.knowledge.kind]} · ${edge.knowledge.claim}`
          : edge.mode
            ? expansionModes[edge.mode]
            : "关联线索",
      ),
    ),
  ];
  const symmetric = link.relations.every(
    (edge) =>
      edge.knowledge &&
      ["same_problem", "complements"].includes(edge.knowledge.kind),
  );
  return `${label(endpoint(link.source))} ${symmetric ? "↔" : "→"} ${label(endpoint(link.target))} · ${modes.join(" / ")}`;
}

// The renderer mutates its own nodes; API records remain immutable.
export function buildGraph(
  data: Result,
  previous: GraphData,
  anchorId: string | null,
  showTopics = true,
): GraphData {
  const old = new Map(previous.nodes.map((n) => [n.id, n]));
  const nodes: GraphNode[] = data.repos.map((repo) =>
    Object.assign(
      old.get(repo.id) || {
        id: repo.id,
        kind: "repo" as const,
        label: repo.name,
      },
      { repo, label: repo.name },
    ),
  );
  const ids = new Set(nodes.map((n) => n.id)),
    links: GraphLink[] = [],
    seen = new Set<string>();
  const relationLinks = new Map<string, GraphLink>();
  const edges: Edge[] = [
    ...data.edges,
    ...(data.atlas?.relations || []).map((knowledge) => ({
      source: knowledge.source,
      target: knowledge.target,
      kind: "knowledge_relation",
      knowledge,
    })),
  ];
  for (const edge of edges) {
    if (
      (edge.kind === "explore_relation" ||
        edge.kind === "knowledge_relation") &&
      ids.has(edge.source) &&
      ids.has(edge.target)
    ) {
      const key = edgeKey(edge);
      if (!seen.has(key)) {
        const pair = edge.source + "/" + edge.target;
        const existing = relationLinks.get(pair);
        if (existing) {
          existing.relations!.push(edge);
          if (edge.knowledge?.basis === "documented")
            existing.basis = "documented_reference";
          if (edge.basis === "documented_reference")
            existing.basis = edge.basis;
        } else {
          const link = {
            source: edge.source,
            target: edge.target,
            kind: "explore_relation",
            basis:
              edge.knowledge?.basis === "documented"
                ? "documented_reference"
                : edge.basis,
            relations: [edge],
          };
          relationLinks.set(pair, link);
          links.push(link);
        }
        seen.add(key);
      }
      continue;
    }
    if (
      !showTopics ||
      edge.kind !== "github_topic" ||
      !ids.has(edge.source) ||
      !edge.target.startsWith("topic:")
    )
      continue;
    if (!ids.has(edge.target)) {
      nodes.push(
        old.get(edge.target) || {
          id: edge.target,
          kind: "topic",
          label: edge.target.slice(6),
        },
      );
      ids.add(edge.target);
    }
    const key = edge.source + "/" + edge.target;
    if (!seen.has(key)) {
      links.push({ source: edge.source, target: edge.target });
      seen.add(key);
    }
  }
  for (const link of relationLinks.values()) {
    link.curvature = relationLinks.has(
      `${endpoint(link.target)}/${endpoint(link.source)}`,
    )
      ? 0.18
      : 0;
  }
  const anchor = anchorId ? old.get(anchorId) : undefined;
  // Material updates and new edges must not release already settled nodes.
  nodes.forEach((node, index) => {
    if (old.has(node.id) && node.x !== undefined) {
      if (anchor) {
        node.fx = node.x;
        node.fy = node.y;
        node.fz = node.z;
      }
      return;
    }
    const angle = index * 2.399963,
      radius = anchor ? 35 + (index % 5) * 9 : 60 + Math.sqrt(index + 1) * 24;
    node.x = (anchor?.x || 0) + Math.cos(angle) * radius;
    node.y = (anchor?.y || 0) + Math.sin(angle) * radius;
    node.z = (anchor?.z || 0) + ((index % 7) - 3) * 22;
  });
  // Repositories without topics remain visible, without inventing relationships.
  const linked = new Set(
    links.flatMap((link) => [endpoint(link.source), endpoint(link.target)]),
  );
  const isolated = nodes.filter((node) => !linked.has(node.id));
  isolated.forEach((node, index) => {
    if (old.has(node.id)) return;
    const angle = (2 * Math.PI * index) / isolated.length;
    node.x = node.fx = Math.cos(angle) * 180;
    node.y = node.fy = Math.sin(angle) * 180;
    node.z = node.fz = 0;
  });
  return { nodes, links };
}

export function graphTopology(graph: GraphData): string {
  return JSON.stringify([
    graph.nodes.map((node) => node.id).sort(),
    graph.links
      .map((link) => `${endpoint(link.source)}>${endpoint(link.target)}`)
      .sort(),
  ]);
}
