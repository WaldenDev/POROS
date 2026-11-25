import { Vector3 } from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import type { GraphNode } from "./graphData";

// Padding makes even two nodes or coplanar selections a closed 3D volume.
export function selectionVolume(nodes: GraphNode[]) {
  const points: Vector3[] = [];
  for (const node of nodes) {
    for (const x of [-18, 18]) for (const y of [-18, 18]) for (const z of [-18, 18])
      points.push(new Vector3((node.x ?? 0) + x, (node.y ?? 0) + y, (node.z ?? 0) + z));
  }
  return new ConvexGeometry(points);
}
