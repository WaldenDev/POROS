"""Evidence validation and conservative non-LLM relationship fallback."""

import re
from .expansion_contracts import ExpansionRelation, RelationEvidence

GENERIC = {
    "ai",
    "art",
    "tools",
    "open-source",
    "awesome",
    "python",
    "rust",
    "javascript",
    "typescript",
    "app",
    "application",
    "the",
    "and",
    "for",
    "with",
    "from",
    "your",
    "that",
    "this",
    "written",
    "source",
    "open",
}


def documents(repo, readme):
    url = "https://github.com/" + repo["full_name"]
    return [
        RelationEvidence(
            kind="description", url=url, excerpt=(repo.get("description") or "")[:2000]
        ),
        RelationEvidence(
            kind="topics", url=url, excerpt=", ".join(repo.get("topics") or [])
        ),
        RelationEvidence(kind="readme", url=url + "#readme", excerpt=readme),
    ]


def verified_quote(quote, docs):
    for doc in docs:
        if quote and quote in doc.excerpt:
            return doc.model_copy(update={"excerpt": quote})
    return None


def reference_evidence(source, candidate, source_docs, candidate_docs):
    for docs, target in [
        (source_docs, candidate["full_name"]),
        (candidate_docs, source["full_name"]),
    ]:
        pattern = re.compile(
            r"https://github\.com/" + re.escape(target) + r'(?=$|[\s/#)\]>"?])', re.I
        )
        for doc in docs:
            match = pattern.search(doc.excerpt)
            if match:
                return doc.model_copy(
                    update={
                        "excerpt": doc.excerpt[
                            max(0, match.start() - 100) : match.end() + 160
                        ]
                    }
                )
    return None


def fallback_relation(source, candidate, source_docs, candidate_docs, mode):
    reference = reference_evidence(source, candidate, source_docs, candidate_docs)
    shared = (
        set(source.get("topics") or []) & set(candidate.get("topics") or [])
    ) - GENERIC

    def words(repo):
        return (
            set(re.findall(r"[a-z][a-z-]{3,}", (repo.get("description") or "").lower()))
            - GENERIC
        )

    overlap = words(source) & words(candidate)
    if mode == "ecosystem" and not reference:
        return None
    if mode != "ecosystem" and len(shared) + len(overlap) < (
        2 if mode == "alternatives" else 1
    ):
        return None
    evidence = (
        [reference]
        if reference
        else [
            doc.model_copy(update={"excerpt": doc.excerpt[:500]})
            for doc in [
                source_docs[0],
                candidate_docs[0],
                source_docs[1],
                candidate_docs[1],
            ]
            if doc.excerpt
        ]
    )
    return ExpansionRelation(
        source_id=str(source["id"]),
        source_name=source["full_name"],
        mode=mode,
        basis="documented_reference" if reference else "inference",
        provider="rules",
        reason="仓库文档明确引用对方；这不等于已验证兼容或依赖关系。"
        if reference
        else "描述或主题存在交集（"
        + ", ".join(sorted(shared | overlap)[:4])
        + "）；仅为待核实的关联线索。",
        evidence=evidence,
    )
