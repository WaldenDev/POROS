"""Retain explicit in-cohort document links even when the model's summary omits them."""

from copy import deepcopy
import re

from .atlas_contracts import RelationDraft, UnderstandingDraft
from .atlas_validation import ground_relations, ground_understanding

REFERENCE_VERSION = "references.1"


def retain_document_links(result, snapshots):
    result = deepcopy(result)
    items = {item["repo_id"]: item for item in result["understandings"]}
    snapshots = {snapshot["repo_id"]: snapshot for snapshot in snapshots}
    edges = {edge["id"]: edge for edge in result["relations"]}
    added_facts = 0
    found = 0
    for source in items.values():
        for target in items.values():
            if source["repo_id"] == target["repo_id"]:
                continue
            pattern = re.compile(
                r"https?://github\.com/"
                + re.escape(target["name"])
                + r"(?=[/#)\s\]>?]|$)",
                re.I,
            )
            match = next(
                (
                    (doc, match)
                    for doc in snapshots[source["repo_id"]]["documents"]
                    if (match := pattern.search(doc["text"]))
                ),
                None,
            )
            if not match:
                continue
            found += 1
            if found > 24:
                continue
            source_fact = next(
                (
                    fact
                    for fact in source["facts"]
                    if pattern.search(fact["citation"]["excerpt"])
                ),
                None,
            )
            if not source_fact:
                doc, span = match
                quote = doc["text"][max(0, span.start() - 100) : span.end() + 100]
                draft = UnderstandingDraft(
                    repo_id=source["repo_id"],
                    role=source["role"],
                    facts=[
                        {
                            "kind": "interface",
                            "claim": f"文档链接到 {target['name']}。",
                            "citation": {"document_id": doc["id"], "excerpt": quote},
                        }
                    ],
                )
                grounded, _ = ground_understanding(draft, snapshots[source["repo_id"]])
                if not grounded["facts"]:
                    continue
                source_fact = {**grounded["facts"][0], "origin": "document_link"}
                source["facts"].append(source_fact)
                added_facts += 1
            target_fact = next(
                (fact for fact in target["facts"] if fact["kind"] == "purpose"), None
            )
            if not target_fact:
                continue
            draft = RelationDraft(
                source=source["repo_id"],
                target=target["repo_id"],
                kind="references",
                claim=f"{source['name']} 的文档明确链接到 {target['name']}。",
                distinction="仅表示文档提及，不证明依赖、兼容或实际集成。",
                fact_ids=[source_fact["id"], target_fact["id"]],
            )
            grounded, _ = ground_relations([draft], list(items.values()))
            for edge in grounded:
                edges.setdefault(edge["id"], {**edge, "origin": "document_link"})
    result["relations"] = list(edges.values())
    result["reference_version"] = REFERENCE_VERSION
    result["metrics"].update(
        {
            "document_link_facts": added_facts,
            "explicit_links_found": found,
            "facts": sum(len(item["facts"]) for item in items.values()),
            "relations": len(edges),
        }
    )
    if found > 24:
        result["warnings"].append(f"发现 {found} 条文档引用，本轮最多保留 24 条。")
    return result
