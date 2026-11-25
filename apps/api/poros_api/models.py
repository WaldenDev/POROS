from __future__ import annotations

from typing import Literal


Language = Literal["en", "zh"]

from pydantic import BaseModel, Field


ProjectWeight = Literal["toy", "compact", "portfolio", "ambitious", "unspecified"]
IdeaStatus = Literal["seed", "planned", "building", "archived"]


class IntentSpec(BaseModel):
    schema_version: str = "intent_spec.v1"
    artifact_type: str = ""
    project_weight: ProjectWeight = "compact"
    skill_goals: list[str] = Field(default_factory=list)
    domain_interests: list[str] = Field(default_factory=list)
    avoid: list[str] = Field(default_factory=list)
    motivation: str = ""
    freeform_note: str = ""
    confidence: int = 40
    guide_enabled: bool = False
    guide_summary: str = ""


class UserProfile(BaseModel):
    schema_version: str = "user_profile.v1"
    role: str = "Agent Engineer"
    timebox: str = "compact"
    stacks: list[str] = Field(default_factory=lambda: ["Python", "TypeScript"])
    novelty: int = 68
    buildability: int = 74
    language: Language = "en"
    note: str = ""
    intent: IntentSpec = Field(default_factory=IntentSpec)


class DiscoveryRequest(BaseModel):
    schema_version: str = "discovery_request.v1"
    pivot: str
    profile: UserProfile = Field(default_factory=UserProfile)
    source: Literal["mock", "github"] = "mock"
    engine_id: str = "poros_v1_default"


class WorkflowStage(BaseModel):
    schema_version: str = "workflow_stage.v1"
    key: str
    label: str
    agent: str
    summary: str
    detail: str


class RepoSignal(BaseModel):
    schema_version: str = "repo_signal.v1"
    id: str
    name: str
    description: str
    html_url: str | None = None
    language: str
    stars: int
    forks: int
    open_issues: int = 0
    pushed_at: str | None = None
    activity: str
    topics: list[str]
    signal: str
    pain_points: list[str]
    opportunity_gap: str
    score: int


class Idea(BaseModel):
    schema_version: str = "idea.v1"
    id: str
    session_id: str
    title: str
    subtitle: str
    thesis: str
    evidence: str
    mvp: list[str]
    stack: list[str]
    resume_bullets: list[str]
    difficulty: str
    novelty: int
    buildability: int
    score: int
    source_repo_ids: list[str]
    revision: int = 0
    saved: bool = False
    user_note: str = ""
    status: IdeaStatus = "seed"
    tags: list[str] = Field(default_factory=list)


class SessionSnapshot(BaseModel):
    schema_version: str = "session_snapshot.v1"
    id: str
    pivot: str
    profile: UserProfile
    opportunity_index: int
    stages: list[WorkflowStage]
    repos: list[RepoSignal]
    ideas: list[Idea]


class SessionSummary(BaseModel):
    schema_version: str = "session_summary.v1"
    id: str
    pivot: str
    profile: UserProfile
    opportunity_index: int
    source: str = "mock"
    status: str = "completed"
    engine_id: str = "poros_v1_default"
    engine_version: str = "1.0"
    repo_count: int
    idea_count: int
    has_evidence_pack: bool = False
    has_saved_idea: bool = False
    created_at: str
    updated_at: str


class ReviseRequest(BaseModel):
    mode: Literal["simpler", "ai_depth", "backend", "resume", "business", "custom"]
    note: str | None = None


class FeedbackRequest(BaseModel):
    kind: Literal["interest", "reject", "too_easy", "too_hard", "too_large", "irrelevant", "keep", "save"]
    note: str | None = None


class SaveIdeaRequest(BaseModel):
    note: str | None = None
    status: IdeaStatus = "seed"
    tags: list[str] = Field(default_factory=list)


class IdeaFeedbackEvent(BaseModel):
    schema_version: str = "idea_feedback_event.v1"
    id: int
    idea_id: str
    kind: str
    note: str | None = None
    created_at: str


class IdeaFeedbackHistory(BaseModel):
    schema_version: str = "idea_feedback_history.v1"
    idea_id: str
    events: list[IdeaFeedbackEvent]


class LibraryItem(BaseModel):
    idea: Idea
    pivot: str
    saved_at: str
    latest_note: str | None = None
    feedback_count: int = 0


class RequirementGuideTurn(BaseModel):
    question: str
    answer: str


class RequirementGuideRequest(BaseModel):
    schema_version: str = "requirement_guide_request.v1"
    pivot: str = ""
    profile: UserProfile = Field(default_factory=UserProfile)
    history: list[RequirementGuideTurn] = Field(default_factory=list)
    max_turns: int = 5


class RequirementGuideResponse(BaseModel):
    schema_version: str = "requirement_guide_response.v1"
    provider: str = "rules"
    done: bool = False
    question: str = ""
    rationale: str = ""
    suggested_pivot: str = ""
    suggested_intent: IntentSpec = Field(default_factory=IntentSpec)
    missing_slots: list[str] = Field(default_factory=list)
