import { useState } from "react";
import type { Result, Repo } from "../contracts";
import type { useExplorer } from "../useExplorer";
import { DEFAULT_FILTERS } from "../searchFilters";
import recording from "./local-llm.json";

const snapshot = recording.result as Result;
const idle = () => {};
const locked = async () => {};

// This controller never mounts the live search/Atlas hooks or imports their API.
export function useStaticExplorer(): ReturnType<typeof useExplorer> {
  const [data] = useState(() => ({
    ...snapshot,
    atlas: snapshot.atlas,
    repos: snapshot.repos.map(repo => ({
      ...repo,
      understanding: snapshot.atlas?.understandings.find(item => item.repo_id === repo.id),
    })),
  }));
  const [selected, setSelected] = useState<Repo | null>(null);
  const [topic, setTopic] = useState("");
  return {
    data,
    atlas: {
      result: snapshot.atlas,
      progress: undefined,
      error: "",
      busy: false,
      elapsed: 0,
      connection: "",
      reset: idle,
      start: locked,
      message: "",
    },
    selected: selected ? { ...selected, understanding: selected.understanding, relations: selected.relations } : null,
    topic,
    query: recording.query,
    page: 1,
    filters: DEFAULT_FILTERS,
    busy: false,
    detailBusy: false,
    error: "",
    detailError: "",
    notice: "",
    revision: 1,
    anchor: null,
    expansionAction: null,
    inspect: async repo => { setSelected(data.repos.find(item => item.id === repo.id) ?? repo); },
    close: () => setSelected(null),
    filterTopic: value => { setTopic(value); setSelected(null); },
    search: locked,
    expand: locked,
    retry: locked,
  };
}
