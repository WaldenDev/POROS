import { Plus } from "lucide-react";
import {
  expansionModes,
  type ExpansionMode,
  type Repo,
  type Result,
} from "./api";

export function RelationDetails({ repo }: { repo: Repo }) {
  if (!repo.relations?.length) return null;
  return (
    <section className="relation-details">
      <h3>为什么关联</h3>
      {repo.relations.map((relation) => (
        <div
          className="relation-entry"
          key={`${relation.source_id}/${relation.mode}`}
        >
          <small>
            {expansionModes[relation.mode]} ·{" "}
            {relation.basis === "documented_reference"
              ? "文档引用"
              : "关联推断"}{" "}
            · {relation.provider === "rules" ? "规则线索" : "AI 判断"}
          </small>
          <p>{relation.reason}</p>
          <span className="relation-source">来自 {relation.source_name}</span>
          <details>
            <summary>查看证据 · {relation.evidence.length}</summary>
            {relation.evidence.map((evidence, index) => (
              <blockquote key={index}>
                <p>{evidence.excerpt}</p>
                <a href={evidence.url} target="_blank" rel="noreferrer">
                  {evidence.kind === "readme"
                    ? "README"
                    : evidence.kind === "topics"
                      ? "GitHub Topics"
                      : "仓库描述"}{" "}
                  ↗
                </a>
              </blockquote>
            ))}
          </details>
        </div>
      ))}
    </section>
  );
}
type Props = {
  mode: ExpansionMode;
  onMode: (mode: ExpansionMode) => void;
  busy: boolean;
  disabled?: boolean;
  onExpand: () => void;
  error: string;
  notice: string;
  warnings: string[];
  onRetry: () => void;
  metadata?: Result["expansion"];
};
export default function ExpansionPanel({
  mode,
  onMode,
  busy,
  disabled = false,
  onExpand,
  error,
  notice,
  warnings,
  onRetry,
  metadata,
}: Props) {
  return (
    <section className="expansion-panel">
      <div className="expansion-modes" aria-label="展开方向">
        {(Object.keys(expansionModes) as ExpansionMode[]).map((value) => (
          <button
            key={value}
            aria-pressed={mode === value}
            disabled={busy}
            onClick={() => onMode(value)}
          >
            {expansionModes[value]}
          </button>
        ))}
      </div>
      <button
        className="primary"
        disabled={busy || disabled}
        onClick={onExpand}
      >
        <Plus size={17} />
        {busy ? "正在探索关联…" : "展开相关项目"}
      </button>
      <div className="expansion-feedback" aria-live="polite">
        {busy ? (
          "SearchAgent 正在检索与核验证据…"
        ) : error ? (
          <p role="alert">
            {error} <button onClick={onRetry}>重试展开</button>
          </p>
        ) : (
          notice
        )}
        {!busy && metadata && (
          <p className="expansion-meta">
            {metadata.provider === "rules" ? "规则检索" : "AI 检索"} ·{" "}
            {metadata.judgment_provider === "rules" ? "规则判断" : "AI 判断"} ·{" "}
            {metadata.candidate_count} 个候选 / {metadata.accepted_count} 个通过
          </p>
        )}
        {!busy &&
          warnings.map((warning) => (
            <p className="expansion-warning" key={warning}>
              {warning}
            </p>
          ))}
      </div>
    </section>
  );
}
