"""One bounded review/organization pass over existing facts, with its own revisions."""

from copy import deepcopy
import json
from time import monotonic

from pydantic import ValidationError

from .atlas_map_contracts import parse_curation
from .atlas_map_validation import curate_relations, ground_landscape
from .atlas_identity import knowledge_input
from .atlas_service import SYSTEM, analyze_snapshots
from .atlas_sources import digest, now
from .llm import LLMProviderError, request_llm_json

CURATION_VERSION = "curation.3"
PROMPT = """Organize and critically review this SMALL cohort using only the supplied facts AND their verbatim citations.
Return {"summary":"short Chinese overview of THIS cohort's approaches, not the whole field",
"routes":[{"title":"concrete approach/task, not generic AI/Python", "description":"what this route does and its boundary",
"members":[{"repo_id":"...", "reason":"why this project belongs here", "fact_ids":["its own supporting fact IDs"]}]}],
"reviews":[{"relation_id":"supplied candidate ID", "verdict":"retain|omit|reference_only",
"endpoint_scope":"repositories|external_example|unclear",
"reason":"brief evidence-based decision, NOT private reasoning", "fact_ids":["supporting IDs"],
"claim":"revised narrow claim for retain", "distinction":"concrete difference or honestly unresolved boundary",
"pending_checks":["specific condition not established by the documents"],
"pair_basis":"specific|generic|unclear",
"integration_evidence":null}]}.
Use 0-6 meaningful routes. Do not force categories or invent members. A repository may belong to multiple routes.
Keep resource lists/tutorials distinct from executable solutions. Every member must cite its OWN facts.
Do not equate one broad topic with a shared user task. Describe approaches, not just repository roles.
Review EACH supplied candidate exactly once; never add relations or upgrade relation types.
Read citations, not just earlier model claims. Shared keywords alone are insufficient.
Check WHO the evidence describes: both endpoint repositories themselves, a separately linked external demo,
or unclear. A tool's README linking a voice-assistant demo does NOT make that demo the tool itself.
Never change a relation's endpoints in the prose to make it sound supportable. If a shared task is only
established for an external example/plugin rather than the endpoint itself, mark external_example and omit.
same_problem requires the same concrete user task; keep differences explicit. A resource list is not an alternative implementation.
complements requires complementary responsibilities and MUST include at least one concrete pending check.
For complements, classify pair_basis: specific only if cited evidence establishes a concrete handoff
such as a named API/protocol, shared model/artifact format or explicitly documented provider relationship.
A generic story of 'try A then deploy B', 'edit an image then upload to B', or 'both could be used in a workflow'
is generic, NOT a pair-specific connection. Omit generic/unclear complements. Pending checks do not create
missing connection evidence. A specific handoff is still hypothetical until actually tested.
Do not turn asymmetric documentation into an exclusive feature difference: A mentions X does not mean B lacks X.
If the supplied facts cannot establish a useful difference, state that the distinction is unresolved.
Keep platform, component and time scope explicit: a desktop build constraint is not automatically an SDK
or entire project's constraint. A broad route title must not conceal Android-only or tutorial-only scope.
integrates requires the source itself explicitly describing use of the target, not merely a URL, logo, contributor,
comparison, historical mention, API similarity or dependency through another project.
For retaining integrates supply integration_evidence={"document_id":"source doc", "excerpt":"verbatim 16-650 chars"}
containing the target GitHub URL AND the explicit usage statement, within a cited source interface fact.
If integration is not established but the source links the target, use reference_only. No claim of tested interoperability.
For retain cite facts from BOTH endpoints and give claim/distinction. For omit/reference_only cite facts supporting the decision.
Unanswered questions must not be rephrased as absent features. Correct overstatement, omit unsupported inference.
Use concise Chinese for prose; original names and exact quotations remain unchanged. No scores or popularity-based quality.
Do not repeat English quotations in prose: fact_ids already expose the verbatim evidence. Prefer short Chinese paraphrases.
Respect these maximum lengths: summary 360 characters, title 40, route description 220, member reason 180,
review reason 240, claim/distinction 280. Each route member uses 1-4 fact IDs; each review uses 1-6 fact IDs.
"""


def curate_map(
    base, query, store, complete=None, progress=None, recorded_response=None
):
    complete = complete or request_llm_json
    started = monotonic()
    key = digest(
        [
            CURATION_VERSION,
            base["id"],
            base["model"],
            query.strip().lower(),
            base["relations"],
        ]
    )
    legacy_key = key
    inputs = knowledge_input(base["understandings"])
    key = digest([key, inputs])
    scope = digest(["curated", base["scope"]])
    cached_map = store.get_map(key) if base["status"] == "complete" else None
    cached = cached_map or store.checkpoint("curation:" + key)
    if not cached:
        legacy_map = store.get_map(legacy_key) if base["status"] == "complete" else None
        legacy = legacy_map or store.checkpoint("curation:" + legacy_key)
        if legacy and knowledge_input(legacy["understandings"]) == inputs:
            cached_map, cached = legacy_map, legacy
    if cached:
        result = {
            **cached,
            "id": cached["id"] if cached_map else key,
            "status": base["status"],
            "coverage": base.get("coverage"),
            "checked_at": now(),
            "warnings": base["warnings"],
            "metrics": {
                **cached["metrics"],
                **base["metrics"],
                "relations": len(cached["relations"]),
                "curation_model_calls": 0,
                "curation_cache_hit": True,
                "curation_seconds": round(monotonic() - started, 2),
                "elapsed_seconds": round(
                    base["metrics"]["elapsed_seconds"] + monotonic() - started, 2
                ),
            },
        }
        return (
            store.save_map(key, scope, result)
            if result["status"] == "complete" and not cached_map
            else result
        )
    relations, decisions, _ = curate_relations(base, [])
    result = {
        **deepcopy(base),
        "schema_version": "atlas.v2",
        "id": key,
        "scope": scope,
        "source_map_id": base["id"],
        "curation_version": CURATION_VERSION,
        "created_at": now(),
        "status": "partial",
        "relations": relations,
        "relation_decisions": decisions,
        "curation_status": "pending",
        "landscape": {
            "summary": "",
            "routes": [],
            "unassigned_repo_ids": [item["repo_id"] for item in base["understandings"]],
            "scope_note": "路线组织尚未完成。",
        },
    }
    result["metrics"].update(
        curation_model_calls=0, curation_cache_hit=False, relations=len(relations)
    )
    if progress:
        progress(
            "curating",
            len(base["understandings"]),
            base["metrics"]["repositories"],
            result,
        )
    if not base["understandings"]:
        result["curation_status"] = "blocked"
        result["warnings"].append(
            "尚无通过校验的项目事实，无法组织路线；可重试补全材料。"
        )
        return result
    if base["status"] != "complete":
        result["warnings"].append(
            "路线与复核仅基于本次已通过校验的事实和候选关系，未读或未通过部分不参与判断。"
        )
    try:
        if recorded_response is None:
            result["metrics"]["model_calls"] += 1
            result["metrics"]["curation_model_calls"] = 1
            response = complete(
                SYSTEM,
                PROMPT
                + json.dumps(
                    {
                        "query": query,
                        "repositories": base["understandings"],
                        "candidates": [
                            edge
                            for edge in base["relations"]
                            if edge["kind"] != "references"
                        ],
                    },
                    ensure_ascii=False,
                ),
            )
        else:
            response = recorded_response
            result["metrics"]["curation_response_replayed"] = True
        draft, parse_errors = parse_curation(response)
        relations, decisions, rejected_reviews = curate_relations(base, draft.reviews)
        landscape, rejected_routes = ground_landscape(draft, base["understandings"])
        rejected_routes += len(
            {
                error["location"][1]
                for error in parse_errors
                if error["location"][0] == "routes"
            }
        )
        rejected_reviews += len(
            {
                error["location"][1]
                for error in parse_errors
                if error["location"][0] == "reviews"
            }
        )
        if parse_errors:
            result["metrics"]["validation_errors"] = parse_errors[:8]
        if rejected_routes:
            landscape["summary"] = (
                "当前仅展示通过证据绑定的路线，其余组织判断尚待补全。"
            )
        result.update(
            relations=relations, relation_decisions=decisions, landscape=landscape
        )
        result["curation_status"] = (
            "complete" if not rejected_reviews and not rejected_routes else "partial"
        )
        result["status"] = (
            "complete"
            if result["curation_status"] == "complete" and base["status"] == "complete"
            else "partial"
        )
        result["metrics"].update(
            rejected_reviews=rejected_reviews, rejected_routes=rejected_routes
        )
        if rejected_reviews or rejected_routes:
            result["warnings"].append(
                "部分路线或复核结论未通过证据绑定，已暂缓展示；可重试，不覆盖上次完整地图。"
            )
    except (LLMProviderError, ValidationError, ValueError, TypeError) as exc:
        result["curation_status"] = "failed"
        result["metrics"]["failures"] = [
            *result["metrics"].get("failures", []),
            {"stage": "curating", "type": type(exc).__name__},
        ]
        if isinstance(exc, ValidationError):
            result["metrics"]["validation_errors"] = [
                {"location": list(error["loc"]), "type": error["type"]}
                for error in exc.errors()[:8]
            ]
        result["warnings"].append(
            "路线与关系复核暂未完成；事实和文档引用保留，未复核推断暂不连线，可重试。"
        )
    result["metrics"].update(
        relations=len(result["relations"]),
        routes=len(result["landscape"]["routes"]),
        withheld_relations=sum(
            item["verdict"] in {"omit", "pending"}
            for item in result["relation_decisions"]
        ),
        curation_seconds=round(monotonic() - started, 2),
        elapsed_seconds=round(
            base["metrics"]["elapsed_seconds"] + monotonic() - started, 2
        ),
    )
    if result["curation_status"] == "complete":
        store.save_checkpoint("curation:" + key, result)
    return (
        store.save_map(key, scope, result) if result["status"] == "complete" else result
    )


def build_map(snapshots, query, store, complete=None, progress=None, model=None):
    base = analyze_snapshots(snapshots, query, store, complete, progress, model)
    understood = {item["repo_id"] for item in base["understandings"]}
    base["coverage"] = {
        "total": len(snapshots),
        "analyzed": len(understood),
        "missing": [
            snap["name"] for snap in snapshots if snap["repo_id"] not in understood
        ],
    }
    return curate_map(base, query, store, complete, progress)
