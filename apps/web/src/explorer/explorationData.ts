import type { Edge, ExpansionMode, Result } from "./contracts";

export const edgeKey = (edge: Edge) =>
  `${edge.source}/${edge.target}/${edge.kind}/${edge.mode || edge.knowledge?.kind || ""}`;

export function expansionContext(
  data: Result,
  source: string,
  mode: ExpansionMode,
) {
  // Exclude a completed relationship, not every repository already on the map.
  const completed = new Set(
    data.edges
      .filter(
        (edge) =>
          edge.kind === "explore_relation" &&
          edge.source === source &&
          edge.mode === mode,
      )
      .map((edge) => edge.target),
  );
  for (const repo of data.repos) {
    if (
      repo.relations?.some(
        (relation) => relation.source_id === source && relation.mode === mode,
      )
    )
      completed.add(repo.id);
  }
  return {
    known_ids: data.repos.map((repo) => repo.id),
    seen_ids: data.repos
      .filter((repo) => completed.has(repo.id))
      .map((repo) => repo.id),
  };
}

export function explorationChanges(previous: Result, next: Result) {
  const repos = new Set(previous.repos.map((repo) => repo.id));
  const edges = new Set(previous.edges.map(edgeKey));
  return {
    projects: next.repos.filter((repo) => !repos.has(repo.id)).length,
    relations: next.edges.filter(
      (edge) => edge.kind === "explore_relation" && !edges.has(edgeKey(edge)),
    ).length,
  };
}

export function mergeExploration(old: Result, next: Result): Result {
  const merged = new Map(old.repos.map((repo) => [repo.id, repo]));
  for (const repo of next.repos) {
    const previous = merged.get(repo.id);
    const relations = [
      ...new Map(
        [...(previous?.relations || []), ...(repo.relations || [])].map(
          (relation) => [`${relation.source_id}/${relation.mode}`, relation],
        ),
      ).values(),
    ];
    merged.set(repo.id, { ...previous, ...repo, relations });
  }
  const repos = [...merged.values()].slice(0, 120);
  const ids = new Set(repos.map((r) => r.id));
  const edges = [
    ...new Map(
      [...old.edges, ...next.edges]
        .filter(
          (e) =>
            ids.has(e.source) &&
            (e.kind === "github_topic" || ids.has(e.target)),
        )
        .map((e) => [edgeKey(e), e]),
    ).values(),
  ];
  return {
    ...next,
    analysis_available: next.analysis_available ?? old.analysis_available,
    repos,
    edges,
  };
}
