import { useEffect, useRef, useState } from "react";
import { ExploreError, fetchExplore } from "./api";
import type { Atlas, Repo } from "./contracts";
import { progressMessage, type AtlasProgress } from "./atlasProgress";

export function useAtlas() {
  const [result, setResult] = useState<Atlas>();
  const [progress, setProgress] = useState<AtlasProgress>();
  const [elapsed, setElapsed] = useState(0);
  const [connection, setConnection] = useState("");
  const [error, setError] = useState("");
  const jobId = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const last = useRef<{ repositories: string[]; query: string } | undefined>(
    undefined,
  );
  useEffect(() => () => controller.current?.abort(), []);
  const busy = !!progress;
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  function reset() {
    controller.current?.abort();
    controller.current = null;
    jobId.current = null;
    last.current = undefined;
    setResult(undefined);
    setProgress(undefined);
    setError("");
    setConnection("");
    setElapsed(0);
  }
  async function start(repos?: Repo[], query = "") {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const payload = repos
      ? { repositories: repos.slice(0, 12).map((repo) => repo.name), query }
      : last.current;
    if (!payload?.repositories.length) return;
    if (repos) jobId.current = null;
    last.current = payload;
    setError("");
    setConnection("");
    if (!jobId.current) setElapsed(0);
    setProgress({
      stage: "queued",
      completed: 0,
      total: payload.repositories.length,
    });
    try {
      const job = jobId.current
        ? { id: jobId.current }
        : await fetchExplore<{ id: string }>(
            "/atlas",
            payload,
            request.signal,
            15000,
          );
      if (request.signal.aborted) return;
      if (!job.id) throw new Error("知识整理服务返回无效任务");
      jobId.current = job.id;
      const deadline = Date.now() + 45 * 60 * 1000;
      let failures = 0;
      while (!request.signal.aborted && Date.now() < deadline) {
        try {
          const update = await fetchExplore<
            AtlasProgress & {
              status: string;
              error?: string;
              result?: Atlas;
              preview?: Atlas;
            }
          >(`/atlas/jobs/${job.id}`, undefined, request.signal, 15000);
          if (request.signal.aborted) return;
          failures = 0;
          setConnection("");
          if (update.elapsed_seconds !== undefined)
            setElapsed(update.elapsed_seconds);
          if (update.status === "failed") {
            jobId.current = null;
            throw new Error(update.error || "知识整理失败");
          }
          if (update.status === "completed") {
            if (!update.result) throw new Error("缺少知识整理结果");
            jobId.current = null;
            setResult(update.result);
            return;
          }
          setProgress(update);
          if (update.preview?.understandings.length)
            setResult((old) =>
              old?.status === "complete" || old?.landscape?.routes.length
                ? old
                : update.preview,
            );
        } catch (error) {
          if (request.signal.aborted) return;
          if (error instanceof ExploreError && error.status === 404)
            jobId.current = null;
          if (!jobId.current || ++failures >= 3) throw error;
          setConnection("连接暂时中断，正在恢复同一任务…");
        }
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            request.signal.removeEventListener("abort", done);
            resolve();
          };
          const timer = setTimeout(done, 1500);
          request.signal.addEventListener("abort", done, { once: true });
        });
      }
      if (!request.signal.aborted)
        throw new Error("整理等待超时，请重试查看缓存结果");
    } catch (e) {
      if (!request.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (controller.current === request) setProgress(undefined);
    }
  }
  return {
    result,
    progress,
    error,
    busy,
    elapsed,
    connection,
    reset,
    start,
    message: progress ? progressMessage(progress) : "",
  };
}
