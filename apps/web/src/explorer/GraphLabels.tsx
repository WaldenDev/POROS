import { useEffect, useRef, useState, type RefObject } from "react";
import type { ForceGraphMethods } from "react-force-graph-3d";
import type { GraphData, GraphNode } from "./graphData";
import { endpoint } from "./graphData";
import { Square, SquareCheck } from "lucide-react";
import { MAX_SELECTION } from "./selectionContext";

type Label = {
  node: GraphNode;
  x: number;
  y: number;
  left: number;
  top: number;
  width: number;
  height: number;
};
type Props = {
  graph: RefObject<ForceGraphMethods<GraphNode> | undefined>;
  scene: GraphData;
  width: number;
  height: number;
  selected: string | null;
  topic: string;
  highlightedIds?: Set<string>;
  selectionMode: boolean;
  pickedIds: Set<string>;
  onPick: (node: GraphNode) => void;
};

// Screen-space labels stay readable at every camera distance. Only the overlay
// updates during navigation; it does not rebuild the force graph or its objects.
export default function GraphLabels({
  graph,
  scene,
  width,
  height,
  selected,
  topic,
  highlightedIds,
  selectionMode,
  pickedIds,
  onPick,
}: Props) {
  const [labels, setLabels] = useState<Label[]>([]);
  const placements = useRef(new Map<string, number[]>());
  useEffect(() => {
    let frame = 0,
      last = 0;
    let lastProjection: number[] = [];
    const degrees = new Map<string, number>();
    scene.links.forEach((link) => {
      const id = endpoint(link.target);
      degrees.set(id, (degrees.get(id) || 0) + 1);
    });
    // Reserve readable slots for the active group before filling its surroundings.
    const priority = (node: GraphNode) =>
      pickedIds.has(node.id) ? 200 : node.repo ? 100 : degrees.get(node.id) || 0;
    const candidates = [...scene.nodes].sort(
      (a, b) => priority(b) - priority(a),
    );
    function tick(now: number) {
      frame = requestAnimationFrame(tick);
      if (now - last < 32 || !graph.current) return;
      last = now;
      const next: Label[] = [];
      const camera = graph.current.camera();
      camera.updateMatrixWorld();
      const projection = [
        ...camera.matrixWorldInverse.elements,
        ...camera.projectionMatrix.elements,
        ...scene.nodes.flatMap((node) => [
          node.x || 0,
          node.y || 0,
          node.z || 0,
        ]),
      ];
      if (projection.every((value, i) => value === lastProjection[i])) return;
      lastProjection = projection;
      for (const node of candidates) {
        if (next.length >= (width < 600 ? 18 : 40)) break;
        if (
          !node.repo &&
          (degrees.get(node.id) || 0) < 2 &&
          node.id !== "topic:" + topic
        )
          continue;
        const point = { x: node.x || 0, y: node.y || 0, z: node.z || 0 };
        const matrix = camera.matrixWorldInverse.elements;
        if (
          matrix[2] * point.x +
            matrix[6] * point.y +
            matrix[10] * point.z +
            matrix[14] >=
          0
        )
          continue;
        const { x, y } = graph.current.graph2ScreenCoords(
          point.x,
          point.y,
          point.z,
        );
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          x < 0 ||
          x > width ||
          y < 70 ||
          y > height - 48
        )
          continue;
        const w = node.repo
          ? width < 600
            ? 148
            : 180
          : Math.min(170, Math.max(70, node.label.length * 6 + 18));
        const h = node.repo ? (width < 600 ? 64 : 84) : 25;
        const offsets = [
          [12, -h / 2],
          [-w - 12, -h / 2],
          [-w / 2, 14],
          [-w / 2, -h - 14],
          [16, 22],
          [-w - 16, -h - 22],
          [18, -h - 38],
          [-w - 18, 38],
        ];
        const previous = placements.current.get(node.id);
        if (previous) offsets.unshift(previous);
        if (node.repo) {
          for (const radius of [90, 145, 200]) {
            for (let i = 0; i < 8; i++) {
              const angle = (i * Math.PI) / 4;
              offsets.push([
                Math.cos(angle) * radius - w / 2,
                Math.sin(angle) * radius - h / 2,
              ]);
            }
          }
          // Dense cohorts can exhaust radial slots. Use the nearest free
          // screen-space slot without moving the underlying 3D node.
          const fallback: number[][] = [];
          for (let top = 76; top + h <= height - 56; top += 18) {
            for (let left = 10; left + w <= width - 8; left += 18) {
              fallback.push([left - x, top - y]);
            }
          }
          fallback.sort(
            (a, b) =>
              Math.hypot(a[0] + w / 2, a[1] + h / 2) -
              Math.hypot(b[0] + w / 2, b[1] + h / 2),
          );
          offsets.push(...fallback);
        }
        for (const [dx, dy] of offsets) {
          const left = x + dx,
            top = y + dy;
          if (
            left < 8 ||
            left + w > width - 8 ||
            top < 72 ||
            top + h > height - 48
          )
            continue;
          if (
            next.some(
              (other) =>
                left < other.left + other.width + 5 &&
                left + w + 5 > other.left &&
                top < other.top + other.height + 5 &&
                top + h + 5 > other.top,
            )
          )
            continue;
          next.push({ node, x, y, left, top, width: w, height: h });
          placements.current.set(node.id, [dx, dy]);
          break;
        }
      }
      setLabels((old) =>
        old.length === next.length &&
        old.every(
          (label, i) =>
            label.node.id === next[i].node.id &&
            label.node.repo === next[i].node.repo &&
            label.height === next[i].height &&
            Math.abs(label.x - next[i].x) < 0.1 &&
            Math.abs(label.y - next[i].y) < 0.1 &&
            Math.abs(label.left - next[i].left) < 0.5 &&
            Math.abs(label.top - next[i].top) < 0.5,
        )
          ? old
          : next,
      );
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [graph, scene, width, height, JSON.stringify([...pickedIds].sort())]);
  return (
    <div
      className="graph-labels"
      data-selecting={selectionMode && pickedIds.size > 0}
    >
      {labels.map(({ node, x, y, left, top, width: w, height: h }) => {
        const endX = Math.max(left, Math.min(left + w, x)),
          endY = Math.max(top, Math.min(top + h, y));
        const matching =
          highlightedIds?.has(node.id) ||
          (!!topic &&
            (node.id === "topic:" + topic ||
              node.repo?.topics.includes(topic)));
        return (
          <div key={node.id} data-node-id={node.id}>
            {pickedIds.has(node.id) && (
              <span className="graph-pick-ring" style={{ left: x, top: y }}>
                <b>{[...pickedIds].indexOf(node.id) + 1}</b>
              </span>
            )}
            <span
              className="graph-label-leader"
              style={{
                left: x,
                top: y,
                width: Math.hypot(endX - x, endY - y),
                transform: `rotate(${Math.atan2(endY - y, endX - x)}rad)`,
              }}
            />
            <button
              className={`graph-label ${node.kind}${width < 600 ? " compact" : ""}${node.id === selected ? " selected" : ""}${matching ? " matching" : ""}${pickedIds.has(node.id) ? " picked" : ""}${selectionMode && node.repo ? " selection-mode" : ""}`}
              style={{ left, top, width: w, height: h }}
              title={
                node.repo
                  ? `${node.label}\n${node.repo.description}`
                  : node.label
              }
              aria-label={
                node.repo
                  ? `${selectionMode ? "选择" : "查看"} ${node.label}`
                  : `筛选主题 ${node.label}`
              }
              aria-pressed={
                selectionMode && node.repo ? pickedIds.has(node.id) : undefined
              }
              disabled={
                !!node.repo &&
                selectionMode &&
                !pickedIds.has(node.id) &&
                pickedIds.size >= MAX_SELECTION
              }
              onClick={() => onPick(node)}
            >
              {selectionMode &&
                node.repo &&
                (pickedIds.has(node.id) ? (
                  <SquareCheck className="graph-selection-check" size={14} />
                ) : (
                  <Square className="graph-selection-check" size={14} />
                ))}
              <strong>
                {node.repo ? node.label.split("/").pop() : node.label}
              </strong>
              {node.repo && (
                <span>
                  {node.repo.language || "未标注语言"}
                  <span>
                    ★{" "}
                    {Intl.NumberFormat("en", {
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(node.repo.stars)}
                  </span>
                </span>
              )}
              {node.repo && (
                <em>
                  {node.repo.understanding?.facts.find(
                    (fact) => fact.kind === "purpose",
                  )?.claim || node.repo.description}
                </em>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
