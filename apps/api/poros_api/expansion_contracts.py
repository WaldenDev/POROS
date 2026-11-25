"""Explorer expansion contracts, independent of HTTP and graph rendering."""

from typing import Literal
from pydantic import BaseModel, Field
from .explorer_filters import SearchFilters

ExpansionMode = Literal["alternatives", "ecosystem", "inspiration"]


class ExpansionRequest(BaseModel):
    mode: ExpansionMode = "alternatives"
    page: int = Field(default=1, ge=1, le=5)
    seen_ids: list[str] = Field(default_factory=list, max_length=120)
    known_ids: list[str] = Field(default_factory=list, max_length=120)
    filters: SearchFilters = Field(default_factory=SearchFilters)


class RelationEvidence(BaseModel):
    kind: Literal["description", "readme", "topics"]
    url: str
    excerpt: str


class ExpansionRelation(BaseModel):
    source_id: str
    source_name: str
    mode: ExpansionMode
    basis: Literal["documented_reference", "inference"]
    provider: str
    reason: str
    evidence: list[RelationEvidence]


class RelationDecision(BaseModel):
    id: str
    reason: str = Field(min_length=1, max_length=300)
    source_quote: str = Field(min_length=8, max_length=500)
    candidate_quote: str = Field(min_length=8, max_length=500)


class RelationDecisions(BaseModel):
    matches: list[RelationDecision] = Field(max_length=16)
