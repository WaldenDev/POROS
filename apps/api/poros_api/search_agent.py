from __future__ import annotations

import json
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

from .discovery_contracts import SearchBrief
from .llm import llm_provider, LLMProviderError, llm_available, request_llm_json
from .models import UserProfile
from .trace import TraceSink, emit_trace


SearchFunction = Callable[[str], list[dict[str, Any]]]
CandidateFilter = Callable[[dict[str, Any]], bool]


STRATEGY_DESCRIPTIONS: dict[str, str] = {
    "search_lightweight_artifact": "For beginners, toy projects, games, demos, and visible low-infrastructure artifacts.",
    "search_portfolio_maturity": "For portfolio-grade projects that need mature but adaptable repositories.",
    "search_deep_technical": "For advanced AI, backend, infra, observability, evaluation, and systems-oriented searches.",
    "search_product_workflow": "For full-stack, indie, domain, dashboard, SaaS, and workflow-product searches.",
    "search_broad_exploration": "For unclear needs or broad pivots where the agent should keep exploratory coverage.",
}


@dataclass(frozen=True)
class QuerySpec:
    lane: str
    terms: list[str]
    reason: str
    weight: float = 1.0
    star_min: int | None = None
    star_max: int | None = None
    pushed_after: str | None = None
    language: str | None = None
    attempt: int = 0


@dataclass(frozen=True)
class StrategyChoice:
    tool_name: str
    reason: str
    weight: float = 1.0


@dataclass(frozen=True)
class SearchDirective:
    strategy_name: str
    intent: str
    query_terms: list[str]
    star_min: int | None
    star_max: int | None
    pushed_after: str | None
    language: str | None
    avoid: list[str] = field(default_factory=list)
    adaptation_notes: list[str] = field(default_factory=list)
    reason: str = ""
    weight: float = 1.0
    round: int = 0


@dataclass
class SearchObservation:
    spec: QuerySpec
    query: str
    result_count: int
    items: list[dict[str, Any]] = field(default_factory=list)
    error: str = ""


@dataclass
class SearchCoverage:
    ok: bool
    candidate_count: int
    lane_count: int
    gaps: list[str]
    recommendation: str


@dataclass
class StrategyRun:
    tool_name: str
    reason: str
    directives: list[SearchDirective]
    observations: list[SearchObservation]
    coverage: SearchCoverage


@dataclass
class SearchAgentResult:
    items: list[dict[str, Any]]
    observations: list[SearchObservation]
    coverage: SearchCoverage
    tools: list[str]
    policy_provider: str
    selected_strategies: list[str] = field(default_factory=list)


ToolHandler = Callable[..., StrategyRun]


@dataclass(frozen=True)
class SearchTool:
    name: str
    description: str
    handler: ToolHandler


class SearchToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, SearchTool] = {}

    def register(self, name: str, description: str, handler: ToolHandler) -> None:
        self._tools[name] = SearchTool(name=name, description=description, handler=handler)

    def call(self, name: str, **kwargs: Any) -> StrategyRun:
        if name not in self._tools:
            raise KeyError(f"Search strategy tool is not registered: {name}")
        return self._tools[name].handler(**kwargs)

    def names(self) -> list[str]:
        return list(self._tools.keys())

    def describe(self) -> list[dict[str, str]]:
        return [{"name": tool.name, "description": tool.description} for tool in self._tools.values()]


def clean_term(value: str, limit: int = 64) -> str:
    text = re.sub(r"\s+", " ", value.strip())
    text = re.sub(
        r"\b(?:archived|created|forks|in|language|license|pushed|sort|stars|topic|topics):\S+",
        " ",
        text,
        flags=re.I,
    )
    return re.sub(r"\s+", " ", text).strip()[:limit]


def clean_terms(values: list[str], limit: int = 5) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        term = clean_term(str(value))
        if not term:
            continue
        key = term.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(term)
        if len(result) >= limit:
            break
    return result


def feedback_to_query_terms(feedback: list[str]) -> list[str]:
    terms: list[str] = []
    mapping = {
        "need_more_toy_aligned_candidates": ["interactive demo", "starter game", "playable"],
        "need_stronger_toy_fit": ["browser game demo", "canvas game"],
        "need_more_workflow_aligned_candidates": ["workflow dashboard", "productivity app"],
        "need_stronger_workflow_fit": ["knowledge dashboard", "personal workspace"],
        "need_more_technical_aligned_candidates": ["llm tracing", "agent evaluation", "observability"],
        "need_stronger_technical_fit": ["agent observability", "evaluation framework"],
        "need_active_repositories": ["maintained", "active"],
        "avoid_curated_lists": ["tool", "app"],
        "too_few_keep_candidates": ["starter project", "workflow tool"],
    }
    for item in feedback:
        terms.extend(mapping.get(item, [item.replace("_", " ")]))
    return clean_terms(terms, 5)


def apply_search_feedback(brief: SearchBrief, feedback: list[str] | None) -> SearchBrief:
    if not feedback:
        return brief
    feedback_terms = feedback_to_query_terms(feedback)
    if not feedback_terms:
        return brief
    return brief.model_copy(
        update={
            "query_families": clean_terms([*feedback_terms, *brief.query_families], 5),
            "fit_rubric": [*brief.fit_rubric[:4], f"Recovery feedback: {', '.join(feedback[:4])}"],
        }
    )


def bounded_float(value: Any, default: float = 1.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return max(0.4, min(1.6, parsed))


def recent_cutoff(strict: bool = False) -> str:
    year = datetime.now(timezone.utc).year
    return f"{max(2024, year - (1 if strict else 2))}-01-01"


def base_terms(pivot: str, brief: SearchBrief) -> str:
    return clean_term(pivot or brief.pivot or "developer tools")


def preferred_language(profile: UserProfile) -> str | None:
    for stack in profile.stacks:
        normalized = stack.strip()
        if normalized.lower() in {"typescript", "python", "javascript", "go", "rust", "java", "swift", "kotlin"}:
            return normalized
    return None


def compile_github_query(spec: QuerySpec) -> str:
    parts = [term for term in spec.terms if term]
    parts.append("in:name,description,readme")
    if spec.star_min is not None and spec.star_max is not None:
        parts.append(f"stars:{spec.star_min}..{spec.star_max}")
    elif spec.star_min is not None:
        parts.append(f"stars:>{spec.star_min}")
    elif spec.star_max is not None:
        parts.append(f"stars:<{spec.star_max}")
    if spec.pushed_after:
        parts.append(f"pushed:>{spec.pushed_after}")
    if spec.language:
        parts.append(f"language:{spec.language}")
    parts.append("archived:false")
    return " ".join(parts)


def directive_to_specs(directive: SearchDirective) -> list[QuerySpec]:
    terms = clean_terms(directive.query_terms, 4)
    if not terms:
        terms = ["developer tools"]
    specs: list[QuerySpec] = []
    for index, term in enumerate(terms[:3]):
        paired_terms = [terms[0], term] if index and term != terms[0] else [term]
        specs.append(
            QuerySpec(
                lane=f"{directive.strategy_name}_{directive.round}_{index + 1}",
                terms=clean_terms(paired_terms, 3),
                star_min=directive.star_min,
                star_max=directive.star_max,
                pushed_after=directive.pushed_after,
                language=directive.language,
                reason=directive.reason or directive.intent,
                weight=max(0.55, directive.weight - index * 0.08),
                attempt=directive.round,
            )
        )
    return dedupe_specs(specs)


def strategy_lightweight_artifact_directive(pivot: str, profile: UserProfile, brief: SearchBrief, reason: str) -> SearchDirective:
    base = base_terms(pivot, brief)
    artifact = clean_term(profile.intent.artifact_type)
    return SearchDirective(
        strategy_name="lightweight_artifact",
        intent="Find small, visible, low-infrastructure repositories that can inspire a toy/demo project.",
        query_terms=clean_terms([base, artifact or "interactive demo", "playable toy", "starter project"], 4),
        star_min=1,
        star_max=900,
        pushed_after=recent_cutoff(strict=True),
        language=preferred_language(profile),
        avoid=["large platform", "model training", "engine internals"],
        adaptation_notes=["If too few results, drop language and widen stars.", "If too noisy, add demo/playable/starter terms."],
        reason=reason,
        weight=1.2,
    )


def strategy_portfolio_maturity_directive(pivot: str, profile: UserProfile, brief: SearchBrief, reason: str) -> SearchDirective:
    base = base_terms(pivot, brief)
    return SearchDirective(
        strategy_name="portfolio_maturity",
        intent="Find mature but adaptable repositories that can support a strong portfolio project story.",
        query_terms=clean_terms([base, profile.intent.artifact_type or "dashboard", "case study", "portfolio project"], 4),
        star_min=50,
        star_max=6000,
        pushed_after=recent_cutoff(),
        language=preferred_language(profile),
        avoid=["giant platform rebuild", "template-only"],
        adaptation_notes=["If too few results, lower star_min and drop language.", "If too broad, add artifact or case-study terms."],
        reason=reason,
        weight=1.12,
    )


def strategy_deep_technical_directive(pivot: str, profile: UserProfile, brief: SearchBrief, reason: str) -> SearchDirective:
    base = base_terms(pivot, brief)
    return SearchDirective(
        strategy_name="deep_technical",
        intent="Find technically deep repositories with real systems, evaluation, observability, or infrastructure signal.",
        query_terms=clean_terms([base, "framework", "observability", "evaluation", *brief.query_families[:2]], 5),
        star_min=80,
        star_max=30000,
        pushed_after=recent_cutoff(),
        language=preferred_language(profile),
        avoid=["toy demo", "landing page", "template-only"],
        adaptation_notes=["If too few results, widen star range.", "If too shallow, add framework/evaluation/observability terms."],
        reason=reason,
        weight=1.15,
    )


def strategy_product_workflow_directive(pivot: str, profile: UserProfile, brief: SearchBrief, reason: str) -> SearchDirective:
    base = base_terms(pivot, brief)
    return SearchDirective(
        strategy_name="product_workflow",
        intent="Find user-facing workflow, dashboard, automation, or SaaS-like repositories that can inspire a concrete product.",
        query_terms=clean_terms([base, "workflow tool", "dashboard automation", "saas dashboard"], 4),
        star_min=10,
        star_max=4000,
        pushed_after=recent_cutoff(),
        language=preferred_language(profile),
        avoid=["raw library only", "research-only benchmark"],
        adaptation_notes=["If too few results, remove language and broaden to workflow.", "If too generic, add dashboard or automation terms."],
        reason=reason,
        weight=1.12,
    )


def strategy_broad_exploration_directive(pivot: str, profile: UserProfile, brief: SearchBrief, reason: str) -> SearchDirective:
    base = base_terms(pivot, brief)
    return SearchDirective(
        strategy_name="broad_exploration",
        intent="Keep broad recall while the user's intent is still uncertain.",
        query_terms=clean_terms([base, *brief.query_families[:4]], 5),
        star_min=5,
        star_max=12000,
        pushed_after="2024-01-01",
        language=None,
        avoid=list(profile.intent.avoid[:4]),
        adaptation_notes=["If too few results, remove recency.", "If too noisy, add artifact or profile terms."],
        reason=reason,
        weight=0.95,
    )


def dedupe_specs(specs: list[QuerySpec]) -> list[QuerySpec]:
    result: list[QuerySpec] = []
    seen: set[str] = set()
    for spec in specs:
        key = "|".join([spec.lane, " ".join(spec.terms).lower(), spec.language or "", str(spec.star_min), str(spec.star_max)])
        if key in seen or not spec.terms:
            continue
        seen.add(key)
        result.append(spec)
    return result


def bounded_int(value: Any, minimum: int | None = None, maximum: int | None = None) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    if minimum is not None:
        parsed = max(minimum, parsed)
    if maximum is not None:
        parsed = min(maximum, parsed)
    return parsed


def directive_to_dict(directive: SearchDirective) -> dict[str, Any]:
    return {
        "strategy_name": directive.strategy_name,
        "intent": directive.intent,
        "query_terms": directive.query_terms,
        "star_min": directive.star_min,
        "star_max": directive.star_max,
        "pushed_after": directive.pushed_after,
        "language": directive.language,
        "avoid": directive.avoid,
        "adaptation_notes": directive.adaptation_notes,
        "reason": directive.reason,
        "weight": directive.weight,
        "round": directive.round,
    }


def parse_directive_payload(payload: dict[str, Any], fallback: SearchDirective) -> SearchDirective:
    data = payload.get("directive") if isinstance(payload.get("directive"), dict) else payload
    query_terms = clean_terms([str(term) for term in data.get("query_terms") or []], 5)
    if not query_terms:
        query_terms = fallback.query_terms
    star_min = bounded_int(data.get("star_min"), 0, 1_000_000)
    star_max = bounded_int(data.get("star_max"), 0, 1_000_000)
    if star_min is not None and star_max is not None and star_min > star_max:
        star_min, star_max = star_max, star_min
    pushed_after = clean_term(str(data.get("pushed_after") or ""), 20) or None
    if pushed_after and not re.match(r"^\d{4}-\d{2}-\d{2}$", pushed_after):
        pushed_after = fallback.pushed_after
    language = clean_term(str(data.get("language") or ""), 32) or None
    avoid = clean_terms([str(term) for term in data.get("avoid") or []], 6)
    notes = clean_terms([str(term) for term in data.get("adaptation_notes") or []], 5)
    return SearchDirective(
        strategy_name=fallback.strategy_name,
        intent=clean_term(str(data.get("intent") or fallback.intent), 220),
        query_terms=query_terms,
        star_min=star_min if star_min is not None else fallback.star_min,
        star_max=star_max if star_max is not None else fallback.star_max,
        pushed_after=pushed_after,
        language=language,
        avoid=avoid or fallback.avoid,
        adaptation_notes=notes or fallback.adaptation_notes,
        reason=clean_term(str(data.get("reason") or fallback.reason), 220),
        weight=bounded_float(data.get("weight"), fallback.weight),
        round=fallback.round + 1,
    )


def observation_summary(observations: list[SearchObservation], coverage: SearchCoverage) -> dict[str, Any]:
    top_names: list[str] = []
    languages: dict[str, int] = defaultdict(int)
    star_values: list[int] = []
    for observation in observations:
        for item in observation.items[:4]:
            name = candidate_full_name(item)
            if name and name not in top_names:
                top_names.append(name)
            language = str(item.get("language") or "Unknown")
            languages[language] += 1
            try:
                star_values.append(int(item.get("stargazers_count") or 0))
            except (TypeError, ValueError):
                pass
    return {
        "coverage": coverage_to_dict(coverage),
        "queries": [observation_to_dict(observation) for observation in observations],
        "top_names": top_names[:8],
        "languages": dict(sorted(languages.items(), key=lambda pair: pair[1], reverse=True)[:6]),
        "star_min_seen": min(star_values) if star_values else None,
        "star_max_seen": max(star_values) if star_values else None,
    }


def llm_adjust_directive(
    directive: SearchDirective,
    observations: list[SearchObservation],
    coverage: SearchCoverage,
    profile: UserProfile,
    brief: SearchBrief,
    remaining_budget: int,
) -> SearchDirective | None:
    if not llm_available() or coverage.ok or remaining_budget <= 0:
        return None
    system = (
        "You are POROS SearchAgent adjustment policy. Adjust the SearchDirective after observing GitHub results. "
        "Return strict JSON only. Do not output GitHub qualifier syntax inside query_terms."
    )
    prompt = json.dumps(
        {
            "task": "Adjust the search directive for one more compact search batch.",
            "current_directive": directive_to_dict(directive),
            "observation_summary": observation_summary(observations, coverage),
            "user_profile": profile.model_dump(mode="json"),
            "search_brief": brief.model_dump(mode="json"),
            "remaining_budget": remaining_budget,
            "output_contract": {
                "directive": {
                    "intent": "updated intent string",
                    "query_terms": ["1-5 short search phrases, no GitHub qualifiers"],
                    "star_min": "integer or null",
                    "star_max": "integer or null",
                    "pushed_after": "YYYY-MM-DD or null",
                    "language": "language or null",
                    "avoid": ["short avoid terms"],
                    "adaptation_notes": ["why parameters changed"],
                    "reason": "short reason",
                    "weight": "number 0.4-1.6",
                }
            },
            "quality_rules": [
                "If too few candidates, broaden star range, loosen recency, drop language, or use adjacent terms.",
                "If results are noisy, add artifact/domain terms and narrow the star range.",
                "If results are too heavy for a toy/beginner request, lower star range and add demo/starter/playable terms.",
                "If results are too shallow for technical requests, add framework/evaluation/observability terms.",
                "Do not simply repeat the same directive unless it is already good.",
            ],
        },
        ensure_ascii=False,
    )
    try:
        return parse_directive_payload(request_llm_json(system, prompt), directive)
    except LLMProviderError:
        return None


def rule_adjust_directive(directive: SearchDirective, coverage: SearchCoverage, remaining_budget: int) -> SearchDirective | None:
    if coverage.ok or remaining_budget <= 0:
        return None
    star_min = None if directive.star_min is None else max(0, round(directive.star_min * 0.35))
    star_max = None if directive.star_max is None else max(directive.star_max * 2, directive.star_max + 500)
    pushed_after = "2024-01-01" if directive.pushed_after and directive.pushed_after > "2024-01-01" else None
    terms = list(directive.query_terms)
    if "too_few_candidates" in coverage.gaps and directive.strategy_name == "lightweight_artifact":
        terms = clean_terms([*terms, "demo", "starter"], 5)
    elif "too_few_candidates" in coverage.gaps:
        terms = clean_terms([*terms, "tool"], 5)
    return SearchDirective(
        strategy_name=directive.strategy_name,
        intent=directive.intent,
        query_terms=terms,
        star_min=star_min,
        star_max=int(star_max) if star_max is not None else None,
        pushed_after=pushed_after,
        language=None,
        avoid=directive.avoid,
        adaptation_notes=[*directive.adaptation_notes[:3], f"Rule adjustment for coverage gaps: {', '.join(coverage.gaps)}."],
        reason="Adjusted after observing weak search coverage.",
        weight=max(0.65, directive.weight * 0.9),
        round=directive.round + 1,
    )


def evaluate_coverage(observations: list[SearchObservation], target_count: int) -> SearchCoverage:
    names: set[str] = set()
    lanes: set[str] = set()
    non_empty = 0
    for observation in observations:
        lanes.add(observation.spec.lane)
        if observation.result_count:
            non_empty += 1
        for item in observation.items:
            full_name = item.get("full_name")
            if full_name:
                names.add(str(full_name))
    candidate_count = len(names)
    gaps: list[str] = []
    if candidate_count < max(8, min(target_count, 14)):
        gaps.append("too_few_candidates")
    if len(lanes) < 2:
        gaps.append("low_lane_diversity")
    if non_empty == 0:
        gaps.append("all_queries_empty")
    ok = not gaps or (candidate_count >= min(target_count, 20) and len(lanes) >= 2)
    return SearchCoverage(
        ok=ok,
        candidate_count=candidate_count,
        lane_count=len(lanes),
        gaps=gaps,
        recommendation="finish" if ok else "strategy_internal_relax",
    )


def candidate_full_name(item: dict[str, Any]) -> str:
    return str(item.get("full_name") or item.get("name") or "").strip()


def fuse_results(
    observations: list[SearchObservation],
    limit: int,
    candidate_filter: CandidateFilter | None = None,
) -> list[dict[str, Any]]:
    scores: dict[str, float] = defaultdict(float)
    payloads: dict[str, dict[str, Any]] = {}
    provenance: dict[str, dict[str, Any]] = defaultdict(lambda: {"lanes": [], "queries": [], "appearances": 0, "best_rank": 10_000})
    for observation in observations:
        for rank, item in enumerate(observation.items, start=1):
            name = candidate_full_name(item)
            if not name:
                continue
            if candidate_filter and not candidate_filter(item):
                continue
            scores[name] += observation.spec.weight / (60 + rank)
            payloads.setdefault(name, item)
            record = provenance[name]
            record["appearances"] += 1
            record["best_rank"] = min(record["best_rank"], rank)
            if observation.spec.lane not in record["lanes"]:
                record["lanes"].append(observation.spec.lane)
            if observation.query not in record["queries"]:
                record["queries"].append(observation.query)

    ranked = sorted(
        scores.items(),
        key=lambda pair: (pair[1], provenance[pair[0]]["appearances"], -provenance[pair[0]]["best_rank"]),
        reverse=True,
    )
    fused: list[dict[str, Any]] = []
    for name, score in ranked[:limit]:
        payload = dict(payloads[name])
        payload["_poros_search_provenance"] = {
            **provenance[name],
            "fusion_score": round(score, 5),
        }
        fused.append(payload)
    return fused


def spec_to_dict(spec: QuerySpec) -> dict[str, Any]:
    return {
        "lane": spec.lane,
        "terms": spec.terms,
        "star_min": spec.star_min,
        "star_max": spec.star_max,
        "pushed_after": spec.pushed_after,
        "language": spec.language,
        "weight": spec.weight,
        "reason": spec.reason,
        "attempt": spec.attempt,
    }


def observation_to_dict(observation: SearchObservation) -> dict[str, Any]:
    return {
        "lane": observation.spec.lane,
        "query": observation.query,
        "result_count": observation.result_count,
        "error": observation.error,
    }


def coverage_to_dict(coverage: SearchCoverage) -> dict[str, Any]:
    return {
        "ok": coverage.ok,
        "candidate_count": coverage.candidate_count,
        "lane_count": coverage.lane_count,
        "gaps": coverage.gaps,
        "recommendation": coverage.recommendation,
    }


def run_specs(search_fn: SearchFunction, specs: list[QuerySpec], query_budget: int) -> list[SearchObservation]:
    observations: list[SearchObservation] = []
    for spec in dedupe_specs(specs)[:query_budget]:
        query = compile_github_query(spec)
        try:
            items = search_fn(query)
            observations.append(SearchObservation(spec=spec, query=query, result_count=len(items), items=items))
        except Exception as exc:
            observations.append(SearchObservation(spec=spec, query=query, result_count=0, error=str(exc)[:240]))
    return observations


def execute_strategy(
    tool_name: str,
    reason: str,
    initial_directive: SearchDirective,
    search_fn: SearchFunction,
    query_budget: int,
    target_count: int,
    profile: UserProfile,
    brief: SearchBrief,
    adjuster: Callable | None = None,
    candidate_filter: CandidateFilter | None = None,
) -> StrategyRun:
    if candidate_filter:
        original_search = search_fn
        search_fn = lambda query: [item for item in original_search(query) if candidate_filter(item)]
    directives = [initial_directive]
    specs = directive_to_specs(initial_directive)
    primary_budget = max(1, min(query_budget, len(specs)))
    observations = run_specs(search_fn, specs, primary_budget)
    coverage = evaluate_coverage(observations, target_count)
    remaining = max(0, query_budget - len(observations))
    if not coverage.ok and remaining:
        adjusted = (adjuster or llm_adjust_directive)(initial_directive, observations, coverage, profile, brief, remaining)
        if adjusted is None:
            adjusted = rule_adjust_directive(initial_directive, coverage, remaining)
        if adjusted:
            directives.append(adjusted)
            observations.extend(run_specs(search_fn, directive_to_specs(adjusted), remaining))
        coverage = evaluate_coverage(observations, target_count)
    return StrategyRun(tool_name=tool_name, reason=reason, directives=directives, observations=observations, coverage=coverage)


def build_search_tool_registry(search_fn: SearchFunction) -> SearchToolRegistry:
    registry = SearchToolRegistry()
    registry.register(
        "search_lightweight_artifact",
        STRATEGY_DESCRIPTIONS["search_lightweight_artifact"],
        lambda pivot, profile, brief, query_budget, target_count, reason: execute_strategy(
            "search_lightweight_artifact",
            reason,
            strategy_lightweight_artifact_directive(pivot, profile, brief, reason),
            search_fn,
            query_budget,
            target_count,
            profile,
            brief,
        ),
    )
    registry.register(
        "search_portfolio_maturity",
        STRATEGY_DESCRIPTIONS["search_portfolio_maturity"],
        lambda pivot, profile, brief, query_budget, target_count, reason: execute_strategy(
            "search_portfolio_maturity",
            reason,
            strategy_portfolio_maturity_directive(pivot, profile, brief, reason),
            search_fn,
            query_budget,
            target_count,
            profile,
            brief,
        ),
    )
    registry.register(
        "search_deep_technical",
        STRATEGY_DESCRIPTIONS["search_deep_technical"],
        lambda pivot, profile, brief, query_budget, target_count, reason: execute_strategy(
            "search_deep_technical",
            reason,
            strategy_deep_technical_directive(pivot, profile, brief, reason),
            search_fn,
            query_budget,
            target_count,
            profile,
            brief,
        ),
    )
    registry.register(
        "search_product_workflow",
        STRATEGY_DESCRIPTIONS["search_product_workflow"],
        lambda pivot, profile, brief, query_budget, target_count, reason: execute_strategy(
            "search_product_workflow",
            reason,
            strategy_product_workflow_directive(pivot, profile, brief, reason),
            search_fn,
            query_budget,
            target_count,
            profile,
            brief,
        ),
    )
    registry.register(
        "search_broad_exploration",
        STRATEGY_DESCRIPTIONS["search_broad_exploration"],
        lambda pivot, profile, brief, query_budget, target_count, reason: execute_strategy(
            "search_broad_exploration",
            reason,
            strategy_broad_exploration_directive(pivot, profile, brief, reason),
            search_fn,
            query_budget,
            target_count,
            profile,
            brief,
        ),
    )
    return registry


def parse_llm_strategy_choices(payload: dict[str, Any], allowed_tools: set[str], max_choices: int) -> list[StrategyChoice]:
    choices: list[StrategyChoice] = []
    for item in payload.get("strategies") or []:
        if not isinstance(item, dict):
            continue
        tool_name = str(item.get("tool_name") or "").strip()
        if tool_name not in allowed_tools:
            continue
        reason = clean_term(str(item.get("reason") or STRATEGY_DESCRIPTIONS.get(tool_name, "Selected by policy.")), 180)
        choices.append(StrategyChoice(tool_name=tool_name, reason=reason, weight=bounded_float(item.get("weight"))))
        if len(choices) >= max_choices:
            break
    return dedupe_choices(choices)


def llm_strategy_choices(
    pivot: str,
    profile: UserProfile,
    brief: SearchBrief,
    tools: list[dict[str, str]],
    max_choices: int,
) -> list[StrategyChoice]:
    system = (
        "You are POROS SearchAgent policy. Select search STRATEGY tools, not low-level actions. "
        "Return strict JSON only."
    )
    prompt = json.dumps(
        {
            "task": "Choose the best GitHub search strategy tool for this user's project-discovery need.",
            "pivot": pivot,
            "search_brief": brief.model_dump(mode="json"),
            "user_profile": profile.model_dump(mode="json"),
            "available_strategy_tools": tools,
            "max_choices": max_choices,
            "output_contract": {
                "strategies": [
                    {
                        "tool_name": "one available strategy tool name",
                        "reason": "why this strategy fits the current need",
                        "weight": "number 0.4-1.6",
                    }
                ]
            },
            "quality_rules": [
                "Pick one primary strategy. Pick a second only if the intent is genuinely ambiguous.",
                "Do not decompose the search into compile/search/evaluate steps.",
                "For toy, beginner, game, demo, or visible artifact requests, prefer search_lightweight_artifact.",
                "For portfolio or resume requests, prefer search_portfolio_maturity.",
                "For advanced AI/backend/infra/research-tool requests, prefer search_deep_technical.",
                "For full-stack, indie, domain, workflow, dashboard, or SaaS requests, prefer search_product_workflow.",
                "Use search_broad_exploration only when the user's need is broad or underspecified.",
            ],
        },
        ensure_ascii=False,
    )
    payload = request_llm_json(system, prompt)
    choices = parse_llm_strategy_choices(payload, {tool["name"] for tool in tools}, max_choices)
    if not choices:
        raise LLMProviderError("LLM did not return usable search strategies.")
    return choices


def dedupe_choices(choices: list[StrategyChoice]) -> list[StrategyChoice]:
    result: list[StrategyChoice] = []
    seen: set[str] = set()
    for choice in choices:
        if choice.tool_name in seen:
            continue
        seen.add(choice.tool_name)
        result.append(choice)
    return result


def fallback_strategy_choices(profile: UserProfile, max_choices: int) -> list[StrategyChoice]:
    role = profile.role.lower()
    intent = profile.intent
    text = " ".join([intent.artifact_type, intent.motivation, intent.freeform_note, " ".join(intent.skill_goals), " ".join(intent.domain_interests)]).lower()
    if intent.project_weight == "toy" or any(term in text for term in ["game", "toy", "demo", "playable"]) or "beginner" in role:
        primary = StrategyChoice("search_lightweight_artifact", "The user needs a small visible artifact, so use the lightweight strategy.", 1.2)
    elif intent.project_weight == "ambitious" or any(term in role for term in ["agent", "backend", "infra"]) or any(term in text for term in ["agent", "rag", "benchmark", "observability", "infrastructure"]):
        primary = StrategyChoice("search_deep_technical", "The request points to deeper technical evidence.", 1.15)
    elif intent.project_weight == "portfolio" or any(term in text for term in ["resume", "portfolio", "case study"]):
        primary = StrategyChoice("search_portfolio_maturity", "The request needs mature evidence that can support a portfolio story.", 1.1)
    elif any(term in role for term in ["full", "indie", "domain", "ux"]) or any(term in text for term in ["dashboard", "workflow", "saas", "automation", "business"]):
        primary = StrategyChoice("search_product_workflow", "The request is best served by workflow/product search.", 1.1)
    else:
        primary = StrategyChoice("search_broad_exploration", "The user need is broad, so use exploratory coverage.", 1.0)

    choices = [primary]
    if max_choices > 1 and primary.tool_name != "search_broad_exploration" and intent.confidence < 45:
        choices.append(StrategyChoice("search_broad_exploration", "Intent confidence is low, so add one exploratory strategy.", 0.75))
    return choices[:max_choices]


def select_strategy_choices(
    pivot: str,
    profile: UserProfile,
    brief: SearchBrief,
    tools: list[dict[str, str]],
    query_budget: int,
) -> tuple[list[StrategyChoice], str]:
    max_choices = 1 if query_budget <= 3 else 2
    if llm_available():
        try:
            return llm_strategy_choices(pivot, profile, brief, tools, max_choices), llm_provider()
        except LLMProviderError:
            pass
    return fallback_strategy_choices(profile, max_choices), "rules"


def allocation_for_choices(choices: list[StrategyChoice], query_budget: int) -> list[int]:
    if not choices:
        return []
    if len(choices) == 1:
        return [query_budget]
    primary_budget = max(2, round(query_budget * 0.7))
    remaining = max(1, query_budget - primary_budget)
    return [primary_budget, remaining][: len(choices)]


def run_search_agent(
    pivot: str,
    profile: UserProfile,
    search_brief: SearchBrief,
    search_fn: SearchFunction,
    query_budget: int,
    candidate_limit: int,
    trace: TraceSink | None = None,
    candidate_filter: CandidateFilter | None = None,
    search_feedback: list[str] | None = None,
    registry: SearchToolRegistry | None = None,
    strategy_policy: Callable | None = None,
) -> SearchAgentResult:
    search_brief = apply_search_feedback(search_brief, search_feedback)
    registry = registry or build_search_tool_registry(search_fn)
    tools = registry.describe()
    choices, provider = (strategy_policy or select_strategy_choices)(pivot, profile, search_brief, tools, query_budget)
    emit_trace(
        trace,
        "search_agent",
        "Search Agent",
        "SearchAgent 已选择策略级搜索工具。" if profile.language == "zh" else "SearchAgent selected strategy-level search tools.",
        "completed",
        provider,
        {
            "available_tools": tools,
            "selected_strategies": [
                {"tool_name": choice.tool_name, "reason": choice.reason, "weight": choice.weight}
                for choice in choices
            ],
            "query_budget": query_budget,
            "search_feedback": search_feedback or [],
        },
    )

    runs: list[StrategyRun] = []
    for choice, budget in zip(choices, allocation_for_choices(choices, query_budget)):
        run = registry.call(
            choice.tool_name,
            pivot=pivot,
            profile=profile,
            brief=search_brief,
            query_budget=budget,
            target_count=candidate_limit,
            reason=choice.reason,
        )
        runs.append(run)
        emit_trace(
            trace,
            "search_strategy_run",
            "Search Strategy",
            f"策略 {choice.tool_name} 完成，获得 {run.coverage.candidate_count} 个候选。" if profile.language == "zh" else f"Strategy {choice.tool_name} finished with {run.coverage.candidate_count} candidates.",
            "completed",
            choice.tool_name,
            {
                "reason": run.reason,
                "directives": [directive_to_dict(directive) for directive in run.directives],
                "coverage": coverage_to_dict(run.coverage),
                "queries": [observation_to_dict(observation) for observation in run.observations],
            },
        )

    observations = [observation for run in runs for observation in run.observations]
    fused = fuse_results(observations, candidate_limit, candidate_filter)
    coverage = evaluate_coverage(observations, candidate_limit)
    emit_trace(
        trace,
        "search_fusion_done",
        "Search Fusion",
        f"SearchAgent 融合出 {len(fused)} 个候选仓库。" if profile.language == "zh" else f"SearchAgent fused {len(fused)} candidate repositories.",
        "completed",
        provider,
        {
            "candidate_count": len(fused),
            "coverage": coverage_to_dict(coverage),
            "selected_strategies": [choice.tool_name for choice in choices],
        },
    )
    return SearchAgentResult(
        items=fused,
        observations=observations,
        coverage=coverage,
        tools=registry.names(),
        policy_provider=provider,
        selected_strategies=[choice.tool_name for choice in choices],
    )
