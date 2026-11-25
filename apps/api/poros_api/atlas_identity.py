"""Model-relevant identity, excluding runtime timestamps and cache counters."""


def knowledge_input(items, include_links=True):
    return [
        {
            "repo_id": item["repo_id"],
            "name": item["name"],
            "role": item["role"],
            "facts": [
                fact
                for fact in item["facts"]
                if include_links or fact.get("origin") != "document_link"
            ],
            "unknowns": item.get("unknowns", []),
        }
        for item in sorted(items, key=lambda item: item["repo_id"])
    ]
