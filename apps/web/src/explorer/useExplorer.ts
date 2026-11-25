import { useEffect, useMemo, useRef, useState } from "react";
import { useAtlas } from "./useAtlas";
import { DEFAULT_FILTERS, type SearchFilters } from "./searchFilters";
import {
  fetchExplore,
  repoPath,
  type Repo,
  type Result,
  type ExpansionMode,
} from "./api";
import {
  expansionContext,
  explorationChanges,
  mergeExploration,
} from "./explorationData";
type Action = {
  query: string;
  page: number;
  filters: SearchFilters;
  repo?: Repo;
  mode?: ExpansionMode;
  seen_ids?: string[];
  known_ids?: string[];
};
export function useExplorer() {
  const atlas = useAtlas();
  const [filters, setFilters] = useState<SearchFilters>({ ...DEFAULT_FILTERS });
  const [data, setData] = useState<Result>({
    repos: [],
    edges: [],
    warnings: [],
  });
  const [selected, setSelected] = useState<Repo | null>(null);
  const [topic, setTopic] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false),
    [detailBusy, setDetailBusy] = useState(false);
  const [error, setError] = useState(""),
    [detailError, setDetailError] = useState(""),
    [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0),
    [anchor, setAnchor] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null),
    detailRequest = useRef<AbortController | null>(null);
  const current = useRef(data);
  current.current = data;
  const last = useRef<Action>({
    query: "",
    page: 1,
    filters: { ...DEFAULT_FILTERS },
  });
  const expandedPages = useRef(new Map<string, number>());
  const [expansionAction, setExpansionAction] = useState<{
    source_id: string;
    mode: ExpansionMode;
  } | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      detailRequest.current?.abort();
    },
    [],
  );
  function close() {
    detailRequest.current?.abort();
    setSelected(null);
    setDetailBusy(false);
    setDetailError("");
  }
  function filterTopic(value: string) {
    setTopic(value);
    close();
  }
  async function run(action: Action) {
    if (!action.repo) atlas.reset();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    last.current = action;
    setExpansionAction(
      action.repo
        ? { source_id: action.repo.id, mode: action.mode || "alternatives" }
        : null,
    );
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await fetchExplore<Result>(
        action.repo ? repoPath(action.repo) + "/expand" : "/search",
        action.repo
          ? {
              page: action.page,
              mode: action.mode,
              seen_ids: action.seen_ids,
              known_ids: action.known_ids,
              filters: action.filters,
            }
          : { query: action.query, page: action.page, filters: action.filters },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (action.repo) {
        expandedPages.current.set(
          `${action.repo.id}/${action.mode}`,
          action.page,
        );
        const merged = mergeExploration(current.current, {
            ...result,
            repos: [action.repo, ...result.repos],
          }),
          added = explorationChanges(current.current, merged);
        setData(merged);
        setAnchor(action.repo.id);
        setTopic("");
        setNotice(
          added.projects || added.relations
            ? [
                added.projects
                  ? `新增 ${added.projects} 个项目`
                  : "已有项目之间",
                added.relations ? `补充 ${added.relations} 条关联` : "",
                merged.repos.length >= 120 ? "项目已达上限，仍可补充关联" : "",
              ]
                .filter(Boolean)
                .join(" · ")
            : merged.repos.length >= 120
              ? "已达到本轮 120 个项目上限，本页没有可补充的关联"
              : action.page >= 5
                ? "已查看前 5 页相关项目，请选择其他方向继续探索"
                : "本页没有符合当前筛选与证据要求的新项目或新关联，可继续下一页或换个方向",
        );
      } else {
        expandedPages.current.clear();
        close();
        setData(result);
        setAnchor(null);
        setTopic("");
        setQuery(action.query);
        setPage(action.page);
        setFilters(action.filters);
        setRevision((v) => v + 1);
        if (!result.repos.length)
          setNotice(
            "没有找到符合条件的项目，可降低最低 Star、放宽语言或提交时间，或更换关键词。",
          );
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (request.current === controller) setBusy(false);
    }
  }
  async function inspect(repo: Repo) {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setSelected(repo);
    setDetailBusy(true);
    setDetailError("");
    try {
      const detail = await fetchExplore<Repo>(
        repoPath(repo),
        undefined,
        controller.signal,
      );
      if (!controller.signal.aborted) setSelected({ ...repo, ...detail });
    } catch (e) {
      if (!controller.signal.aborted)
        setDetailError(e instanceof Error ? e.message : String(e));
    } finally {
      if (detailRequest.current === controller) setDetailBusy(false);
    }
  }
  const enriched = useMemo(
    () => ({
      ...data,
      atlas: atlas.result,
      repos: data.repos.map((repo) => ({
        ...repo,
        understanding: atlas.result?.understandings.find(
          (item) => item.repo_id === repo.id,
        ),
      })),
    }),
    [data, atlas.result],
  );
  return {
    data: enriched,
    atlas,
    selected: selected
      ? {
          ...selected,
          understanding: enriched.repos.find((repo) => repo.id === selected.id)
            ?.understanding,
          relations:
            data.repos.find((repo) => repo.id === selected.id)?.relations ??
            selected.relations,
        }
      : null,
    topic,
    query,
    page,
    filters,
    busy,
    detailBusy,
    error,
    detailError,
    notice,
    revision,
    anchor,
    expansionAction,
    inspect,
    close,
    filterTopic,
    search: (
      text: string,
      next = 1,
      selectedFilters: SearchFilters = filters,
    ) => run({ query: text, page: next, filters: { ...selectedFilters } }),
    expand: (repo: Repo, mode: ExpansionMode = "alternatives") => {
      const next = (expandedPages.current.get(`${repo.id}/${mode}`) || 0) + 1;
      if (next > 5) {
        setNotice("已查看前 5 页相关项目，请选择其他节点继续探索");
        return Promise.resolve();
      }
      return run({
        query,
        page: next,
        repo,
        mode,
        filters: { ...filters },
        ...expansionContext(current.current, repo.id, mode),
      });
    },
    retry: () => run(last.current),
  };
}
