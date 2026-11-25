import { useEffect, useRef, useState } from "react";
import {
  Download,
  FolderOpen,
  Trash2,
  X,
  MessageSquare,
} from "lucide-react";
import {
  createSelectionContext,
  MAX_SELECTION,
  type SelectedProject,
  type SelectionContext,
} from "./selectionContext";
import type { Repo } from "./contracts";
import "./selection.css";

export function ProjectCheck({
  repo,
  checked,
  disabled,
  onToggle,
}: {
  repo: Repo;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className="project-check"
      title={disabled ? `最多选择 ${MAX_SELECTION} 个项目` : checked ? "移出选集" : "加入选集"}
    >
      <input
        type="checkbox"
        aria-label={`选择 ${repo.name}`}
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
      />
      <span>选入</span>
    </label>
  );
}

export default function ProjectSelection({
  projects,
  visibleIds,
  active,
  error,
  onRemove,
  onClear,
  onInspect,
}: {
  projects: SelectedProject[];
  visibleIds: Set<string>;
  active: boolean;
  error: string;
  onRemove: (id: string) => void;
  onClear: () => void;
  onInspect: (repo: Repo) => void;
}) {
  const [snapshot, setSnapshot] = useState<SelectionContext | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (snapshot) dialog.current?.showModal();
  }, [snapshot]);
  const outside = projects.filter(
    (item) => !visibleIds.has(item.repo.id),
  ).length;
  function download() {
    if (!snapshot) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(snapshot, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "poros-selection.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section
      className="project-selection"
      aria-label="项目选集"
      data-active={active}
    >
      <div className="selection-heading">
        <h2>
          项目选集{" "}
          <span>
            {projects.length} / {MAX_SELECTION}
          </span>
        </h2>
      </div>
      <div className="selection-actions">
        <button
          title="查看选集"
          aria-label="查看选集"
          onClick={() => setSnapshot(createSelectionContext(projects))}
          disabled={projects.length < 2}
        >
          <FolderOpen size={16} />
          <span>查看选集</span>
        </button>
        <button
          className="conversation-entry"
          disabled
          title="项目对话尚未接入"
          aria-label="项目对话，待接入"
        >
          <MessageSquare size={16} />
          <span>项目对话 <small>待接入</small></span>
        </button>
        <button
          title="清空选集"
          aria-label="清空选集"
          onClick={onClear}
          disabled={!projects.length}
        >
          <Trash2 size={16} />
        </button>
      </div>
      {error ? (
        <p className="selection-state" role="alert">{error}</p>
      ) : (
        <span className="selection-state" role="status">
          {projects.length === MAX_SELECTION
            ? "已选满"
            : projects.length < 2
              ? "至少选择 2 个项目"
              : `${projects.length} 个项目已选入`}
          {outside ? ` · ${outside} 个不在当前视图` : ""}
        </span>
      )}
      <div className="selection-slots">
        {projects.map((item, index) => (
          <article key={item.repo.id} className="selection-item">
            <button
              className="selection-inspect"
              aria-label={`查看 ${item.repo.name} 详情`}
              title={`${item.repo.name} · ${item.repo.language || "—"} · ${item.repo.stars.toLocaleString()} Star · ${item.knowledge?.understanding.facts.length ? `${item.knowledge.understanding.facts.length} 条已有事实` : "暂无已整理材料"}`}
              onClick={() => onInspect(item.repo)}
            >
              <span className="selection-number">{index + 1}</span>
              <strong>
                {item.repo.name.split("/").pop()}
              </strong>
            </button>
            <div className="selection-item-actions">
              <button
                title={`移出选集 ${item.repo.name}`}
                aria-label={`移出选集 ${item.repo.name}`}
                onClick={() => onRemove(item.repo.id)}
              >
                <X size={14} />
              </button>
            </div>
          </article>
        ))}
        {!projects.length && <span className="selection-placeholder">尚未选择项目</span>}
      </div>
      <dialog
        className="selection-dialog"
        ref={dialog}
        onClose={() => setSnapshot(null)}
        aria-labelledby="selection-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        {snapshot && (
          <div className="selection-dialog-body">
            <header>
              <h2 id="selection-title">
                项目选集 · {snapshot.projects.length}
              </h2>
              <button
                autoFocus
                title="关闭选集"
                aria-label="关闭选集"
                onClick={() => dialog.current?.close()}
              >
                <X size={18} />
              </button>
            </header>
            <div className="selection-preview">
              {snapshot.projects.map((item) => (
                <article key={item.repo.id}>
                  <a href={item.repo.url} target="_blank" rel="noreferrer">
                    {item.repo.name}
                  </a>
                  <p>{item.repo.description || "暂无描述"}</p>
                  <small>
                    {item.repo.language} · {item.repo.stars.toLocaleString()}{" "}
                    Star
                  </small>
                  <h3>已有材料</h3>
                  {item.knowledge?.understanding.facts.length ? (
                    <>
                      <ul>
                        {item.knowledge.understanding.facts.map((fact) => (
                          <li key={fact.id}>
                            {fact.claim}
                            <details>
                              <summary>原文</summary>
                              <blockquote>{fact.citation.excerpt}</blockquote>
                              <small>
                                {fact.citation.document_id} · L
                                {fact.citation.start_line}–
                                {fact.citation.end_line}
                              </small>
                            </details>
                          </li>
                        ))}
                      </ul>
                      <small>
                        采集于{" "}
                        {item.knowledge.understanding.fetched_at.slice(0, 10)}
                      </small>
                    </>
                  ) : (
                    <p className="muted">暂无已整理材料</p>
                  )}
                </article>
              ))}
            </div>
            <footer>
              <span>
                选集快照 · {new Date(snapshot.captured_at).toLocaleString()}
              </span>
              <button onClick={download}>
                <Download size={16} />
                导出选集
              </button>
            </footer>
          </div>
        )}
      </dialog>
    </section>
  );
}
