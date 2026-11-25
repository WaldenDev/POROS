import type { Atlas, Fact, Repo } from "./contracts";
import { relationKinds, roles } from "./contracts";

const factNames = {
  purpose: "用途",
  mechanism: "实现思路",
  interface: "接口与关联",
  boundary: "边界与条件",
};
export function Evidence({
  facts,
  repoName,
}: {
  facts: Fact[];
  repoName?: (id: string) => string;
}) {
  return (
    <details className="atlas-evidence">
      <summary>查看原文 · {facts.length}</summary>
      {facts.map((fact) => (
        <div key={fact.id}>
          {repoName && (
            <strong className="evidence-owner">
              {repoName(fact.repo_id)} · {factNames[fact.kind]}
            </strong>
          )}
          <small>{fact.claim}</small>
          <blockquote>{fact.citation.excerpt}</blockquote>
          <a href={fact.citation.url} target="_blank" rel="noreferrer">
            {fact.citation.kind === "readme"
              ? `README · L${fact.citation.start_line}`
              : "仓库描述"}{" "}
            ↗
          </a>
        </div>
      ))}
    </details>
  );
}

export default function AtlasKnowledge({
  repo,
  atlas,
  onSelect,
}: {
  repo: Repo;
  atlas?: Atlas;
  onSelect: (id: string) => void;
}) {
  const understanding = repo.understanding;
  if (!understanding)
    return atlas ? <p className="muted">此项目尚未完成深读。</p> : null;
  const relations =
    atlas?.relations.filter(
      (item) => item.source === repo.id || item.target === repo.id,
    ) || [];
  const facts = atlas?.understandings.flatMap((item) => item.facts) || [];
  const repoName = (id: string) =>
    atlas?.understandings.find((item) => item.repo_id === id)?.name || id;
  const decisions =
    atlas?.relation_decisions?.filter(
      (item) =>
        item.verdict !== "retain" &&
        (item.source === repo.id || item.target === repo.id),
    ) || [];
  const memberships =
    atlas?.landscape?.routes.filter((route) =>
      route.members.some((member) => member.repo_id === repo.id),
    ) || [];
  return (
    <section className="atlas-knowledge">
      <div className="panel-heading">
        <span>项目理解 / {roles[understanding.role]}</span>
      </div>
      {!!memberships.length && (
        <p className="knowledge-routes">
          探索路线：{memberships.map((route) => route.title).join(" · ")}
        </p>
      )}
      {understanding.facts.map((fact) => (
        <div className="knowledge-fact" key={fact.id}>
          <small>{factNames[fact.kind]}</small>
          <p>{fact.claim}</p>
          <Evidence facts={[fact]} />
        </div>
      ))}
      {!!understanding.unknowns.length && (
        <div className="knowledge-unknown">
          <small>材料尚未回答</small>
          <ul>
            {understanding.unknowns.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="atlas-relations">
        <h3>项目之间</h3>
        {!relations.length && (
          <p className="muted">
            本批材料中未确认有依据的关系。不代表它与其他项目无关。
          </p>
        )}
        {relations.map((relation) => {
          const other =
            relation.source === repo.id ? relation.target : relation.source;
          const name =
            atlas?.understandings.find((item) => item.repo_id === other)
              ?.name || other;
          return (
            <article key={relation.id} className="knowledge-relation">
              <small>
                {relationKinds[relation.kind]} ·{" "}
                {relation.basis === "documented"
                  ? relation.kind === "references"
                    ? "原文链接，不代表集成"
                    : "文档声明，未实测"
                  : relation.kind === "complements"
                    ? "可能协作，尚未验证"
                    : "模型对比，非功能等价"}
              </small>
              <button
                className="knowledge-target"
                onClick={() => onSelect(other)}
              >
                {name}
              </button>
              <p>{relation.claim}</p>
              {["integrates", "references"].includes(relation.kind) && (
                <p className="knowledge-direction">
                  {repoName(relation.source)} → {repoName(relation.target)}
                </p>
              )}
              <p className="knowledge-distinction">
                区别与边界：{relation.distinction}
              </p>
              {!!relation.pending_checks?.length && (
                <div className="knowledge-conditions">
                  <small>
                    {relation.kind === "same_problem"
                      ? "比较时待确认"
                      : "组合前待确认"}
                  </small>
                  <ul>
                    {relation.pending_checks.map((check) => (
                      <li key={check}>{check}</li>
                    ))}
                  </ul>
                </div>
              )}
              {relation.review && (
                <p className="knowledge-review">
                  判断依据：{relation.review.reason}
                </p>
              )}
              <Evidence
                repoName={repoName}
                facts={facts.filter((fact) =>
                  relation.fact_ids.includes(fact.id),
                )}
              />
            </article>
          );
        })}
      </div>
      {!!decisions.length && (
        <details className="knowledge-decisions">
          <summary>未采用的判断 · {decisions.length}</summary>
          {decisions.map((decision) => {
            const other =
              decision.source === repo.id ? decision.target : decision.source;
            return (
              <article key={decision.relation_id}>
                <small>
                  {relationKinds[decision.kind]} ·{" "}
                  {decision.replacement_id
                    ? "仅保留文档引用"
                    : decision.verdict === "pending"
                      ? "等待复核"
                      : "暂不连线"}
                </small>
                <button
                  className="knowledge-target"
                  onClick={() => onSelect(other)}
                >
                  {atlas?.understandings.find((item) => item.repo_id === other)
                    ?.name || other}
                </button>
                <p>{decision.reason}</p>
                <Evidence
                  facts={facts.filter((fact) =>
                    decision.fact_ids.includes(fact.id),
                  )}
                  repoName={repoName}
                />
              </article>
            );
          })}
        </details>
      )}
      <small className="knowledge-date">
        材料快照 · {new Date(understanding.fetched_at).toLocaleDateString()} ·
        README 链接固定至读取版本
      </small>
    </section>
  );
}
