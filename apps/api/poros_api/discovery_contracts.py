from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from .models import Language


class SearchBrief(BaseModel):
    schema_version: str = "search_brief.v1"
    pivot: str
    role_id: str
    profile_hint: str
    search_intent: str
    query_families: list[str]
    avoid_directions: list[str]
    fit_rubric: list[str]
    provider: str = "rules"


class SearchQueryPlan(BaseModel):
    schema_version: str = "search_query_plan.v1"
    brief: SearchBrief
    queries: list[str]
    provider: str = "github"


class RepoCandidate(BaseModel):
    schema_version: str = "repo_candidate.v1"
    id: str
    name: str
    description: str
    html_url: str | None = None
    language: str = "Unknown"
    stars: int = 0
    forks: int = 0
    open_issues: int = 0
    pushed_at: str | None = None
    topics: list[str] = Field(default_factory=list)
    archived: bool = False
    raw: dict[str, Any] = Field(default_factory=dict)


class RepoIssueExcerpt(BaseModel):
    schema_version: str = "repo_issue_excerpt.v1"
    title: str
    body_excerpt: str = ""
    comments: int = 0


class RepoEvidence(BaseModel):
    schema_version: str = "repo_evidence.v1"
    candidate: RepoCandidate
    readme_excerpt: str = ""
    issues: list[RepoIssueExcerpt] = Field(default_factory=list)
    extracted_pain_points: list[str] = Field(default_factory=list)


class RerankBreakdown(BaseModel):
    schema_version: str = "rerank_breakdown.v1"
    lexical_relevance: int = 0
    profile_fit: int = 0
    profile_guardrail: int = 0
    repo_quality: int = 0
    maintenance_recency: int = 0
    pain_evidence: int = 0
    llm_judge: int | None = None

    @property
    def total(self) -> int:
        values = [
            self.lexical_relevance,
            self.profile_fit,
            self.profile_guardrail,
            self.repo_quality,
            self.maintenance_recency,
            self.pain_evidence,
        ]
        if self.llm_judge is not None:
            values.append(self.llm_judge)
        return sum(values)


class RankedRepoEvidence(BaseModel):
    schema_version: str = "ranked_repo_evidence.v1"
    evidence: RepoEvidence
    score: int
    breakdown: RerankBreakdown
    rank_provider: str = "deterministic"


class EvidenceSource(BaseModel):
    schema_version: str = "evidence_source.v1"
    repo_id: str
    name: str
    description: str
    score: int
    why_selected: str
    key_signals: list[str]
    limitations: list[str] = Field(default_factory=list)


class PainPattern(BaseModel):
    schema_version: str = "pain_pattern.v1"
    label: str
    summary: str
    source_repo_ids: list[str]
    confidence: int


class OpportunityAngle(BaseModel):
    schema_version: str = "opportunity_angle.v1"
    title: str
    thesis: str
    source_repo_ids: list[str]
    mvp_hint: str
    portfolio_value: str
    risk: str


class EvidencePack(BaseModel):
    schema_version: str = "evidence_pack.v1"
    id: str
    session_id: str
    version: str = "0.1"
    pivot: str
    role_id: str
    language: Language
    source_repo_ids: list[str]
    sources: list[EvidenceSource]
    pain_patterns: list[PainPattern]
    opportunity_angles: list[OpportunityAngle]
    fit_notes: list[str] = Field(default_factory=list)
    risk_notes: list[str] = Field(default_factory=list)
    synthesis_hints: list[str] = Field(default_factory=list)
    confidence: int = 50
    created_by: Literal["deterministic", "llm_refined"] = "deterministic"


class PackValidation(BaseModel):
    schema_version: str = "pack_validation.v1"
    ok: bool
    warnings: list[str] = Field(default_factory=list)
