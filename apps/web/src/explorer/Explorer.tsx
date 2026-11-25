import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Search,
  Shuffle,
  Plus,
  X,
  ExternalLink,
  Bookmark,
  Orbit,
  List,
  ArrowUpRight,
  Star,
  ListChecks,
  Route,
  Layers,
} from "lucide-react";
import AtlasKnowledge from "./AtlasKnowledge";
import AtlasPanel from "./AtlasPanel";
import { routeNeighborhood } from "./landscapeData";
import { roles } from "./contracts";
import type { Repo, ExpansionMode } from "./api";
import ExpansionPanel, { RelationDetails } from "./ExpansionPanel";
import { useExplorer } from "./useExplorer";
import { isStaticPreview } from "./debug/mode";
import SearchFilterBar from "./SearchFilterBar";
import ProjectSelection, { ProjectCheck } from "./ProjectSelection";
import { useProjectSelection } from "./useProjectSelection";
import { DEFAULT_FILTERS, type SearchFilters } from "./searchFilters";
import { readPreference } from "../storage";
import "./theme.css";
import "./explorer.css";
import "./workspace.css";
const GraphScene = lazy(() => import("./GraphScene"));
const StaticExplorer = import.meta.env.DEV || import.meta.env.MODE === "demo"
  ? lazy(() => import("./debug/StaticExplorer"))
  : null;
class GraphBoundary extends Component<
  { children: ReactNode; onList: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="scene-message">
        3D 视图暂不可用。
        <button onClick={this.props.onList}>查看项目列表</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function readSaved(readOnly = false): Repo[] {
  try {
    const value = JSON.parse((readOnly
      ? localStorage.getItem("poros-debug-explore-basket")
      : readPreference("explore-basket")) || "[]");
    return Array.isArray(value)
      ? value
          .filter(
            (r) =>
              r &&
              typeof r.id === "string" &&
              typeof r.name === "string" &&
              Array.isArray(r.topics),
          )
          .slice(0, 120)
      : [];
  } catch {
    return [];
  }
}
export default function Explorer() {
  if (StaticExplorer && isStaticPreview(import.meta.env.DEV, window.location.search, import.meta.env.MODE === "demo")) {
    return (
      <Suspense fallback={<div className="explorer scene-message" role="status">加载历史快照…</div>}>
        <StaticExplorer View={ExplorerView} />
      </Suspense>
    );
  }
  return <LiveExplorer />;
}
function LiveExplorer() {
  const ex = useExplorer();
  return <ExplorerView ex={ex} />;
}
function ExplorerView({ ex, readOnly = false }: {
  ex: ReturnType<typeof useExplorer>;
  readOnly?: boolean;
}) {
  const inspector = useRef<HTMLElement>(null);
  const searchForm = useRef<HTMLFormElement>(null);
  const [draftFilters, setDraftFilters] = useState<SearchFilters>({
    ...DEFAULT_FILTERS,
  });
  const [expansionMode, setExpansionMode] =
    useState<ExpansionMode>("alternatives");
  const [showTopics, setShowTopics] = useState(false);
  const [routeId, setRouteId] = useState("");
  const [panel, setPanel] = useState<"projects" | "routes">("projects");
  const [draft, setDraft] = useState(ex.query),
    [view, setView] = useState<"graph" | "list">("graph");
  const [saved, setSaved] = useState<Repo[]>(() => readSaved(readOnly)),
    [storageError, setStorageError] = useState("");
  const selection = useProjectSelection(
    ex.data.repos,
    ex.query,
    ex.atlas.result?.id ?? null,
    readOnly ? "poros-debug-selection-v1" : undefined,
  );
  useEffect(() => {
    try {
      localStorage.setItem(readOnly ? "poros-debug-explore-basket" : "poros-explore-basket", JSON.stringify(saved));
    } catch {
      setStorageError("浏览器存储不可用，探索篮仅在本次页面中保留。");
    }
  }, [saved, readOnly]);
  const topics = [...new Set(ex.data.repos.flatMap((r) => r.topics))];
  const neighborhood = routeNeighborhood(ex.atlas.result, routeId);
  const visible = neighborhood
    ? ex.data.repos.filter((repo) => neighborhood.members.has(repo.id))
    : ex.topic
      ? ex.data.repos.filter((r) => r.topics.includes(ex.topic))
      : ex.data.repos;
  const selected = ex.selected;
  function search(text: string) {
    if (readOnly) return;
    if (!searchForm.current?.reportValidity()) return;
    setDraft(text);
    void ex.search(text, 1, draftFilters);
  }
  useEffect(() => setRouteId(""), [ex.revision]);
  function chooseRoute(id: string) {
    ex.filterTopic("");
    setRouteId(id);
  }
  function chooseTopic(topic: string) {
    setRouteId("");
    ex.filterTopic(topic);
  }
  function inspectId(id: string) {
    const repo = ex.data.repos.find((item) => item.id === id);
    if (repo) inspect(repo);
  }
  function inspect(repo: Repo) {
    setPanel("projects");
    void ex.inspect(repo);
  }
  useEffect(() => {
    inspector.current?.scrollTo({ top: 0 });
    if (selected) setPanel("projects");
  }, [selected?.id]);
  const matchingExpansion =
    ex.expansionAction?.source_id === selected?.id &&
    ex.expansionAction?.mode === expansionMode;
  const toggle = (repo: Repo) =>
    setSaved((old) =>
      old.some((r) => r.id === repo.id)
        ? old.filter((r) => r.id !== repo.id)
        : [...old, repo].slice(0, 120),
    );
  return (
    <div className="explorer">
      <header className="explorer-header">
        <a className="brand" href="/">
          <Orbit size={25} strokeWidth={1.4} />
          POROS<span>EXPLORER</span>
        </a>
        <div className="search-band">
          <form
            id="explorer-search"
            ref={searchForm}
            onSubmit={(e) => {
              e.preventDefault();
              search(draft);
            }}
          >
            <Search size={19} />
            <input
              aria-label="启发词"
              disabled={readOnly}
              maxLength={120}
              placeholder="local agent / creative coding"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button title="搜索" aria-label="搜索" disabled={readOnly}>
              <ArrowUpRight size={21} />
            </button>
            <button
              className="shuffle"
              aria-label="随便看看"
              title="随便看看"
              type="button"
              disabled={readOnly}
              onClick={() => {
                search("");
              }}
            >
              <Shuffle size={17} />
              <span>随便看看</span>
            </button>
          </form>
        </div>
      </header>
      <main>
        <h1 className="explorer-sr-only">开源探索</h1>
        <div className="explorer-controls">
          <SearchFilterBar
            value={draftFilters}
            onChange={setDraftFilters}
            busy={ex.busy}
            disabled={readOnly}
          />
          <div className="explore-toolbar">
            <div className="view-switch" aria-label="展示方式">
              <button
                title="图谱"
                aria-pressed={view === "graph"}
                onClick={() => setView("graph")}
              >
                <Orbit size={16} />
                图谱
              </button>
              <button
                title="列表"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <List size={16} />
                列表
              </button>
            </div>
            <div role="status" aria-live="polite">
              {readOnly && <span title="2026-11 历史快照，搜索与分析已锁定">{import.meta.env.MODE === "demo" ? "示例图谱" : "静态调试"} · </span>}
              {ex.busy ? "正在检索 GitHub…" : `${visible.length} 个项目`}
              {ex.notice && <span> · {ex.notice}</span>}
            </div>
            <button
              className="selection-toggle"
              title={selection.selecting ? "结束多选" : "选择多个项目"}
              aria-pressed={selection.selecting}
              onClick={() => selection.setSelecting(!selection.selecting)}
            >
              <ListChecks size={17} />
              多选
            </button>
            <button
              title="换一批"
              aria-label="换一批"
              disabled={readOnly || ex.busy || !ex.data.repos.length || ex.page >= 5}
              onClick={() => void ex.search(ex.query, ex.page + 1)}
            >
              <Shuffle size={17} />
            </button>
          </div>
        </div>
        {ex.error && (
          <div className="notice" role="alert">
            {ex.error}
            <button onClick={() => void ex.retry()}>重试</button>
          </div>
        )}
        {!!ex.data.warnings.length && (
          <div className="notice">{ex.data.warnings.join(" · ")}</div>
        )}
        <div className="topic-band">
          <nav className="topic-nav" aria-label="主题筛选">
            <button aria-pressed={!ex.topic} onClick={() => chooseTopic("")}>
              全部
            </button>
            {topics.map((t) => (
              <button
                aria-pressed={ex.topic === t}
                key={t}
                onClick={() => chooseTopic(t)}
              >
                {t}
              </button>
            ))}
          </nav>
          {ex.atlas.result && (
            <label className="topic-visibility">
              <input
                type="checkbox"
                checked={showTopics}
                onChange={(event) => setShowTopics(event.target.checked)}
              />
              标签连线
            </label>
          )}
        </div>
        <div className="atlas-layout">
          <div className="atlas-stage">
            <section className="atlas-viewport" aria-busy={ex.busy}>
              {!ex.data.repos.length ? (
                <div className="scene-message">
                  <Orbit size={56} />
                  <p className="eyebrow">FOLLOW YOUR CURIOSITY</p>
                  <h2>
                    {ex.revision
                      ? "暂时没有符合条件的项目。"
                      : "开源世界，等待展开。"}
                  </h2>
                  <button onClick={() => search(draft)} disabled={readOnly || ex.busy}>
                    {ex.busy
                      ? "正在连接 GitHub…"
                      : ex.revision
                        ? "重新搜索"
                        : "开始探索"}
                    <ArrowUpRight size={18} />
                  </button>
                </div>
              ) : view === "graph" ? (
                <GraphBoundary key={ex.revision} onList={() => setView("list")}>
                  <Suspense
                    fallback={
                      <div className="scene-message">正在构建图谱…</div>
                    }
                  >
                    <GraphScene
                      key={ex.revision}
                      data={ex.data}
                      anchor={ex.anchor}
                      selected={selected?.id || null}
                      topic={ex.topic}
                      routeId={routeId}
                      onRoute={chooseRoute}
                      onSelect={inspect}
                      onTopic={chooseTopic}
                      onClose={ex.close}
                      selectionMode={selection.selecting}
                      pickedIds={selection.ids}
                      onToggleProject={selection.toggle}
                      showTopics={
                        ex.atlas.busy ||
                        !ex.atlas.result?.understandings.length ||
                        showTopics
                      }
                    />
                  </Suspense>
                </GraphBoundary>
              ) : (
                <div className="repo-grid">
                  {visible.map((r) => (
                    <article key={r.id} data-picked={selection.ids.has(r.id)}>
                      {selection.selecting && (
                        <ProjectCheck
                          repo={r}
                          checked={selection.ids.has(r.id)}
                          disabled={selection.full && !selection.ids.has(r.id)}
                          onToggle={() => selection.toggle(r)}
                        />
                      )}
                      <button className="repo-title" onClick={() => inspect(r)}>
                        <img src={r.avatar} alt="" />
                        {r.name}
                      </button>
                      <p>{r.description}</p>
                      {r.understanding && (
                        <p className="knowledge-preview">
                          {
                            r.understanding.facts.find(
                              (fact) => fact.kind === "purpose",
                            )?.claim
                          }
                        </p>
                      )}
                      {r.relations?.[0] && (
                        <p className="relation-preview">
                          关联理由：{r.relations[0].reason}
                        </p>
                      )}
                      <small>
                        {r.language || "—"} · ★ {r.stars.toLocaleString()}
                      </small>
                      <footer>
                        <button
                          onClick={() => void ex.expand(r)}
                          disabled={readOnly || ex.busy || ex.atlas.busy}
                        >
                          <Plus size={16} />
                          展开
                        </button>
                        <button
                          aria-label={`收藏 ${r.name}`}
                          title="收藏"
                          onClick={() => toggle(r)}
                        >
                          <Bookmark
                            size={17}
                            fill={
                              saved.some((s) => s.id === r.id)
                                ? "currentColor"
                                : "none"
                            }
                          />
                        </button>
                      </footer>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <ProjectSelection
              projects={selection.projects}
              active={selection.selecting}
              error={selection.error}
              visibleIds={new Set(visible.map((repo) => repo.id))}
              onRemove={selection.remove}
              onClear={selection.clear}
              onInspect={(repo) =>
                inspect(
                  ex.data.repos.find((item) => item.id === repo.id) ?? repo,
                )
              }
            />
          </div>
          <aside className="inspector" ref={inspector}>
            <div
              className="inspector-tabs"
              role="tablist"
              aria-label="探索面板"
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? "projects"
                    : event.key === "End"
                      ? "routes"
                      : panel === "projects"
                        ? "routes"
                        : "projects";
                setPanel(next);
                event.currentTarget
                  .querySelectorAll<HTMLButtonElement>("button")
                  [next === "projects" ? 0 : 1].focus();
              }}
            >
              <button
                role="tab"
                tabIndex={panel === "projects" ? 0 : -1}
                aria-selected={panel === "projects"}
                onClick={() => setPanel("projects")}
              >
                <Layers size={15} />
                项目
              </button>
              <button
                role="tab"
                tabIndex={panel === "routes" ? 0 : -1}
                aria-selected={panel === "routes"}
                onClick={() => setPanel("routes")}
              >
                <Route size={15} />
                路线{ex.atlas.busy && <span className="analysis-dot" />}
              </button>
            </div>
            {panel === "routes" ? (
              <AtlasPanel
                readOnly={readOnly}
                atlas={ex.atlas}
                available={!!ex.data.analysis_available}
                busy={ex.busy}
                count={ex.data.repos.length}
                routeId={routeId}
                onStart={() => void ex.atlas.start(ex.data.repos, ex.query)}
                onRoute={chooseRoute}
                onSelect={inspectId}
              />
            ) : selected ? (
              <>
                <div className="panel-heading">
                  <span>REPOSITORY</span>
                  <button
                    title="关闭详情"
                    aria-label="关闭详情"
                    onClick={ex.close}
                  >
                    <X size={18} />
                  </button>
                </div>
                <img className="repo-avatar" src={selected.avatar} alt="" />
                <h2>{selected.name}</h2>
                <p className="repo-description">
                  {selected.description || "暂无描述"}
                </p>
                <div className="repo-stats">
                  <span>
                    <Star size={15} />
                    {selected.stars.toLocaleString()}
                  </span>
                  <span>{selected.language || "—"}</span>
                </div>
                <dl>
                  <div>
                    <dt>License</dt>
                    <dd>
                      {ex.detailBusy ? "…" : selected.license || "未声明"}
                    </dd>
                  </div>
                  <div>
                    <dt>Open issues</dt>
                    <dd>
                      {ex.detailBusy ? "…" : (selected.open_issues ?? "未知")}
                    </dd>
                  </div>
                </dl>
                {ex.detailError && (
                  <p role="alert" className="notice">
                    详情加载失败：{ex.detailError}
                    <button onClick={() => void ex.inspect(selected)}>
                      重试
                    </button>
                  </p>
                )}
                <div className="tags">
                  {selected.topics.map((t) => (
                    <button key={t} onClick={() => chooseTopic(t)}>
                      {t}
                    </button>
                  ))}
                </div>
                <RelationDetails repo={selected} />
                <AtlasKnowledge
                  repo={selected}
                  atlas={ex.atlas.result}
                  onSelect={inspectId}
                />
                <ExpansionPanel
                  mode={expansionMode}
                  onMode={setExpansionMode}
                  busy={ex.busy}
                  disabled={readOnly || ex.atlas.busy}
                  onExpand={() => void ex.expand(selected, expansionMode)}
                  onRetry={() => void ex.retry()}
                  error={matchingExpansion ? ex.error : ""}
                  notice={matchingExpansion ? ex.notice : ""}
                  warnings={matchingExpansion ? ex.data.warnings : []}
                  metadata={
                    matchingExpansion &&
                    ex.data.expansion?.source_id === selected.id &&
                    ex.data.expansion?.mode === expansionMode
                      ? ex.data.expansion
                      : undefined
                  }
                />
                <div className="detail-actions">
                  <ProjectCheck
                    repo={selected}
                    checked={selection.ids.has(selected.id)}
                    disabled={selection.full && !selection.ids.has(selected.id)}
                    onToggle={() => selection.toggle(selected)}
                  />
                  <button
                    title="加入探索篮"
                    aria-label="加入探索篮"
                    aria-pressed={saved.some((r) => r.id === selected.id)}
                    onClick={() => toggle(selected)}
                  >
                    <Bookmark size={18} />
                  </button>
                </div>
                <a
                  className="github-link"
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  在 GitHub 打开
                  <ExternalLink size={15} />
                </a>
              </>
            ) : (
              <>
                <div className="panel-heading">
                  <span>
                    {neighborhood
                      ? "IN THIS ROUTE"
                      : ex.topic
                        ? "TOPIC / " + ex.topic
                        : "IN THIS EXPLORATION"}
                  </span>
                </div>
                <h2>{neighborhood?.route.title || ex.topic || "探索索引"}</h2>
                <div className="repo-index">
                  {visible.map((r) => (
                    <div
                      className="repo-index-row"
                      key={r.id}
                      data-picked={selection.ids.has(r.id)}
                    >
                      {selection.selecting && (
                        <ProjectCheck
                          repo={r}
                          checked={selection.ids.has(r.id)}
                          disabled={selection.full && !selection.ids.has(r.id)}
                          onToggle={() => selection.toggle(r)}
                        />
                      )}
                      <button onClick={() => inspect(r)}>
                        <img src={r.avatar} alt="" />
                        <span>
                          {r.name}
                          <small>★ {r.stars.toLocaleString()}</small>
                          {r.understanding && (
                            <small>
                              {roles[r.understanding.role]} ·{" "}
                              {
                                r.understanding.facts.find(
                                  (fact) => fact.kind === "purpose",
                                )?.claim
                              }
                            </small>
                          )}
                        </span>
                        <ArrowUpRight size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                {!visible.length && (
                  <p className="muted">GitHub · Topics · 开源生态</p>
                )}
              </>
            )}
            <p className="provenance">
              {readOnly && "历史快照 · 非实时数据。"}
              {ex.atlas.result
                ? "关系基于本批公开材料；原文引用可核对，但模型解释仍可能有误。空间距离不代表相似度或排名。"
                : "主题连线来自 GitHub Topics，不代表功能相似或兼容。"}
            </p>
          </aside>
        </div>
        <section className="basket">
          <div className="panel-heading">
            <span>探索篮 / {saved.length}</span>
          </div>
          {storageError && <p role="alert">{storageError}</p>}
          <div>
            {saved.map((r) => (
              <span key={r.id}>
                <button onClick={() => inspect(r)}>{r.name}</button>
                <button
                  title={`移除 ${r.name}`}
                  aria-label={`移除 ${r.name}`}
                  onClick={() => toggle(r)}
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
