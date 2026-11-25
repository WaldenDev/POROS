import type { Repo } from "./contracts";
export * from "./contracts";
const base = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8787";
export class ExploreError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function fetchExplore<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  timeoutMs = 0,
): Promise<T> {
  const response = await fetch(base + "/api/explore" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: timeoutMs
      ? AbortSignal.any([
          ...(signal ? [signal] : []),
          AbortSignal.timeout(timeoutMs),
        ])
      : signal,
  });
  if (!response.ok)
    throw new ExploreError(
      (await response.json().catch(() => ({}))).detail || "Request failed",
      response.status,
    );
  return response.json();
}
export const repoPath = (repo: Repo) =>
  "/repos/" + repo.name.split("/").map(encodeURIComponent).join("/");
