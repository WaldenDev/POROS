import { Route, RefreshCw } from "lucide-react";
import AtlasLandscape from "./AtlasLandscape";
import type { useAtlas } from "./useAtlas";

type Props = {
  readOnly?: boolean;
  atlas: ReturnType<typeof useAtlas>;
  available: boolean;
  busy: boolean;
  count: number;
  routeId: string;
  onStart: () => void;
  onRoute: (id: string) => void;
  onSelect: (id: string) => void;
};

export default function AtlasPanel({
  readOnly = false,
  atlas,
  available,
  busy,
  count,
  routeId,
  onStart,
  onRoute,
  onSelect,
}: Props) {
  if (!atlas.busy && !atlas.result && !atlas.error)
    return (
      <div className="route-idle">
        <Route size={32} strokeWidth={1.3} />
        <h2>探索路线</h2>
        <p>{count ? `本批 ${count} 个项目 · 尚未整理` : "尚无项目"}</p>
        <button
          className="route-start"
          disabled={readOnly || !available || busy || !count}
          onClick={onStart}
        >
          <Route size={16} />
          整理关系与路线
        </button>
        {!available && count > 0 && <small>模型未配置或配置无效</small>}
      </div>
    );
  return (
    <div className="route-panel">
      <AtlasLandscape
        atlas={atlas.result}
        selected={routeId}
        onRoute={onRoute}
        onSelect={onSelect}
        run={{
          progress: atlas.progress,
          elapsed: atlas.elapsed,
          error: atlas.error,
          connection: atlas.connection,
          retry: () => void atlas.start(),
        }}
      />
      {atlas.result && !atlas.busy && (
        <div className="atlas-status">
          <div role="status">
            {atlas.result.understandings.length} 个已读项目 ·{" "}
            {atlas.result.metrics.facts} 条事实 ·{" "}
            {atlas.result.relations.length} 条关系
          </div>
          <button
            title="重新核对项目材料"
            aria-label="重新核对项目材料"
            disabled={readOnly || busy}
            onClick={() => void atlas.start()}
          >
            <RefreshCw size={16} />
          </button>
          {!!atlas.result.warnings.length && (
            <details>
              <summary>材料范围与缺口 · {atlas.result.warnings.length}</summary>
              {atlas.result.warnings.map((warning, index) => (
                <p key={index}>{warning}</p>
              ))}
            </details>
          )}
        </div>
      )}
    </div>
  );
}
