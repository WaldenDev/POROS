import { useEffect, useMemo, useState } from "react";
import type { Repo } from "./contracts";
import {
  captureProject,
  MAX_SELECTION,
  refreshProjects,
  restoreProjects,
  SELECTION_KEY,
  toggleProject,
} from "./selectionContext";

export function useProjectSelection(
  repos: Repo[],
  query: string,
  atlasId: string | null,
  storageKey = SELECTION_KEY,
) {
  const [projects, setProjects] = useState(() => {
    try {
      return restoreProjects(localStorage.getItem(storageKey));
    } catch {
      return [];
    }
  });
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setProjects((old) => refreshProjects(old, repos, atlasId));
  }, [repos, atlasId]);
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ schema_version: "selection-draft.v1", projects }),
      );
      setError("");
    } catch {
      setError("本地保存失败，选集仅在本次页面中保留。");
    }
  }, [projects, storageKey]);
  const ids = useMemo(
    () => new Set(projects.map((item) => item.repo.id)),
    [projects],
  );
  return {
    projects,
    ids,
    selecting,
    setSelecting,
    error,
    full: projects.length >= MAX_SELECTION,
    toggle(repo: Repo) {
      const onMap = repos.some((item) => item.id === repo.id);
      setProjects((old) =>
        toggleProject(
          old,
          captureProject(repo, onMap ? query : null, onMap ? atlasId : null),
        ),
      );
    },
    remove(id: string) {
      setProjects((old) => old.filter((item) => item.repo.id !== id));
    },
    clear() {
      setProjects([]);
    },
  };
}
