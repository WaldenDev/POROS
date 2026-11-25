"""User-owned constraints shared by discovery and node expansion."""

from datetime import date, datetime, timedelta, timezone
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SearchFilters(BaseModel):
    model_config = ConfigDict(extra="forbid")

    min_stars: int | None = Field(default=None, ge=0, le=1_000_000_000, strict=True)
    language: str | None = Field(default=None, max_length=40)
    pushed_days: Literal[30, 90, 180, 365] | None = None

    @field_validator("language")
    @classmethod
    def safe_language(cls, value):
        value = value.strip() if value else None
        if value and not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 +#._-]{0,39}", value):
            raise ValueError("Language must be a language name, not search qualifiers")
        return value or None


def apply_filters(query: str, filters: SearchFilters, today: date) -> str:
    qualifiers = []
    if filters.min_stars is not None:
        qualifiers.append(f"stars:>={filters.min_stars}")
    if filters.language:
        qualifiers.append(f'language:"{filters.language}"')
    if filters.pushed_days:
        cutoff = today - timedelta(days=filters.pushed_days)
        qualifiers.append(f"pushed:>={cutoff.isoformat()}")
    return " ".join([query, *qualifiers]).strip()


def matches_filters(item: dict, filters: SearchFilters, today: date) -> bool:
    if (
        filters.min_stars is not None
        and (item.get("stargazers_count") or 0) < filters.min_stars
    ):
        return False
    if (
        filters.language
        and (item.get("language") or "").casefold() != filters.language.casefold()
    ):
        return False
    if filters.pushed_days:
        try:
            pushed = datetime.fromisoformat(item.get("pushed_at") or "")
            pushed = (
                pushed.replace(tzinfo=timezone.utc) if pushed.tzinfo is None else pushed
            )
            if pushed.astimezone(timezone.utc).date() < today - timedelta(
                days=filters.pushed_days
            ):
                return False
        except (TypeError, ValueError):
            return False
    return True
