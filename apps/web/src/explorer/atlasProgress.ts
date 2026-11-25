export type AtlasProgress = {
  stage: string;
  completed: number;
  total: number;
  elapsed_seconds?: number;
};

export const atlasStages = [
  { id: "sources", label: "读取材料" },
  { id: "reading", label: "提取事实" },
  { id: "relating", label: "核对关系" },
  { id: "curating", label: "整理路线" },
];

export function progressMessage(progress: AtlasProgress): string {
  const names: Record<string, string> = {
    queued: "等待知识整理",
    sources: "读取项目材料",
    reading: "提取项目事实",
    relating: "核对跨项目关系",
    curating: "组织探索路线与复核关系",
  };
  const count = ["sources", "reading"].includes(progress.stage)
    ? ` · ${progress.completed}/${progress.total}`
    : "";
  return (names[progress.stage] || "知识整理中") + count;
}

export function elapsedLabel(seconds: number): string {
  return seconds < 60
    ? `${seconds} 秒`
    : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}
