"""Append-only analysis revisions; a successful revision alone advances the scope head."""

import json
import sqlite3
from pathlib import Path

from .atlas_sources import now
from .config import get_settings


class AtlasStore:
    def __init__(self, path=None):
        self.path = Path(path or get_settings().db_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS atlas_sources (
                    hash TEXT PRIMARY KEY, repo_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS atlas_understandings (
                    cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS atlas_maps (
                    id TEXT PRIMARY KEY, scope TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS atlas_heads (
                    scope TEXT PRIMARY KEY, map_id TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS atlas_maps_scope ON atlas_maps(scope, created_at);
                CREATE TABLE IF NOT EXISTS atlas_checkpoints (
                    cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL);
            """)

    def connect(self):
        return sqlite3.connect(self.path, timeout=15)

    def snapshot(self, snapshot):
        with self.connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO atlas_sources VALUES (?, ?, ?, ?)",
                (
                    snapshot["hash"],
                    snapshot["repo_id"],
                    json.dumps(snapshot, ensure_ascii=False),
                    now(),
                ),
            )

    def understanding(self, key):
        with self.connect() as conn:
            row = conn.execute(
                "SELECT payload FROM atlas_understandings WHERE cache_key=?", (key,)
            ).fetchone()
        return json.loads(row[0]) if row else None

    def save_understanding(self, key, value):
        with self.connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO atlas_understandings VALUES (?, ?, ?)",
                (key, json.dumps(value, ensure_ascii=False), now()),
            )

    def get_map(self, key):
        with self.connect() as conn:
            row = conn.execute(
                "SELECT payload FROM atlas_maps WHERE id=?", (key,)
            ).fetchone()
        return json.loads(row[0]) if row else None

    def checkpoint(self, key):
        with self.connect() as conn:
            row = conn.execute(
                "SELECT payload FROM atlas_checkpoints WHERE cache_key=?", (key,)
            ).fetchone()
        return json.loads(row[0]) if row else None

    def save_checkpoint(self, key, value):
        # Stage successes can be reused even when the overall map is incomplete.
        with self.connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO atlas_checkpoints VALUES (?, ?, ?)",
                (key, json.dumps(value, ensure_ascii=False), now()),
            )

    def save_map(self, key, scope, value):
        with self.connect() as conn:
            previous = conn.execute(
                "SELECT map_id FROM atlas_heads WHERE scope=?", (scope,)
            ).fetchone()
            value = {
                **value,
                "supersedes": previous[0] if previous and previous[0] != key else None,
            }
            conn.execute(
                "INSERT OR IGNORE INTO atlas_maps VALUES (?, ?, ?, ?)",
                (key, scope, json.dumps(value, ensure_ascii=False), now()),
            )
            conn.execute(
                "INSERT OR REPLACE INTO atlas_heads VALUES (?, ?)", (scope, key)
            )
        return value

    def save_partial(self, value):
        """Persist a request's incomplete outcome without advancing any head."""
        with self.connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO atlas_maps VALUES (?, ?, ?, ?)",
                (
                    value["id"],
                    value["scope"],
                    json.dumps(value, ensure_ascii=False),
                    now(),
                ),
            )

    def history(self, scope):
        with self.connect() as conn:
            return [
                {"id": row[0], "created_at": row[1]}
                for row in conn.execute(
                    "SELECT id, created_at FROM atlas_maps WHERE scope=? ORDER BY created_at DESC LIMIT 20",
                    (scope,),
                )
            ]
