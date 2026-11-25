import type { Repo, Understanding } from "./contracts";

export const MAX_SELECTION = 7;
export const SELECTION_KEY = "poros-selection-v1";
export type SelectedProject = {
  repo: Pick<
    Repo,
    | "id"
    | "name"
    | "url"
    | "description"
    | "stars"
    | "language"
    | "topics"
    | "avatar"
  >;
  origin: { query: string | null; selected_at: string };
  knowledge: { atlas_id: string | null; understanding: Understanding } | null;
};
export type SelectionContext = {
  schema_version: "selection.v1";
  captured_at: string;
  projects: SelectedProject[];
};

export function captureProject(
  repo: Repo,
  query: string | null,
  atlasId: string | null,
  now = new Date().toISOString(),
): SelectedProject {
  return {
    repo: {
      id: repo.id,
      name: repo.name,
      url: `https://github.com/${repo.name.split("/").map(encodeURIComponent).join("/")}`,
      description: repo.description,
      stars: repo.stars,
      language: repo.language,
      topics: [...repo.topics],
      avatar: repo.avatar,
    },
    origin: { query, selected_at: now },
    knowledge: repo.understanding
      ? {
          atlas_id: atlasId,
          understanding: structuredClone(repo.understanding),
        }
      : null,
  };
}

export function toggleProject(
  projects: SelectedProject[],
  incoming: SelectedProject,
): SelectedProject[] {
  if (projects.some((item) => item.repo.id === incoming.repo.id))
    return projects.filter((item) => item.repo.id !== incoming.repo.id);
  return projects.length < MAX_SELECTION ? [...projects, incoming] : projects;
}

export function refreshProjects(
  projects: SelectedProject[],
  repos: Repo[],
  atlasId: string | null,
): SelectedProject[] {
  let changed = false;
  const next = projects.map((item) => {
    const repo = repos.find((repo) => repo.id === item.repo.id);
    if (!repo) return item;
    const updated = captureProject(
      repo,
      item.origin.query,
      atlasId,
      item.origin.selected_at,
    );
    // Metadata-only refreshes must not erase previously collected material.
    updated.knowledge ??= item.knowledge;
    if (JSON.stringify(updated) === JSON.stringify(item)) return item;
    changed = true;
    return updated;
  });
  return changed ? next : projects;
}

export function createSelectionContext(
  projects: SelectedProject[],
  now = new Date().toISOString(),
): SelectionContext {
  if (
    projects.length < 2 ||
    projects.length > MAX_SELECTION ||
    new Set(projects.map((item) => item.repo.id)).size !== projects.length
  ) {
    throw new Error(`选集需要 2–${MAX_SELECTION} 个不同的项目`);
  }
  return structuredClone({
    schema_version: "selection.v1",
    captured_at: now,
    projects,
  });
}

export function restoreProjects(raw: string | null): SelectedProject[] {
  try {
    if (!raw || raw.length > 512_000) return [];
    const value = JSON.parse(raw);
    if (
      value.schema_version !== "selection-draft.v1" ||
      !Array.isArray(value.projects)
    )
      return [];
    const result: SelectedProject[] = [];
    for (const item of value.projects) {
      const repo = item?.repo;
      if (
        !repo ||
        typeof repo.id !== "string" ||
        typeof repo.name !== "string" ||
        !/^[\w.-]+\/[\w.-]+$/.test(repo.name) ||
        ![repo.description, repo.language, repo.avatar].every(
          (value) => typeof value === "string",
        ) ||
        !Number.isFinite(repo.stars) ||
        repo.stars < 0 ||
        !Array.isArray(repo.topics) ||
        !repo.topics.every((t: unknown) => typeof t === "string") ||
        (item.origin?.query !== null &&
          typeof item.origin?.query !== "string") ||
        typeof item.origin?.selected_at !== "string" ||
        result.some((other) => other.repo.id === repo.id)
      )
        continue;
      const restored = captureProject(
        {
          ...repo,
          understanding: undefined,
          url: `https://github.com/${repo.name}`,
        },
        item.origin.query,
        null,
        item.origin.selected_at,
      );
      const knowledge = item.knowledge;
      const u = knowledge?.understanding;
      if (
        u &&
        u.repo_id === repo.id &&
        u.name === repo.name &&
        [
          "application",
          "library",
          "infrastructure",
          "resource",
          "example",
        ].includes(u.role) &&
        typeof u.snapshot_hash === "string" &&
        typeof u.fetched_at === "string" &&
        Array.isArray(u.unknowns) &&
        u.unknowns.every((v: unknown) => typeof v === "string") &&
        Array.isArray(u.facts) &&
        u.facts.every(
          (f: any) =>
            f &&
            f.repo_id === repo.id &&
            typeof f.id === "string" &&
            typeof f.claim === "string" &&
            ["purpose", "mechanism", "interface", "boundary"].includes(
              f.kind,
            ) &&
            f.citation &&
            ["document_id", "url", "excerpt", "kind", "snapshot_hash"].every(
              (key) => typeof f.citation[key] === "string",
            ) &&
            Number.isInteger(f.citation.start_line) &&
            Number.isInteger(f.citation.end_line),
        ) &&
        (knowledge.atlas_id === null || typeof knowledge.atlas_id === "string")
      )
        restored.knowledge = knowledge;
      result.push(restored);
      if (result.length === MAX_SELECTION) break;
    }
    return result;
  } catch {
    return [];
  }
}
