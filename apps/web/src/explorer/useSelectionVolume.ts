import { useEffect, type RefObject } from "react";
import { BufferGeometry, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, DoubleSide } from "three";
import type { ForceGraphMethods } from "react-force-graph-3d";
import type { GraphData, GraphNode } from "./graphData";
import { selectionVolume } from "./selectionVolume";

export function useSelectionVolume(
  graph: RefObject<ForceGraphMethods<GraphNode> | undefined>,
  data: GraphData, ids: Set<string>,
) {
  const key = JSON.stringify([...ids].sort());
  useEffect(() => {
    const nodes = data.nodes.filter(node => ids.has(node.id));
    if (nodes.length < 2) return;
    const group = new Group();
    group.name = "selection-volume";
    const material = new MeshBasicMaterial({ color: "#e8bf78", transparent: true, opacity: 0.085, depthWrite: false, side: DoubleSide });
    const outlineMaterial = new LineBasicMaterial({ color: "#f1ce8e", transparent: true, opacity: 0.28, depthWrite: false });
    const shell = new Mesh(new BufferGeometry(), material);
    const outline = new LineSegments(new BufferGeometry(), outlineMaterial);
    shell.raycast = () => {};
    outline.raycast = () => {};
    group.add(shell, outline);
    let frame = 0, attached = false, last = "", lastTime = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (!graph.current || now - lastTime < 32) return;
      lastTime = now;
      if (!attached) { graph.current.scene().add(group); attached = true; }
      const signature = nodes.map(n => [n.x, n.y, n.z].map(v => (v ?? 0).toFixed(2)).join(",")).join(";");
      if (signature === last) return;
      last = signature;
      const geometry = selectionVolume(nodes);
      shell.geometry.dispose(); outline.geometry.dispose();
      shell.geometry = geometry;
      outline.geometry = new EdgesGeometry(geometry, 20);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      group.removeFromParent();
      shell.geometry.dispose(); outline.geometry.dispose();
      material.dispose(); outlineMaterial.dispose();
    };
  }, [graph, data, key]);
}
