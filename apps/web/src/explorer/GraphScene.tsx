import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph, { type ForceGraphMethods } from "react-force-graph-3d";
import GraphLabels from "./GraphLabels";
import { Crosshair, Maximize, FilterX } from "lucide-react";
import {
  buildGraph,
  graphTopology,
  endpoint,
  relationshipLabel,
  type GraphData,
  type GraphLink,
  type GraphNode,
} from "./graphData";
import type { Repo, Result } from "./api";
import { routeNeighborhood } from "./landscapeData";
import { MAX_SELECTION } from "./selectionContext";
import { useSelectionPhysics } from "./useSelectionPhysics";
import { useSelectionVolume } from "./useSelectionVolume";

type Props = {
  data: Result;
  anchor: string | null;
  selected: string | null;
  topic: string;
  onSelect: (repo: Repo) => void;
  onTopic: (topic: string) => void;
  onClose: () => void;
  selectionMode: boolean;
  pickedIds: Set<string>;
  onToggleProject: (repo: Repo) => void;
  showTopics?: boolean;
  routeId?: string;
  onRoute?: (id: string) => void;
};
export default function GraphScene({
  data,
  anchor,
  selected,
  topic,
  onSelect,
  onTopic,
  onClose,
  selectionMode,
  pickedIds,
  onToggleProject,
  showTopics = true,
  routeId = "",
  onRoute,
}: Props) {
  const routeView = useMemo(
    () => routeNeighborhood(data.atlas, routeId),
    [data.atlas, routeId],
  );
  const host = useRef<HTMLDivElement>(null),
    graph = useRef<ForceGraphMethods<GraphNode> | undefined>(undefined);
  const previous = useRef<GraphData>({ nodes: [], links: [] });
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [hovered, setHovered] = useState<string | null>(null);
  const reduced = useMemo(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const scene = useMemo(
    () => buildGraph(data, previous.current, anchor, showTopics),
    [data, anchor, showTopics],
  );
  const topology = graphTopology(scene);
  const tension = useSelectionPhysics(graph, scene, topology, pickedIds, reduced);
  useSelectionVolume(graph, scene, pickedIds);
  const localSelection = scene.nodes.filter(n => pickedIds.has(n.id));
  const selectionKey = JSON.stringify(localSelection.map(n => n.id).sort());
  const selectionFocusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previousSelectionCount = useRef(0);
  function cancelSelectionFocus() { clearTimeout(selectionFocusTimer.current); }
  function focusSelection() {
    cancelSelectionFocus();
    fit(size.width < 600 ? 110 : 155, node => pickedIds.has(node.id));
  }
  useEffect(() => {
    const count = localSelection.length;
    if (count >= 2) selectionFocusTimer.current = setTimeout(focusSelection, 1700);
    else if (previousSelectionCount.current >= 2 && fitted.current)
      selectionFocusTimer.current = setTimeout(() => fit(60), 1500);
    previousSelectionCount.current = count;
    return cancelSelectionFocus;
  }, [selectionKey]);
  useEffect(() => {
    previous.current = scene;
  }, [scene]);
  useEffect(() => {
    graph.current?.d3Force("charge")?.strength(-180);
    graph.current?.d3Force("link")?.distance(70);
    graph.current?.d3ReheatSimulation();
  }, [topology]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize((old) => {
        const width = Math.round(entry.contentRect.width);
        const height = Math.round(entry.contentRect.height);
        return old.width === width && old.height === height
          ? old
          : { width, height };
      }),
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  function focus(id: string) {
    const node = scene.nodes.find((n) => n.id === id);
    if (!node || !graph.current) return;
    const target = { x: node.x || 0, y: node.y || 0, z: node.z || 0 };
    graph.current.cameraPosition(
      { x: target.x, y: target.y + 30, z: target.z + 330 },
      target,
      reduced ? 0 : 850,
    );
  }
  function fit(padding: number, include?: (node: GraphNode) => boolean) {
    const filter = include ?? ((node: GraphNode) => node.kind === "repo");
    const nodes = scene.nodes.filter(filter);
    // A singleton has a zero-size bounding box; keep the camera outside the node.
    if (nodes.length === 1) focus(nodes[0].id);
    else if (nodes.length)
      graph.current?.zoomToFit(
        reduced ? 0 : 700,
        Math.max(105, padding),
        filter,
      );
  }
  useEffect(() => {
    if (selected) { cancelSelectionFocus(); focus(selected); }
  }, [selected]);
  useEffect(() => {
    if (topic) { cancelSelectionFocus(); focusTopic(topic); }
  }, [topic]);
  function focusRoute() {
    if (!routeView) return;
    fit(
      65,
      (node) =>
        routeView.members.has(node.id) || routeView.neighbors.has(node.id),
    );
  }
  useEffect(() => {
    if (routeView || fitted.current) cancelSelectionFocus();
    if (routeView) focusRoute();
    else if (fitted.current) fit(35);
  }, [routeId]);
  function focusTopic(value: string) {
    const repositories = new Set(
      data.repos
        .filter((repo) => repo.topics.includes(value))
        .map((repo) => repo.id),
    );
    fit(
      60,
      (node) => repositories.has(node.id) || node.id === "topic:" + value,
    );
  }
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current) return;
    const frame = requestAnimationFrame(() => {
      if (localSelection.length >= 2) focusSelection();
      else if (selected) focus(selected);
      else if (routeView) focusRoute();
      else if (topic) focusTopic(topic);
      else fit(35);
    });
    return () => cancelAnimationFrame(frame);
  }, [size.width, size.height]);
  useEffect(() => {
    fitted.current = false;
  }, [topology, anchor]);
  const relatedTopics = new Set(
    data.repos
      .filter((repo) => repo.topics.includes(topic))
      .flatMap((repo) => repo.topics),
  );
  const relevant = (n: GraphNode) =>
    routeView
      ? routeView.members.has(n.id)
      : !topic ||
        (n.kind === "topic" && relatedTopics.has(n.label)) ||
        !!n.repo?.topics.includes(topic);
  function pick(node: GraphNode) {
    if (node.repo) {
      if (selectionMode) {
        if (pickedIds.has(node.id) || pickedIds.size < MAX_SELECTION)
          onToggleProject(node.repo);
        return;
      }
      onSelect(node.repo);
    } else {
      onTopic(node.label);
      focusTopic(node.label);
    }
  }
  return (
    <div className="graph-scene" ref={host} aria-label="GitHub 项目三维图谱" data-selection-volume={localSelection.length >= 2} onPointerDown={cancelSelectionFocus} onWheel={cancelSelectionFocus}>
      <ForceGraph<GraphNode>
        ref={graph}
        graphData={scene}
        width={size.width}
        height={size.height}
        backgroundColor="rgba(0, 0, 0, 0)"
        showNavInfo={false}
        nodeLabel={() => ""}
        nodeVal={(n) =>
          n.kind === "topic"
            ? 1.5
            : 3 + Math.min(5, Math.log10((n.repo?.stars || 0) + 1))
        }
        nodeColor={(n) =>
          pickedIds.has(n.id)
            ? "#efbf72"
            : !relevant(n)
              ? n.kind === "topic"
                ? "#b59160"
                : "#629fa9"
              : n.id === selected
                ? "#f5fff8"
                : n.repo?.understanding?.role === "resource" ||
                    n.repo?.understanding?.role === "example"
                  ? "#f2b76e"
                  : n.kind === "topic"
                    ? "#e5b860"
                    : "#55d6c0"
        }
        nodeRelSize={3.5}
        nodeOpacity={0.95}
        nodeResolution={16}
        linkColor={(link) => {
          if (
            routeView &&
            !routeView.members.has(
              endpoint(link.source as string | GraphNode),
            ) &&
            !routeView.members.has(endpoint(link.target as string | GraphNode))
          )
            return "#475d65";
          if (link.kind === "explore_relation")
            return link.basis === "documented_reference"
              ? "#ebac76"
              : "#9ea8ee";
          const source = scene.nodes.find(
            (n) => n.id === endpoint(link.source as string | GraphNode),
          );
          return source && relevant(source) ? "#77b7b0" : "#475d65";
        }}
        linkOpacity={0.55}
        linkWidth={(link) =>
          pickedIds.has(endpoint(link.source as string | GraphNode)) &&
          pickedIds.has(endpoint(link.target as string | GraphNode))
            ? 2.8
            : link.kind === "explore_relation"
              ? 1.4
              : 0.6
        }
        linkCurvature={(link) => link.curvature || 0}
        warmupTicks={50}
        cooldownTicks={80}
        onEngineTick={tension.tick}
        onEngineStop={() => {
          for (const node of scene.nodes) {
            node.fx = node.x;
            node.fy = node.y;
            node.fz = node.z;
          }
          if (!fitted.current) {
            if (anchor) fit(45);
            else if (selected) focus(selected);
            else if (routeView) focusRoute();
            else if (topic) focusTopic(topic);
            else fit(35);
            fitted.current = true;
          }
          tension.settled();
        }}
        onNodeClick={pick}
        onNodeHover={(node) => setHovered(node?.label || null)}
        onLinkHover={(link) =>
          setHovered(
            link
              ? relationshipLabel(link as GraphLink, scene.nodes) || null
              : null,
          )
        }
        onLinkClick={(link) => {
          if (selectionMode) return;
          if (link.kind !== "explore_relation") return;
          const target = scene.nodes.find(
            (node) => node.id === endpoint(link.target as string | GraphNode),
          );
          if (target) pick(target);
        }}
        onBackgroundClick={onClose}
        onNodeDrag={tension.drag}
        onNodeDragEnd={(node) => {
          node.fx = node.x;
          node.fy = node.y;
          node.fz = node.z;
          tension.release(node);
        }}
      />
      <GraphLabels
        graph={graph}
        scene={scene}
        width={size.width}
        height={size.height}
        selected={selected}
        topic={topic}
        highlightedIds={routeView?.members}
        selectionMode={selectionMode}
        pickedIds={pickedIds}
        onPick={pick}
      />
      {selectionMode && (
        <div className="graph-selection-status" role="status">
          <span />
          多选模式{" "}
          <strong>
            {pickedIds.size} / {MAX_SELECTION}
          </strong>
        </div>
      )}
      {hovered && <div className="graph-hover">{hovered}</div>}
      <div className="graph-legend">
        <span>
          <i />
          仓库
        </span>
        {showTopics && (
          <span>
            <i />
            GitHub Topic
          </span>
        )}
        {data.atlas && <span>橙色节点 · 资料 / 示例</span>}
        <span>{data.atlas ? "橙线 · 文档声明 / 紫线 · 推断" : "关联线索"}</span>
      </div>
      <div className="graph-controls">
        {!!scene.nodes.filter((node) => pickedIds.has(node.id)).length && (
          <button
            title="聚焦选集"
            aria-label="聚焦选集"
            onClick={focusSelection}
          >
            <Crosshair size={18} />
          </button>
        )}
        {routeView && (
          <button
            title="清除路线聚焦"
            aria-label="清除路线聚焦"
            onClick={() => onRoute?.("")}
          >
            <FilterX size={17} />
          </button>
        )}
        {topic && (
          <button
            title="清除主题筛选"
            aria-label="清除主题筛选"
            onClick={() => {
              onTopic("");
              fit(35);
            }}
          >
            <FilterX size={18} />
          </button>
        )}
        <button title="全景" aria-label="全景" onClick={() => fit(60)}>
          <Maximize size={18} />
        </button>
        <button
          title="聚焦选中项目"
          aria-label="聚焦选中项目"
          disabled={!selected}
          onClick={() => selected && focus(selected)}
        >
          <Crosshair size={18} />
        </button>
      </div>
      <div className="graph-count">
        {scene.nodes.length} NODES / {scene.links.length} LINKS
      </div>
    </div>
  );
}
