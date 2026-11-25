"""Derived landscape and review contracts, separate from repository facts."""

from typing import Literal

from pydantic import Field, ValidationError

from .atlas_contracts import Quote, StrictModel


class RouteMemberDraft(StrictModel):
    repo_id: str
    reason: str = Field(min_length=4, max_length=180)
    fact_ids: list[str] = Field(min_length=1, max_length=4)


class RouteDraft(StrictModel):
    title: str = Field(min_length=2, max_length=40)
    description: str = Field(min_length=8, max_length=220)
    members: list[RouteMemberDraft] = Field(min_length=1, max_length=12)


class RelationReviewDraft(StrictModel):
    relation_id: str
    verdict: Literal["retain", "omit", "reference_only"]
    endpoint_scope: Literal["repositories", "external_example", "unclear"]
    reason: str = Field(min_length=8, max_length=240)
    fact_ids: list[str] = Field(min_length=1, max_length=6)
    claim: str | None = Field(default=None, max_length=280)
    distinction: str | None = Field(default=None, max_length=280)
    pending_checks: list[str] = Field(default_factory=list, max_length=3)
    pair_basis: Literal["specific", "generic", "unclear"] = "unclear"
    integration_evidence: Quote | None = None


class CurationDraft(StrictModel):
    summary: str = Field(max_length=360)
    routes: list[RouteDraft] = Field(max_length=6)
    reviews: list[RelationReviewDraft] = Field(max_length=24)


class CurationEnvelope(StrictModel):
    summary: str = Field(max_length=360)
    routes: list[object] = Field(max_length=6)
    reviews: list[object] = Field(max_length=24)


def parse_curation(value):
    """Keep valid records when one model-generated item violates the contract."""
    envelope = CurationEnvelope.model_validate(value)
    parsed, errors = {}, []
    for name, model in (("routes", RouteDraft), ("reviews", RelationReviewDraft)):
        parsed[name] = []
        for index, item in enumerate(getattr(envelope, name)):
            try:
                parsed[name].append(model.model_validate(item))
            except ValidationError as exc:
                errors.extend(
                    {"location": [name, index, *error["loc"]], "type": error["type"]}
                    for error in exc.errors()
                )
    return CurationDraft(summary=envelope.summary, **parsed), errors
