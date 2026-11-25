import {
  Check,
  Circle,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import type { Atlas } from "./contracts";
import {
  atlasStages,
  elapsedLabel,
  progressMessage,
  type AtlasProgress,
} from "./atlasProgress";

export type AtlasRun = {
  progress?: AtlasProgress;
  elapsed: number;
  error: string;
  connection: string;
  retry: () => void;
};

export default function AtlasRunStatus({
  atlas,
  run,
}: {
  atlas?: Atlas;
  run: AtlasRun;
}) {
  const busy = !!run.progress;
  const hasRoutes = !!atlas?.landscape?.routes.length;
  const incomplete = atlas?.status === "partial" || !!run.error;
  const current = atlasStages.findIndex(
    (stage) => stage.id === run.progress?.stage,
  );
  const title = busy
    ? run.connection || progressMessage(run.progress!)
    : run.error
      ? "整理中断，已有内容保留"
      : atlas?.curation_status === "failed"
        ? "路线整理未成功"
        : incomplete
          ? hasRoutes
            ? "部分路线已就绪，仍有待补全内容"
            : "材料尚未齐备，暂未形成路线"
          : "本批未形成有依据的路线";
  if (!busy && !incomplete && hasRoutes) return null;
  return (
    <div
      className="atlas-run-status"
      data-state={busy ? "waiting" : incomplete ? "incomplete" : "empty"}
    >
      <div className="atlas-run-heading" role="status" aria-live="polite">
        {busy ? (
          <LoaderCircle size={18} className="atlas-spinner" />
        ) : incomplete ? (
          <TriangleAlert size={18} />
        ) : (
          <Circle size={18} />
        )}
        <strong>{title}</strong>
        {busy && (
          <span className="atlas-elapsed">
            已等待 {elapsedLabel(run.elapsed)}
          </span>
        )}
      </div>
      {busy && (
        <ol className="atlas-steps" aria-label="整理阶段">
          {atlasStages.map((stage, index) => (
            <li
              key={stage.id}
              aria-current={index === current ? "step" : undefined}
              className={index < current ? "passed" : ""}
            >
              {index < current ? <Check size={14} /> : <Circle size={12} />}{" "}
              {stage.label}
            </li>
          ))}
        </ol>
      )}
      {busy && (
        <p>
          {hasRoutes
            ? "正在补全，已生成的路线和项目仍可查看。"
            : "路线尚未就绪，已读取的项目和原文会先保留。"}
          {run.elapsed >= 60 && " 模型仍在处理，本轮可能需要数分钟。"}
        </p>
      )}
      {!busy && run.error && <p role="alert">{run.error}</p>}
      {!busy && incomplete && (
        <button onClick={run.retry}>
          <RefreshCw size={15} />
          继续整理
        </button>
      )}
      {!!atlas?.coverage?.missing.length && (
        <details className="atlas-missing">
          <summary>
            尚未完成深读 · {atlas.coverage.missing.length} 个项目
          </summary>
          <ul>
            {atlas.coverage.missing.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
