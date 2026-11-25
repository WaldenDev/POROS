"""Enforce provenance and conservative relation changes; not semantic proof."""

from collections import Counter

from .atlas_contracts import RelationDraft
from .atlas_sources import digest
from .atlas_validation import explicit_reference, ground_relations


def documented_reference(edge, items):
    """A failed integration claim may retain only its independently grounded link."""
    source, target = items[edge["source"]], items[edge["target"]]
    draft = RelationDraft(
        source=edge["source"],
        target=edge["target"],
        kind="references",
        claim=f"{source['name']} 的文档链接到 {target['name']}。",
        distinction="只确认文档提及，尚不能证明实际集成或兼容。",
        fact_ids=edge["fact_ids"],
    )
    grounded, _ = ground_relations([draft], list(items.values()))
    return grounded[0] if grounded else None


def curate_relations(base, reviews):
    items = {item["repo_id"]: item for item in base["understandings"]}
    facts = {fact["id"]: fact for item in items.values() for fact in item["facts"]}
    counts = Counter(review.relation_id for review in reviews)
    by_id = {
        review.relation_id: review
        for review in reviews
        if counts[review.relation_id] == 1
    }
    candidates = {
        edge["id"] for edge in base["relations"] if edge["kind"] != "references"
    }
    invalid = sum(id not in candidates or count > 1 for id, count in counts.items())
    accepted, decisions = {}, []
    for edge in base["relations"]:
        if edge["kind"] == "references":
            # Recheck old cached maps, not just newly generated candidates.
            reference = documented_reference(edge, items)
            if reference:
                accepted[reference["id"]] = {
                    **reference,
                    "review": {
                        "method": "document_link",
                        "reason": "原文明确链接到目标项目；未据此断言集成。",
                    },
                }
            continue
        review = by_id.get(edge["id"])
        valid = review is not None
        pair = {edge["source"], edge["target"]}
        evidence = (
            [facts[id] for id in review.fact_ids if id in facts] if review else []
        )
        if review:
            valid = len(evidence) == len(review.fact_ids) and all(
                f["repo_id"] in pair for f in evidence
            )
            if review.verdict == "retain":
                valid = valid and review.endpoint_scope == "repositories"
                valid = valid and {f["repo_id"] for f in evidence} == pair
                valid = (
                    valid
                    and len((review.claim or "").strip()) >= 8
                    and len((review.distinction or "").strip()) >= 8
                )
                if edge["kind"] == "complements":
                    valid = (
                        valid
                        and review.pair_basis == "specific"
                        and bool(review.pending_checks)
                        and all(check.strip() for check in review.pending_checks)
                    )
                if edge["kind"] == "same_problem":
                    resource_count = sum(items[id]["role"] == "resource" for id in pair)
                    valid = valid and resource_count != 1
                if edge["kind"] == "integrates":
                    quote = review.integration_evidence
                    usage = [
                        f
                        for f in evidence
                        if quote
                        and f["repo_id"] == edge["source"]
                        and f["kind"] == "interface"
                        and f.get("origin") != "document_link"
                        and f["citation"]["document_id"] == quote.document_id
                        and quote.excerpt in f["citation"]["excerpt"]
                    ]
                    valid = (
                        valid
                        and bool(usage)
                        and items[edge["source"]]["role"] != "resource"
                    )
                    valid = (
                        valid
                        and bool(quote)
                        and explicit_reference(
                            [{"citation": {"excerpt": quote.excerpt}}] if quote else [],
                            items[edge["target"]]["name"],
                        )
                    )
        if not valid:
            invalid += 1
        verdict = review.verdict if valid else "pending"
        decision = {
            "relation_id": edge["id"],
            "source": edge["source"],
            "target": edge["target"],
            "kind": edge["kind"],
            "verdict": verdict,
            "reason": review.reason
            if valid
            else "语义复核尚未完成或证据绑定不合格，暂不展示此推断。",
            "fact_ids": list(dict.fromkeys(review.fact_ids))
            if valid
            else edge["fact_ids"],
            "endpoint_scope": review.endpoint_scope if valid else "unclear",
            "pair_basis": review.pair_basis if valid else "unclear",
        }
        decisions.append(decision)
        if verdict == "retain":
            accepted[edge["id"]] = {
                **edge,
                "claim": review.claim,
                "distinction": review.distinction,
                "fact_ids": list(dict.fromkeys(review.fact_ids)),
                "pending_checks": review.pending_checks,
                "review": {
                    "method": "model",
                    "reason": review.reason,
                    "integration_evidence": review.integration_evidence.model_dump()
                    if review.integration_evidence
                    else None,
                },
            }
        elif edge["kind"] == "integrates" or verdict == "reference_only":
            reference = documented_reference(edge, items)
            if reference:
                reference["review"] = {
                    "method": "document_link",
                    "reason": decision["reason"],
                }
                accepted.setdefault(reference["id"], reference)
                decision["replacement_id"] = reference["id"]
    return list(accepted.values()), decisions, invalid


def ground_landscape(draft, understandings):
    items = {item["repo_id"]: item for item in understandings}
    routes, assigned, seen = [], set(), set()
    rejected = 0
    for route in draft.routes:
        members = []
        ids = [member.repo_id for member in route.members]
        valid = len(ids) == len(set(ids)) and set(ids).issubset(items)
        for member in route.members:
            owned = {
                fact["id"] for fact in items.get(member.repo_id, {}).get("facts", [])
            }
            valid = valid and set(member.fact_ids).issubset(owned)
            members.append(member.model_dump())
        signature = (route.title.strip(), tuple(sorted(ids)))
        if not valid or signature in seen:
            rejected += 1
            continue
        seen.add(signature)
        assigned.update(ids)
        routes.append(
            {
                "id": "route:" + digest(signature)[:16],
                "title": route.title,
                "description": route.description,
                "members": members,
            }
        )
    return {
        "summary": draft.summary
        if routes
        else "当前材料不足以组织出有依据的探索路线。",
        "routes": routes,
        "unassigned_repo_ids": sorted(set(items) - assigned),
        "scope_note": "仅组织本批已读项目，不代表完整领域；路线归属不表示依赖或兼容。",
    }, rejected
