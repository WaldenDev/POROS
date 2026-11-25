import type { Atlas } from "./contracts";

export function routeNeighborhood(atlas: Atlas | undefined, routeId: string) {
  const route = atlas?.landscape?.routes.find(item => item.id === routeId);
  if (!route) return null;
  const members = new Set(route.members.map(member => member.repo_id));
  const neighbors = new Set<string>();
  for (const edge of atlas?.relations || []) {
    if (members.has(edge.source) && !members.has(edge.target)) neighbors.add(edge.target);
    if (members.has(edge.target) && !members.has(edge.source)) neighbors.add(edge.source);
  }
  return { route, members, neighbors };
}
