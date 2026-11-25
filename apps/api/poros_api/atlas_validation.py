"""Mechanical grounding checks, not a substitute for semantic evaluation."""

import re

from .atlas_sources import digest


def ground_understanding(draft, snapshot):
    docs = {doc["id"]: doc for doc in snapshot["documents"]}
    facts, rejected = [], 0
    for fact in draft.facts:
        doc = docs.get(fact.citation.document_id)
        excerpt = fact.citation.excerpt
        offset = doc["text"].find(excerpt) if doc else -1
        if offset < 0:
            rejected += 1
            continue
        line = doc["start_line"] + doc["text"][:offset].count("\n")
        end = line + excerpt.count("\n")
        citation = {
            "document_id": doc["id"],
            "url": doc["url"] + (f"#L{line}-L{end}" if doc["kind"] == "readme" else ""),
            "excerpt": excerpt,
            "kind": doc["kind"],
            "start_line": line,
            "end_line": end,
            "snapshot_hash": snapshot["hash"],
        }
        key = "fact:" + digest([snapshot["hash"], fact.kind, fact.claim, excerpt])[:20]
        if not any(existing["id"] == key for existing in facts):
            facts.append(
                {
                    "id": key,
                    "repo_id": snapshot["repo_id"],
                    "kind": fact.kind,
                    "claim": fact.claim,
                    "citation": citation,
                }
            )
    return {
        "repo_id": snapshot["repo_id"],
        "name": snapshot["name"],
        "role": draft.role,
        "facts": facts,
        "unknowns": draft.unknowns,
        "snapshot_hash": snapshot["hash"],
        "fetched_at": snapshot["fetched_at"],
    }, rejected


def explicit_reference(facts, target_name):
    pattern = re.compile(
        r"(?:https?://)?github\.com/" + re.escape(target_name) + r"(?=[/#)\s\]>?]|$)",
        re.I,
    )
    return any(pattern.search(fact["citation"]["excerpt"]) for fact in facts)


def ground_relations(drafts, understandings):
    repositories = {item["repo_id"]: item for item in understandings}
    facts = {fact["id"]: fact for item in understandings for fact in item["facts"]}
    result, rejected, seen = [], 0, set()
    for draft in drafts:
        pair = {draft.source, draft.target}
        evidence = [facts[key] for key in dict.fromkeys(draft.fact_ids) if key in facts]
        if (
            len(pair) != 2
            or not pair.issubset(repositories)
            or len(evidence) != len(set(draft.fact_ids))
            or {fact["repo_id"] for fact in evidence} != pair
        ):
            rejected += 1
            continue
        if draft.kind in {"references", "integrates"} and not explicit_reference(
            [fact for fact in evidence if fact["repo_id"] == draft.source],
            repositories[draft.target]["name"],
        ):
            rejected += 1
            continue
        if (
            draft.kind == "integrates"
            and repositories[draft.source]["role"] == "resource"
        ):
            rejected += 1
            continue
        # Canonicalize identity, never the prose's source/target ordering.
        endpoints = (
            sorted(pair)
            if draft.kind in {"same_problem", "complements"}
            else [draft.source, draft.target]
        )
        key = "relation:" + digest([*endpoints, draft.kind])[:20]
        if key in seen:
            continue
        seen.add(key)
        result.append(
            {
                "id": key,
                "source": draft.source,
                "target": draft.target,
                "kind": draft.kind,
                "claim": draft.claim,
                "distinction": draft.distinction,
                "basis": "documented"
                if draft.kind in {"references", "integrates"}
                else "inference",
                "fact_ids": list(dict.fromkeys(draft.fact_ids)),
            }
        )
    return result, rejected
