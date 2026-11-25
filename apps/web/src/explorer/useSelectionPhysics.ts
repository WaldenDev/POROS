import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { ForceGraphMethods } from "react-force-graph-3d";
import type { GraphData, GraphNode } from "./graphData";
import { SelectionPhysics } from "./selectionPhysics";

export function useSelectionPhysics(
  graph: RefObject<ForceGraphMethods<GraphNode> | undefined>,
  scene: GraphData, topology: string, picked: Set<string>, reduced: boolean,
) {
  const physics = useMemo(() => new SelectionPhysics(), [topology]);
  const current = useRef({ picked, reduced });
  current.current = { picked, reduced };
  const selectionKey = JSON.stringify([...picked].sort());
  useEffect(() => {
    if (physics.select(current.current.picked, current.current.reduced)) graph.current?.d3ReheatSimulation();
  }, [physics, selectionKey, reduced, graph]);
  useEffect(() => () => physics.dispose(), [physics]);
  return {
    tick: () => physics.step(),
    settled: () => {
      if (!physics.ready) {
        physics.initialize(scene.nodes);
        if (physics.select(current.current.picked, current.current.reduced)) graph.current?.d3ReheatSimulation();
      } else if (physics.active) physics.finish();
    },
    drag: (node: GraphNode) => physics.drag(node),
    release: (node: GraphNode) => {
      physics.release(node);
      if (physics.active) graph.current?.d3ReheatSimulation();
    },
  };
}
