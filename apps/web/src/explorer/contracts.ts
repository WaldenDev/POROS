import type { SearchFilters } from "./searchFilters";

export type ExpansionMode = "alternatives" | "ecosystem" | "inspiration";
export const expansionModes: Record<ExpansionMode, string> = {
  alternatives: "同类替代",
  ecosystem: "配套生态",
  inspiration: "灵感延伸",
};
export type Relation = {
  source_id: string;
  source_name: string;
  mode: ExpansionMode;
  basis: "documented_reference" | "inference";
  provider: string;
  reason: string;
  evidence: { kind: string; url: string; excerpt: string }[];
};
export type Repo = {
  id: string;
  name: string;
  url: string;
  description: string;
  stars: number;
  language: string;
  topics: string[];
  avatar: string;
  reason?: string;
  license?: string;
  open_issues?: number;
  relations?: Relation[];
  understanding?: Understanding;
};
export type Edge = {
  source: string;
  target: string;
  kind: string;
  evidence_url?: string;
  mode?: ExpansionMode;
  basis?: Relation["basis"];
  knowledge?: KnowledgeRelation;
};
export type Fact = {
  id: string;
  repo_id: string;
  kind: "purpose" | "mechanism" | "interface" | "boundary";
  claim: string;
  citation: {
    document_id: string;
    url: string;
    excerpt: string;
    kind: string;
    snapshot_hash: string;
    start_line: number;
    end_line: number;
  };
};
export type Understanding = {
  repo_id: string;
  name: string;
  role: "application" | "library" | "infrastructure" | "resource" | "example";
  facts: Fact[];
  unknowns: string[];
  snapshot_hash: string;
  fetched_at: string;
};
export type KnowledgeRelation = {
  id: string;
  source: string;
  target: string;
  kind: "same_problem" | "complements" | "integrates" | "references";
  claim: string;
  distinction: string;
  basis: "documented" | "inference";
  fact_ids: string[];
  pending_checks?: string[];
  review?: { method: "model" | "document_link"; reason: string };
};
export type LandscapeRoute = {
  id: string;
  title: string;
  description: string;
  members: { repo_id: string; reason: string; fact_ids: string[] }[];
};
export type RelationDecision = {
  relation_id: string;
  source: string;
  target: string;
  kind: KnowledgeRelation["kind"];
  verdict: "retain" | "omit" | "reference_only" | "pending";
  reason: string;
  fact_ids: string[];
  replacement_id?: string;
};
export type Atlas = {
  id: string;
  status: "complete" | "partial";
  model: string;
  created_at: string;
  checked_at: string;
  understandings: Understanding[];
  relations: KnowledgeRelation[];
  curation_status?: "pending" | "complete" | "partial" | "failed" | "blocked";
  coverage?: { total: number; analyzed: number; missing: string[] };
  relation_decisions?: RelationDecision[];
  landscape?: {
    summary: string;
    routes: LandscapeRoute[];
    unassigned_repo_ids: string[];
    scope_note: string;
  };
  warnings: string[];
  metrics: {
    repositories: number;
    facts: number;
    relations: number;
    model_calls: number;
    cached_repositories: number;
    map_cache_hit: boolean;
    elapsed_seconds: number;
  };
};
export const relationKinds = {
  same_problem: "相同问题",
  complements: "潜在互补",
  integrates: "文档声明集成",
  references: "文档引用",
};
export const roles = {
  application: "应用",
  library: "开发库",
  infrastructure: "基础设施",
  resource: "资料清单",
  example: "示例 / 教程",
};
export type Result = {
  filters?: SearchFilters;
  repos: Repo[];
  warnings: string[];
  edges: Edge[];
  analysis_available?: boolean;
  atlas?: Atlas;
  expansion?: {
    source_id: string;
    mode: ExpansionMode;
    provider: string;
    judgment_provider: string;
    strategy: string;
    candidate_count: number;
    accepted_count: number;
    new_repo_count?: number;
    existing_repo_count?: number;
  };
};
