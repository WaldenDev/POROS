"""Contracts for evidence-backed repository understanding, independent of search."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

VERSION = "atlas.v1"
MAX_REPOS = 12


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AtlasRequest(StrictModel):
    repositories: list[str] = Field(min_length=1, max_length=MAX_REPOS)
    query: str = Field(default="", max_length=120)


class Quote(StrictModel):
    document_id: str
    excerpt: str = Field(min_length=16, max_length=650)


class FactDraft(StrictModel):
    kind: Literal["purpose", "mechanism", "interface", "boundary"]
    claim: str = Field(min_length=4, max_length=240)
    citation: Quote


class UnderstandingDraft(StrictModel):
    repo_id: str
    role: Literal["application", "library", "infrastructure", "resource", "example"]
    facts: list[FactDraft] = Field(min_length=1, max_length=6)
    unknowns: list[str] = Field(default_factory=list, max_length=3)


class ExtractionDraft(StrictModel):
    repositories: list[UnderstandingDraft] = Field(max_length=3)


class RelationDraft(StrictModel):
    source: str
    target: str
    kind: Literal["same_problem", "complements", "integrates", "references"]
    claim: str = Field(min_length=8, max_length=280)
    distinction: str = Field(min_length=8, max_length=280)
    fact_ids: list[str] = Field(min_length=2, max_length=6)


class MapDraft(StrictModel):
    relations: list[RelationDraft] = Field(max_length=24)


class ExtractionEnvelope(StrictModel):
    repositories: list[object] = Field(max_length=3)


class MapEnvelope(StrictModel):
    relations: list[object] = Field(max_length=24)


def parse_records(value, field, envelope, record):
    """A malformed record must not discard its valid siblings."""
    rows = getattr(envelope.model_validate(value), field)
    accepted, errors = [], []
    for index, row in enumerate(rows):
        try:
            accepted.append(record.model_validate(row))
        except ValidationError as exc:
            errors.extend(
                {"location": [field, index, *error["loc"]], "type": error["type"]}
                for error in exc.errors()
            )
    return accepted, errors
