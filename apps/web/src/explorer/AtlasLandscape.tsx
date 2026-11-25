import type { Atlas } from "./contracts";
import { Evidence } from "./AtlasKnowledge";
import { routeNeighborhood } from "./landscapeData";
import AtlasRunStatus, { type AtlasRun } from "./AtlasRunStatus";

export default function AtlasLandscape({
  atlas,
  selected,
  onRoute,
  onSelect,
  run,
}: {
  atlas?: Atlas;
  selected: string;
  onRoute: (id: string) => void;
  onSelect: (id: string) => void;
  run: AtlasRun;
}) {
  if (!atlas && !run.progress && !run.error) return null;
  const landscape = atlas?.landscape;
  const neighborhood = routeNeighborhood(atlas, selected);
  const facts = atlas?.understandings.flatMap((item) => item.facts) || [];
  const name = (id: string) =>
    atlas?.understandings.find((item) => item.repo_id === id)?.name || id;
  return (
    <section className="atlas-landscape" aria-label="本批探索路线">
      <div className="landscape-heading">
        <h2>这一批，沿哪些方向探索</h2>
        <span>
          {landscape?.routes.length
            ? `${landscape.routes.length} 条路线 · ${atlas?.understandings.length} 个已读项目`
            : "探索路线"}
        </span>
      </div>
      <AtlasRunStatus atlas={atlas} run={run} />
      {landscape?.summary && (
        <details className="landscape-overview">
          <summary>本批概览与边界</summary>
          <p className="landscape-summary">{landscape.summary}</p>
        </details>
      )}
      {!!landscape?.routes.length && (
        <div
          className="route-tabs"
          role="tablist"
          aria-label="探索路线"
          onKeyDown={(event) => {
            const buttons = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "button",
              ),
            ];
            const index = buttons.indexOf(event.target as HTMLButtonElement);
            const next =
              event.key === "ArrowRight"
                ? (index + 1) % buttons.length
                : event.key === "ArrowLeft"
                  ? (index + buttons.length - 1) % buttons.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? buttons.length - 1
                      : -1;
            if (next >= 0) {
              event.preventDefault();
              buttons[next].focus();
              buttons[next].click();
            }
          }}
        >
          <button
            role="tab"
            tabIndex={!neighborhood ? 0 : -1}
            aria-selected={!neighborhood}
            onClick={() => onRoute("")}
          >
            全景
          </button>
          {landscape.routes.map((route) => (
            <button
              key={route.id}
              role="tab"
              tabIndex={selected === route.id ? 0 : -1}
              aria-selected={selected === route.id}
              onClick={() => onRoute(route.id)}
            >
              {route.title}
              <span>{route.members.length}</span>
            </button>
          ))}
        </div>
      )}
      {neighborhood && (
        <div
          className="route-detail"
          role="region"
          aria-label={neighborhood.route.title}
        >
          <p>{neighborhood.route.description}</p>
          <details className="route-members">
            <summary>归属理由与原文 · {neighborhood.members.size}</summary>
            <div>
              {neighborhood.route.members.map((member) => (
                <article key={member.repo_id}>
                  <button
                    className="knowledge-target"
                    onClick={() => onSelect(member.repo_id)}
                  >
                    {name(member.repo_id)}
                  </button>
                  <p>{member.reason}</p>
                  <Evidence
                    facts={facts.filter((fact) =>
                      member.fact_ids.includes(fact.id),
                    )}
                    repoName={name}
                  />
                </article>
              ))}
            </div>
          </details>
          {!!neighborhood.neighbors.size && (
            <div className="route-neighbors">
              <span>直接关联</span>
              {[...neighborhood.neighbors].map((id) => (
                <button key={id} onClick={() => onSelect(id)}>
                  {name(id)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {!!landscape?.unassigned_repo_ids.length && !run.progress && (
        <details className="route-unassigned">
          <summary>
            暂未归入路线 · {landscape.unassigned_repo_ids.length}
          </summary>
          <div>
            {landscape.unassigned_repo_ids.map((id) => (
              <button key={id} onClick={() => onSelect(id)}>
                {name(id)}
              </button>
            ))}
          </div>
        </details>
      )}
      {landscape?.scope_note &&
        (!run.progress || !!landscape.routes.length) && (
          <small className="landscape-scope">{landscape.scope_note}</small>
        )}
    </section>
  );
}
